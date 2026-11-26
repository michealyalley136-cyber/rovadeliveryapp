import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isIP } from "node:net";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const MAGIC = Buffer.from("ROVABK01", "ascii");
const FORMAT_VERSION = 1;
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;
const ALGORITHM = "aes-256-gcm";
const DEFAULT_STORAGE_WARNING_BYTES = 4 * 1024 ** 3;
const MAX_KEY_ID_BYTES = 255;
export const BACKUP_002_TEST_PREFIX = "backup-002-tests/";

function requireValue(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInteger(env, name, fallback, maximum = 365) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer`);
  }
  const value = Number(raw);
  if (value < 1 || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}

function decodeEncryptionKey(value) {
  let key;
  try {
    key = Buffer.from(value, "base64url");
  } catch {
    throw new Error("BACKUP_ENCRYPTION_KEY must be base64url encoded");
  }
  if (key.length !== 32 || key.toString("base64url") !== value.replace(/=+$/, "")) {
    throw new Error("BACKUP_ENCRYPTION_KEY must encode exactly 32 bytes as base64url");
  }
  return key;
}

export function validateBackupEnvironment(env = process.env) {
  if (env.BACKUP_RETENTION_COUNT !== undefined) {
    throw new Error("BACKUP_RETENTION_COUNT is no longer supported; automatic retention is disabled");
  }
  const environment = requireValue(env, "BACKUP_ENVIRONMENT");
  if (environment !== "staging" && environment !== "production") {
    throw new Error("BACKUP_ENVIRONMENT must be exactly staging or production");
  }

  const keyId = requireValue(env, "BACKUP_ENCRYPTION_KEY_ID");
  if (Buffer.byteLength(keyId) > MAX_KEY_ID_BYTES || !/^[A-Za-z0-9._-]+$/.test(keyId)) {
    throw new Error("BACKUP_ENCRYPTION_KEY_ID must be at most 255 safe ASCII bytes");
  }

  const key = decodeEncryptionKey(requireValue(env, "BACKUP_ENCRYPTION_KEY"));
  if (
    env.IDENTITY_NOTIFICATION_ENCRYPTION_KEY &&
    env.IDENTITY_NOTIFICATION_ENCRYPTION_KEY === env.BACKUP_ENCRYPTION_KEY
  ) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY must be distinct from IDENTITY_NOTIFICATION_ENCRYPTION_KEY",
    );
  }

  return {
    environment,
    key,
    keyId,
    storageWarningBytes: parsePositiveInteger(
      env,
      "BACKUP_STORAGE_WARNING_BYTES",
      DEFAULT_STORAGE_WARNING_BYTES,
      10 * 1024 ** 3,
    ),
  };
}

function postgresEnvironment(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgresql:// or postgres://");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(url.username);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!database || host.length === 0 || !user) {
    throw new Error("DATABASE_URL must include hostname, username, and database");
  }

  const sslMode = url.searchParams.get("sslmode");
  const env = {
    PGHOST: host,
    PGPORT: url.port || "5432",
    PGUSER: user,
    PGDATABASE: database,
    PGPASSWORD: decodeURIComponent(url.password),
  };
  if (sslMode) env.PGSSLMODE = sslMode;
  return { env, database, host, user };
}

function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  const hostAddress = address.split("/")[0];
  if (isIP(hostAddress) === 4) return ipv4Parts(hostAddress)[0] === 127;
  return isIP(hostAddress) === 6 &&
    (hostAddress.toLowerCase() === "::1" || hostAddress.toLowerCase() === "0:0:0:0:0:0:0:1");
}

function ipv4Parts(address) {
  return address.split(".").map(Number);
}

const restoreIdentityQuery = `
SELECT json_build_object(
  'database', current_database(),
  'user', current_user,
  'serverAddress', inet_server_addr()::text,
  'inRecovery', pg_is_in_recovery(),
  'hasUserObjects',
    EXISTS (
      SELECT 1 FROM pg_namespace
      WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public')
        AND nspname NOT LIKE 'pg_toast%'
        AND nspname NOT LIKE 'pg_temp_%'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    )
    OR EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    )
    OR EXISTS (
      SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typtype <> 'p'
    )
)::text
`;

async function verifyIsolatedRestoreTarget(commandRunner, target, env) {
  let identity;
  try {
    const result = await commandRunner(
      env.PSQL_BIN?.trim() || "psql",
      ["-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", restoreIdentityQuery],
      { env: target.env },
    );
    identity = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("Unable to verify the isolated restore database identity.");
  }

  if (
    !identity ||
    typeof identity !== "object" ||
    identity.database !== target.database ||
    identity.user !== target.user ||
    !isLoopbackAddress(identity.serverAddress) ||
    identity.inRecovery !== false ||
    identity.hasUserObjects !== false
  ) {
    throw new Error("Restore target must be an empty local PostgreSQL database with a verified identity.");
  }
}

export function validateStagingConfiguration(env = process.env) {
  const config = validateBackupEnvironment(env);
  if (config.environment !== "staging") {
    throw new Error("Backup execution requires BACKUP_ENVIRONMENT=staging");
  }
  if (env.RAILWAY_PROJECT_NAME !== "keen-contentment" || env.RAILWAY_ENVIRONMENT_NAME !== "staging") {
    throw new Error("Backup execution requires the keen-contentment staging environment");
  }
  if (requireValue(env, "R2_BUCKET") !== "rova-ghana-db-backups") {
    throw new Error("Backup execution requires the staging R2 bucket");
  }
  if ((env.BACKUP_STORAGE_DRIVER?.trim() || "r2") !== "r2") {
    throw new Error("Backup execution requires R2 storage");
  }
  requireValue(env, "R2_ACCESS_KEY_ID");
  requireValue(env, "R2_SECRET_ACCESS_KEY");
  let endpoint;
  try {
    endpoint = new URL(requireValue(env, "R2_ENDPOINT"));
  } catch {
    throw new Error("R2_ENDPOINT must be a valid HTTPS URL");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port ||
      endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
      !/^[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)) {
    throw new Error("R2_ENDPOINT must be an official bare HTTPS R2 account endpoint");
  }
  const databaseUrl = requireValue(env, "DATABASE_URL");
  const { env: pgEnv } = postgresEnvironment(databaseUrl);
  if (env.PGHOSTADDR || env.PGSERVICE || env.PGSERVICEFILE) {
    throw new Error("PGHOSTADDR, PGSERVICE, and PGSERVICEFILE must be unset for staging execution");
  }
  const expectedHost = requireValue(env, "BACKUP_STAGING_DATABASE_HOST").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.railway\.internal$/.test(expectedHost) ||
      pgEnv.PGHOST.toLowerCase() !== expectedHost) {
    throw new Error("DATABASE_URL must use the approved staging private hostname");
  }
  if (env.BACKUP_TEST_PREFIX !== undefined) {
    throw new Error("BACKUP_TEST_PREFIX must be unset for staging execution");
  }
  return config;
}

function requireStagingAuthorization(env) {
  if (env.BACKUP_EXECUTION_AUTHORIZATION !== "STAGING_ONE_TIME_APPROVED") {
    throw new Error("BACKUP_EXECUTION_AUTHORIZATION=STAGING_ONE_TIME_APPROVED is required");
  }
}

export function defaultCommandRunner(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env };
    for (const [name, value] of Object.entries(options.env ?? {})) {
      if (value === undefined) delete childEnv[name];
      else childEnv[name] = value;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout.on("data", (chunk) => {
      if (stdoutBytes < 64 * 1024) stdout.push(chunk);
      stdoutBytes += chunk.length;
    });
    child.stderr.on("data", (chunk) => {
      if (stderrBytes < 64 * 1024) stderr.push(chunk);
      stderrBytes += chunk.length;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
        return;
      }
      reject(
        new Error(
          `${command} failed with ${code === null ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
  });
}

