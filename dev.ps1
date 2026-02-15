$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$vendorDir = Join-Path $root "web\\vendor"
$driverDir = Join-Path $root "web\\driver"
$customerDir = Join-Path $root "web\\customer"

$dbPath = Join-Path $backendDir "rova.db"
$dbPathUri = ($dbPath -replace "\\","/")
$sqliteUrl = "sqlite:///$dbPathUri"
$apiBase = "http://127.0.0.1:5000"
$healthUrl = "$apiBase/health"

function Ensure-EnvFile {
  param([string]$dir)
  $envPath = Join-Path $dir ".env"
  $line = "VITE_API_BASE_URL=$apiBase"
  if (!(Test-Path $envPath)) {
    Set-Content -Path $envPath -Value $line -Encoding ASCII
    return
  }
  $lines = Get-Content $envPath
  $updated = $false
  $newLines = $lines | ForEach-Object {
    if ($_ -match "^VITE_API_BASE_URL=") {
      $updated = $true
      return $line
    }
    $_
  }
  if (-not $updated) {
    $newLines += $line
  }
  Set-Content -Path $envPath -Value $newLines -Encoding ASCII
}

function Start-AppWindow {
  param(
    [string]$title,
    [string]$workingDir,
    [string]$command
  )
  Write-Host ""
  Write-Host "==> $title"
  Write-Host $command
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $workingDir -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $command)
}

function Stop-Port($port) {
  $existing = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }
  if ($existing) {
    $pids = $existing | Select-Object -ExpandProperty OwningProcess -Unique
    Write-Host "Port $port in use by PID(s): $($pids -join ', '). Stopping..."
    foreach ($procId in $pids) {
      Stop-Process -Id $procId -Force
    }
  }
}

function Wait-For-Health {
  param([int]$timeoutSeconds = 60)
  Write-Host ""
  Write-Host "Waiting for backend health at $healthUrl ..."
  $elapsed = 0
  while ($elapsed -lt $timeoutSeconds) {
    $code = ""
    try {
      $code = & curl.exe -s -o NUL -w "%{http_code}" $healthUrl
    } catch {
      $code = ""
    }
    if ($code -eq "200") {
      Write-Host "Backend is healthy (HTTP 200)."
      return $true
    }
    if (($elapsed % 5) -eq 0) {
      Write-Host "Waiting... ($elapsed s)"
    }
    Start-Sleep -Seconds 1
    $elapsed += 1
  }
  Write-Host "Backend health check timed out." -ForegroundColor Red
  return $false
}

Write-Host "ROVA Dev Launcher"
Write-Host "Backend: $apiBase"
Write-Host "Vendor:  http://127.0.0.1:5174"
Write-Host "Driver:  http://127.0.0.1:5175"
Write-Host "Customer:http://127.0.0.1:5176"

# Stop any existing servers on required ports
Write-Host ""
Stop-Port 5000
Stop-Port 5174
Stop-Port 5175
Stop-Port 5176

# Ensure .env files for Vite apps
Ensure-EnvFile $vendorDir
Ensure-EnvFile $driverDir
Ensure-EnvFile $customerDir

Start-Process -FilePath "powershell.exe" -WorkingDirectory $backendDir -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "$backendDir\\run-backend-dev.ps1",
  "-DatabaseUrl",
  $sqliteUrl
)

if (Wait-For-Health -timeoutSeconds 60) {
$vendorCmd = @"
Set-Location "$vendorDir"
if (-not (Test-Path ".\node_modules")) { npm install }
`$env:VITE_API_BASE_URL = "$apiBase"
npm run dev -- --port 5174
"@
$driverCmd = @"
Set-Location "$driverDir"
if (-not (Test-Path ".\node_modules")) { npm install }
`$env:VITE_API_BASE_URL = "$apiBase"
npm run dev -- --port 5175
"@
$customerCmd = @"
Set-Location "$customerDir"
if (-not (Test-Path ".\node_modules")) { npm install }
`$env:VITE_API_BASE_URL = "$apiBase"
npm run dev -- --port 5176
"@

  Start-AppWindow "Vendor (Vite)" $vendorDir $vendorCmd
  Start-AppWindow "Driver (Vite)" $driverDir $driverCmd
  Start-AppWindow "Customer (Vite)" $customerDir $customerCmd
}

Write-Host ""
Write-Host "Summary:"
Write-Host "Backend:  http://127.0.0.1:5000/health"
Write-Host "Vendor:   http://127.0.0.1:5174"
Write-Host "Driver:   http://127.0.0.1:5175"
Write-Host "Customer: http://127.0.0.1:5176"
Write-Host ""
Write-Host "Curl checks:"
Write-Host "curl.exe -i $healthUrl"
Write-Host "curl.exe -i $apiBase/api/public/vendors"
