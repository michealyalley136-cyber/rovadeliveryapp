param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"

Write-Host "=== BACKEND ==="

# Activate venv first
. .\venv\Scripts\Activate.ps1

# Debug python resolution
where.exe python
python -V

# Env vars (PowerShell style)
$env:FLASK_APP = "app"
$env:FLASK_ENV = "production"
$env:DATABASE_URL = $DatabaseUrl

Write-Host "FLASK_APP=$env:FLASK_APP"
Write-Host "FLASK_ENV=$env:FLASK_ENV"
Write-Host "DATABASE_URL=$env:DATABASE_URL"

# Run migrations + start server
python -m flask db upgrade
python run.py