async function secureTempDirectory(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  await chmod(directory, 0o700);
  return directory;
}

export async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function encryptionHeader(keyId, iv) {
  const keyIdBuffer = Buffer.from(keyId, "utf8");
  const header = Buffer.allocUnsafe(8 + 1 + 1 + 2 + keyIdBuffer.length + IV_BYTES);
  let offset = 0;
  MAGIC.copy(header, offset);
  offset += MAGIC.length;
  header.writeUInt8(FORMAT_VERSION, offset++);
  header.writeUInt8(1, offset++);
  header.writeUInt16BE(keyIdBuffer.length, offset);
  offset += 2;
  keyIdBuffer.copy(header, offset);
  offset += keyIdBuffer.length;
  iv.copy(header, offset);
  return header;
}

export async function encryptFile(inputPath, outputPath, { key, keyId }) {
  const iv = randomBytes(IV_BYTES);
  const header = encryptionHeader(keyId, iv);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(header);

  const output = await open(outputPath, "w", 0o600);
  await output.write(header, 0, header.length, 0);
  await output.close();

  await pipeline(createReadStream(inputPath), cipher, createWriteStream(outputPath, { flags: "a" }));
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath, { flags: "a" });
    stream.end(cipher.getAuthTag(), (error) => (error ? reject(error) : resolve()));
  });
  return { algorithm: ALGORITHM, keyId };
}

async function readEncryptionHeader(inputPath) {
  const metadata = await stat(inputPath);
  if (metadata.size < MAGIC.length + 1 + 1 + 2 + IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Encrypted backup is truncated");
  }

  const file = await open(inputPath, "r");
  try {
    const prefixLength = MAGIC.length + 1 + 1 + 2;
    const prefix = Buffer.alloc(prefixLength);
    await file.read(prefix, 0, prefix.length, 0);
    if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error("Backup encryption header is invalid");
    }
    if (prefix.readUInt8(MAGIC.length) !== FORMAT_VERSION || prefix.readUInt8(MAGIC.length + 1) !== 1) {
      throw new Error("Backup encryption version is not supported");
    }
    const keyIdLength = prefix.readUInt16BE(MAGIC.length + 2);
    if (keyIdLength === 0 || keyIdLength > MAX_KEY_ID_BYTES) {
      throw new Error("Backup encryption key identifier is invalid");
    }

    const remainderLength = keyIdLength + IV_BYTES;
    if (metadata.size < prefixLength + remainderLength + AUTH_TAG_BYTES) {
      throw new Error("Encrypted backup is truncated");
    }
    const remainder = Buffer.alloc(remainderLength);
    await file.read(remainder, 0, remainder.length, prefixLength);
    const header = Buffer.concat([prefix, remainder]);
    const keyId = remainder.subarray(0, keyIdLength).toString("utf8");
    const iv = remainder.subarray(keyIdLength);
    const authTag = Buffer.alloc(AUTH_TAG_BYTES);
    await file.read(authTag, 0, AUTH_TAG_BYTES, metadata.size - AUTH_TAG_BYTES);
    return {
      header,
      keyId,
      iv,
      authTag,
      ciphertextStart: header.length,
      ciphertextEnd: metadata.size - AUTH_TAG_BYTES - 1,
    };
  } finally {
    await file.close();
  }
}

export async function decryptFile(inputPath, outputPath, { key, expectedKeyId }) {
  const encrypted = await readEncryptionHeader(inputPath);
  if (encrypted.keyId !== expectedKeyId) {
    throw new Error(
      `Encrypted backup requires key ${encrypted.keyId}, but ${expectedKeyId} was supplied`,
    );
  }
  const decipher = createDecipheriv(ALGORITHM, key, encrypted.iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAAD(encrypted.header);
  decipher.setAuthTag(encrypted.authTag);

  await pipeline(
    createReadStream(inputPath, {
      start: encrypted.ciphertextStart,
      end: encrypted.ciphertextEnd,
    }),
    decipher,
    createWriteStream(outputPath, { mode: 0o600, flags: "wx" }),
  );
  return { algorithm: ALGORITHM, keyId: encrypted.keyId };
}

function normalizeMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
}

export class R2Storage {
  constructor(env) {
    this.bucket = requireValue(env, "R2_BUCKET");
    this.client = new S3Client({
      region: env.R2_REGION?.trim() || "auto",
      endpoint: requireValue(env, "R2_ENDPOINT"),
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireValue(env, "R2_ACCESS_KEY_ID"),
        secretAccessKey: requireValue(env, "R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async put({ key, filePath, size, metadata }) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: "application/octet-stream",
        Metadata: metadata,
        IfNoneMatch: "*",
      }),
    );
  }

  async head(key) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        size: result.ContentLength,
        metadata: normalizeMetadata(result.Metadata),
        etag: result.ETag,
      };
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return null;
      throw error;
    }
  }

  async download(key, outputPath) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("R2 download returned no body");
    await pipeline(
      result.Body,
      createWriteStream(outputPath, { mode: 0o600, flags: "wx" }),
    );
  }

  async list(prefix) {
    const objects = [];
    let continuationToken;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of result.Contents ?? []) {
        if (object.Key) {
          objects.push({
            key: object.Key,
            size: object.Size ?? 0,
            lastModified: object.LastModified?.toISOString() ?? "",
          });
        }
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }

  async delete(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export class FilesystemStorage {
  constructor(root) {
    if (!root) throw new Error("BACKUP_TEST_STORAGE_DIR is required for filesystem test storage");
    this.root = path.resolve(root);
  }

  async objectPath(key) {
    const fullPath = path.resolve(this.root, key);
    if (!fullPath.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Filesystem storage key escapes its root");
    }
    return fullPath;
  }

  async put({ key, filePath, size, metadata }) {
    const outputPath = await this.objectPath(key);
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    await pipeline(
      createReadStream(filePath),
      createWriteStream(outputPath, { mode: 0o600, flags: "wx" }),
    );
    await writeFile(`${outputPath}.metadata`, JSON.stringify({ size, metadata }), {
      mode: 0o600,
      flag: "wx",
    });
  }

  async head(key) {
    const outputPath = await this.objectPath(key);
    try {
      const saved = JSON.parse(await readFile(`${outputPath}.metadata`, "utf8"));
      return { key, size: saved.size, metadata: normalizeMetadata(saved.metadata), etag: "" };
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async download(key, outputPath) {
    const storedPath = await this.objectPath(key);
    await pipeline(
      createReadStream(storedPath),
      createWriteStream(outputPath, { mode: 0o600, flags: "wx" }),
    );
  }

  async list(prefix) {
    const objects = [];
    const { readdir } = await import("node:fs/promises");
    const walk = async (directory) => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (error?.code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (!entry.name.endsWith(".metadata")) {
          const relative = path.relative(this.root, fullPath).split(path.sep).join("/");
          if (relative.startsWith(prefix)) {
            const metadata = await stat(fullPath);
            objects.push({
              key: relative,
              size: metadata.size,
              lastModified: metadata.mtime.toISOString(),
            });
          }
        }
      }
    };
    await walk(this.root);
    return objects;
  }

  async delete(key) {
    const storedPath = await this.objectPath(key);
    await Promise.all([rm(storedPath), rm(`${storedPath}.metadata`)]);
  }
}

export function createStorage(env = process.env) {
  const driver = env.BACKUP_STORAGE_DRIVER?.trim() || "r2";
  if (driver === "filesystem") {
    if (env.NODE_ENV === "production") {
      throw new Error("Filesystem backup storage is test-only and forbidden in production");
    }
    return new FilesystemStorage(requireValue(env, "BACKUP_TEST_STORAGE_DIR"));
  }
  if (driver !== "r2") {
    throw new Error("BACKUP_STORAGE_DRIVER must be r2 or filesystem");
  }
  return new R2Storage(env);
}

export async function cleanupBackupTestPrefix(storage, objectKeys) {
  if (!Array.isArray(objectKeys) || objectKeys.length === 0) {
    throw new Error("Cleanup requires explicit test object keys");
  }
  const keys = [...new Set(objectKeys)];
  const prefix = `${BACKUP_002_TEST_PREFIX}rova/postgres/staging/daily/`;
  if (keys.some((key) => !key.startsWith(prefix) || key.includes("..") || !key.endsWith(".dump.custom.enc"))) {
    throw new Error("Cleanup key is outside the backup test prefix");
  }
  for (const key of keys) await storage.delete(key);
  return keys;
}

function safeRunId(runId) {
  const value = runId || randomBytes(6).toString("hex");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(value)) {
    throw new Error("BACKUP_RUN_ID may contain only safe identifier characters");
  }
  return value;
}

function objectKey(environment, now, runId, prefix = "") {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "");
  return `${prefix}rova/postgres/${environment}/daily/${timestamp}-${safeRunId(runId)}-${randomBytes(16).toString("hex")}.dump.custom.enc`;
}

function emit(event, details = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      component: "rova-postgres-backup",
      event,
      ...details,
    }),
  );
}

async function retry(operation, attempts, onRetry) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      onRetry?.(attempt, delay, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function verifyUploadedObject(storage, key, encryptedPath, expectedMetadata) {
  const uploadInfo = await storage.head(key);
  if (!uploadInfo) throw new Error("R2 upload verification failed: object is missing");
  if (uploadInfo.size !== expectedMetadata.size) {
    throw new Error("R2 upload verification failed: object size mismatch");
  }
  const metadata = normalizeMetadata(uploadInfo.metadata);
  for (const [name, value] of Object.entries(expectedMetadata.metadata)) {
    if (metadata[name] !== value) {
      throw new Error(`R2 upload verification failed: ${name} metadata mismatch`);
    }
  }

  const downloaded = `${encryptedPath}.verify`;
  let uploadedHash;
  try {
    await storage.download(key, downloaded);
    uploadedHash = await hashFile(downloaded);
  } finally {
    await rm(downloaded, { force: true });
  }
  if (uploadedHash !== expectedMetadata.metadata["sha256-hex"]) {
    throw new Error("R2 upload verification failed: SHA-256 mismatch");
  }
}

async function verifyPostgresVersion(commandRunner, dumpBin, pgEnv, cwd) {
  const client = await commandRunner(dumpBin, ["--version"], { cwd, env: {} });
  const match = /^pg_dump \(PostgreSQL\) (\d+)(?:\.(\d+))?/.exec(client.stdout.trim());
  if (!match) throw new Error("Unable to determine pg_dump client version");
  const major = Number(match[1]);
  const clientVersion = major >= 10 ? major * 10000 : major * 10000 + Number(match[2] ?? 0) * 100;
  const server = await commandRunner("psql", ["-X", "-w", "-A", "-t", "-c", "SHOW server_version_num"], {
    cwd,
    env: pgEnv,
  });
  const value = server.stdout.trim();
  if (!/^\d+$/.test(value) || Number(value) < 90000) {
    throw new Error("Unable to determine PostgreSQL server version");
  }
  const serverVersion = Number(value);
  const serverMajor = serverVersion >= 100000
    ? Math.floor(serverVersion / 10000) * 10000
    : Math.floor(serverVersion / 100) * 100;
  if (serverMajor > clientVersion) {
    throw new Error(`PostgreSQL server version ${serverVersion} exceeds pg_dump client support`);
  }
  return { serverVersion, clientMajor: major };
}

export async function runBackup({
  env = process.env,
  storage,
  commandRunner = defaultCommandRunner,
  now = new Date(),
  tempRoot,
  testPrefix,
} = {}) {
  requireStagingAuthorization(env);
  const config = validateStagingConfiguration(env);
  storage ??= createStorage(env);
  if (testPrefix !== undefined && testPrefix !== BACKUP_002_TEST_PREFIX) {
    throw new Error(`testPrefix must be exactly ${BACKUP_002_TEST_PREFIX}`);
  }
  const databaseUrl = requireValue(env, "DATABASE_URL");
  const { env: pgEnv } = postgresEnvironment(databaseUrl);
  const runId = safeRunId(env.BACKUP_RUN_ID);
  const rootPrefix = testPrefix ?? "";
  const prefix = `${rootPrefix}rova/postgres/${config.environment}/daily/`;
  const backupKey = objectKey(config.environment, now, runId, rootPrefix);
  const workDirectory = tempRoot
    ? await mkdtemp(path.join(tempRoot, "rova-backup-"))
    : await secureTempDirectory("rova-backup-");
  if (tempRoot) await chmod(workDirectory, 0o700);
  const dumpPath = path.join(workDirectory, "database.dump.custom");
  const encryptedPath = path.join(workDirectory, "database.dump.custom.enc");

  emit("started", { runId, environment: config.environment });
  try {
    const dumpBin = env.PG_DUMP_BIN?.trim() || "pg_dump";
    const versions = await verifyPostgresVersion(commandRunner, dumpBin, pgEnv, workDirectory);
    emit("postgres_version_verified", { runId, ...versions });
    await commandRunner(
      dumpBin,
      [
        "--format=custom",
        "--compress=9",
        "--no-password",
        "--no-owner",
        "--no-privileges",
        `--file=${dumpPath}`,
      ],
      { env: { ...pgEnv }, cwd: workDirectory },
    );
    await chmod(dumpPath, 0o600);
    const dumpSize = (await stat(dumpPath)).size;
    if (dumpSize === 0) throw new Error("pg_dump produced an empty backup");

    await commandRunner(env.PG_RESTORE_BIN?.trim() || "pg_restore", ["--list", dumpPath], {
      env: {},
      cwd: workDirectory,
    });
    const dumpSha256 = await hashFile(dumpPath);
    await encryptFile(dumpPath, encryptedPath, config);
    const encryptedSize = (await stat(encryptedPath)).size;
    const encryptedSha256 = await hashFile(encryptedPath);
    const metadata = {
      "environment": config.environment,
      "format": "pg-dump-custom",
      "encryption": ALGORITHM,
      "key-id": config.keyId,
      "sha256-hex": encryptedSha256,
      "dump-sha256-hex": dumpSha256,
      "dump-bytes": String(dumpSize),
      "created-at": now.toISOString(),
    };
    const upload = { size: encryptedSize, metadata };
    const uploadAttempts = parsePositiveInteger(env, "BACKUP_UPLOAD_ATTEMPTS", 3, 10);

    await retry(
      async () => {
        try {
          await storage.put({ key: backupKey, filePath: encryptedPath, ...upload });
        } catch (error) {
          if (error?.$metadata?.httpStatusCode !== 412 && error?.code !== "EEXIST") throw error;
        }
        await verifyUploadedObject(storage, backupKey, encryptedPath, upload);
      },
      uploadAttempts,
      (attempt, delay) =>
        emit("upload_retry", {
          runId,
          environment: config.environment,
          attempt,
          delayMs: delay,
        }),
    );

    const allObjects = (await storage.list(prefix)).filter((object) =>
      object.key.startsWith(prefix),
    );
    const storageBytes = allObjects.reduce((total, object) => total + object.size, 0);
    if (storageBytes >= config.storageWarningBytes) {
      emit("storage_warning", {
        environment: config.environment,
        storedBytes: storageBytes,
        warningBytes: config.storageWarningBytes,
      });
    }

    emit("succeeded", {
      runId,
      environment: config.environment,
      objectKey: backupKey,
      dumpBytes: dumpSize,
      encryptedBytes: encryptedSize,
      storedBytesBeforeRetention: storageBytes,
      deletedCount: 0,
    });
    return {
      runId,
      environment: config.environment,
      objectKey: backupKey,
      dumpSize,
      encryptedSize,
      dumpSha256,
      encryptedSha256,
      deleted: [],
      storageBytes,
    };
  } catch (error) {
    emit("failed", {
      runId,
      environment: config.environment,
      objectKey: backupKey,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

export async function runRestore({
  env = process.env,
  storage = createStorage(env),
  commandRunner = defaultCommandRunner,
  tempRoot,
  testPrefix,
} = {}) {
  if (env.RESTORE_TARGET_MODE !== "isolated") {
    throw new Error("RESTORE_TARGET_MODE=isolated is required; live restore targets are unsupported.");
  }
  if (env.RESTORE_ISOLATED_CONFIRM !== "I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE") {
    throw new Error("Explicit confirmation of an empty local restore database is required.");
  }
  if (testPrefix !== undefined && testPrefix !== BACKUP_002_TEST_PREFIX) {
    throw new Error(`testPrefix must be exactly ${BACKUP_002_TEST_PREFIX}`);
  }
  const config = validateBackupEnvironment(env);
  const objectKeyValue = requireValue(env, "BACKUP_OBJECT_KEY");
  const expectedPrefix = `${testPrefix ?? ""}rova/postgres/${config.environment}/daily/`;
  if (!objectKeyValue.startsWith(expectedPrefix) || objectKeyValue.includes("..")) {
    throw new Error("BACKUP_OBJECT_KEY must belong to the selected environment prefix");
  }
  const databaseUrl = requireValue(env, "RESTORE_TARGET_DATABASE_URL");
  const { env: pgEnv, database, host, user } = postgresEnvironment(databaseUrl);
  if (!isLoopbackAddress(host)) {
    throw new Error("Restore target URL must use a literal loopback address.");
  }
  if (!/^rova_restore_[a-z0-9_]{1,48}$/i.test(database)) {
    throw new Error("Restore target database name must use the rova_restore_ prefix.");
  }
  const target = {
    database,
    user,
    env: {
      ...pgEnv,
      PGHOSTADDR: host,
      PGSERVICE: undefined,
      PGSERVICEFILE: "/dev/null",
    },
  };
  await verifyIsolatedRestoreTarget(commandRunner, target, env);

  const workDirectory = tempRoot
    ? await mkdtemp(path.join(tempRoot, "rova-restore-"))
    : await secureTempDirectory("rova-restore-");
  if (tempRoot) await chmod(workDirectory, 0o700);
  const encryptedPath = path.join(workDirectory, "database.dump.custom.enc");
  const dumpPath = path.join(workDirectory, "database.dump.custom");
  emit("restore_started", { environment: config.environment, objectKey: objectKeyValue });

  try {
    const uploadInfo = await storage.head(objectKeyValue);
    if (!uploadInfo) throw new Error("Backup object is missing");
    const metadata = normalizeMetadata(uploadInfo.metadata);
    if (
      metadata.environment !== config.environment ||
      metadata.format !== "pg-dump-custom" ||
      metadata.encryption !== ALGORITHM
    ) {
      throw new Error("Backup object metadata does not match the selected restore environment");
    }
    if (metadata["key-id"] !== config.keyId) {
      throw new Error(`Backup requires encryption key ${metadata["key-id"]}`);
    }

    await storage.download(objectKeyValue, encryptedPath);
    const size = (await stat(encryptedPath)).size;
    const sha256 = await hashFile(encryptedPath);
    if (size !== uploadInfo.size || sha256 !== metadata["sha256-hex"]) {
      throw new Error("Downloaded backup integrity verification failed");
    }
    await decryptFile(encryptedPath, dumpPath, {
      key: config.key,
      expectedKeyId: config.keyId,
    });
    const decryptedSha = await hashFile(dumpPath);
    if (decryptedSha !== metadata["dump-sha256-hex"]) {
      throw new Error("Decrypted dump SHA-256 verification failed");
    }
    await commandRunner(env.PG_RESTORE_BIN?.trim() || "pg_restore", ["--list", dumpPath], {
      cwd: workDirectory,
      env: {},
    });
    await verifyIsolatedRestoreTarget(commandRunner, target, env);
    await commandRunner(
      env.PG_RESTORE_BIN?.trim() || "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        `--dbname=${database}`,
        dumpPath,
      ],
      { cwd: workDirectory, env: target.env },
    );
    emit("restore_succeeded", {
      environment: config.environment,
      objectKey: objectKeyValue,
      targetDatabase: database,
      encryptedBytes: size,
    });
    return { objectKey: objectKeyValue, targetDatabase: database, encryptedBytes: size };
  } catch (error) {
    emit("restore_failed", {
      environment: config.environment,
      objectKey: objectKeyValue,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

export const backupInternals = {
  hashFile,
  normalizeMetadata,
  objectKey,
  postgresEnvironment,
  retry,
};
