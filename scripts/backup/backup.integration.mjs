import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  defaultCommandRunner,
  encryptFile,
  FilesystemStorage,
  hashFile,
  runBackup,
  runRestore,
} from "./lib.mjs";

test("PostgreSQL 18 encrypted backup and isolated restore", {
  skip: process.env.RUN_BACKUP_PG18_INTEGRATION !== "true",
}, async () => {
  const source = new URL(process.env.TEST_BACKUP_SOURCE_URL);
  const target = new URL(process.env.TEST_BACKUP_RESTORE_URL);
  for (const [url, database] of [[source, "rova_backup_source_test"], [target, "rova_restore_test"]]) {
    assert.equal(url.protocol, "postgresql:");
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.username, "rova_backup_test");
    assert.equal(url.pathname, `/${database}`);
  }
  assert.equal(source.port, target.port);
  assert.equal(source.password, target.password);

  const pgEnv = (url) => ({
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: url.username,
    PGPASSWORD: url.password,
    PGDATABASE: url.pathname.slice(1),
  });

  const sql = (url, statement) => defaultCommandRunner(
    "psql", ["-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", statement],
    { env: pgEnv(url) },
  );
  const version = await sql(source, "SHOW server_version_num");
  assert.match(version.stdout.trim(), /^18\d{4}$/);
  await sql(source, "CREATE TABLE backup_fixture (id integer PRIMARY KEY, label text NOT NULL, payload bytea NOT NULL); INSERT INTO backup_fixture VALUES (1, 'synthetic', decode('0001ff80', 'hex')), (2, 'second', decode('ff00', 'hex'))");

  const root = await mkdtemp(path.join(tmpdir(), "rova-pg18-integration-"));
  const privateSource = new URL(source);
  privateSource.hostname = "staging-db.railway.internal";
  const env = {
    NODE_ENV: "test",
    BACKUP_STORAGE_DRIVER: "r2",
    BACKUP_ENVIRONMENT: "staging",
    RAILWAY_PROJECT_NAME: "keen-contentment",
    RAILWAY_ENVIRONMENT_NAME: "staging",
    BACKUP_EXECUTION_AUTHORIZATION: "STAGING_ONE_TIME_APPROVED",
    BACKUP_STAGING_DATABASE_HOST: privateSource.hostname,
    R2_BUCKET: "rova-ghana-db-backups",
    R2_ENDPOINT: "https://00000000000000000000000000000000.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "synthetic",
    R2_SECRET_ACCESS_KEY: "synthetic",
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    BACKUP_ENCRYPTION_KEY_ID: "integration-pg18",
    DATABASE_URL: privateSource.toString(),
    RESTORE_TARGET_DATABASE_URL: target.toString(),
    RESTORE_TARGET_MODE: "isolated",
    RESTORE_ISOLATED_CONFIRM: "I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE",
  };
  try {
    const storage = new FilesystemStorage(path.join(root, "objects"));
    const commandRunner = (command, args, options) => defaultCommandRunner(command, args, {
      ...options,
      env: { ...options.env, PGHOST: source.hostname },
    });
    const backup = await runBackup({ env, storage, commandRunner, tempRoot: root });
    await runRestore({ env: { ...env, BACKUP_OBJECT_KEY: backup.objectKey }, storage, tempRoot: root });
    const query = "SELECT id || ':' || label || ':' || encode(payload, 'hex') FROM backup_fixture ORDER BY id";
    const [original, restored] = await Promise.all([sql(source, query), sql(target, query)]);
    assert.equal(restored.stdout, original.stdout);
    assert.equal(restored.stdout.trim(), "1:synthetic:0001ff80\n2:second:ff00");

    let headCalls = 0;
    const storageHead = storage.head.bind(storage);
    storage.head = async (...args) => {
      headCalls += 1;
      return storageHead(...args);
    };
    const rejectedCommands = [];
    const guardedRunner = async (command, args, options) => {
      rejectedCommands.push(command);
      return defaultCommandRunner(command, args, {
        ...options,
        env: { ...options.env, PGHOST: source.hostname },
      });
    };
    await assert.rejects(runRestore({
      env: { ...env, BACKUP_OBJECT_KEY: backup.objectKey },
      storage,
      commandRunner: guardedRunner,
      tempRoot: root,
    }), /empty local PostgreSQL database/);
    assert.equal(headCalls, 0);
    assert.equal(rejectedCommands.some((command) => command === "pg_restore"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PostgreSQL 18 worker restores an encrypted PostgreSQL 16 archive", {
  skip: process.env.RUN_BACKUP_PG18_INTEGRATION !== "true" || !process.env.TEST_BACKUP_PG16_ARCHIVE,
}, async () => {
  const target = new URL(process.env.TEST_BACKUP_PG16_RESTORE_URL);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.username, "rova_backup_test");
  assert.equal(target.pathname, "/rova_restore_pg16_test");
  const root = await mkdtemp(path.join(tmpdir(), "rova-pg16-restore-"));
  const key = randomBytes(32);
  const keyId = "integration-pg16";
  const archive = process.env.TEST_BACKUP_PG16_ARCHIVE;
  const encrypted = path.join(root, "legacy.enc");
  const objectKey = "rova/postgres/staging/daily/legacy.dump.custom.enc";
  try {
    await encryptFile(archive, encrypted, { key, keyId });
    const storage = new FilesystemStorage(path.join(root, "objects"));
    await storage.put({
      key: objectKey,
      filePath: encrypted,
      size: (await stat(encrypted)).size,
      metadata: {
        environment: "staging",
        format: "pg-dump-custom",
        encryption: "aes-256-gcm",
        "key-id": keyId,
        "sha256-hex": await hashFile(encrypted),
        "dump-sha256-hex": await hashFile(archive),
      },
    });
    await runRestore({
      storage,
      tempRoot: root,
      env: {
        BACKUP_ENVIRONMENT: "staging",
        BACKUP_ENCRYPTION_KEY: key.toString("base64url"),
        BACKUP_ENCRYPTION_KEY_ID: keyId,
        BACKUP_OBJECT_KEY: objectKey,
        RESTORE_TARGET_DATABASE_URL: target.toString(),
        RESTORE_TARGET_MODE: "isolated",
        RESTORE_ISOLATED_CONFIRM: "I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE",
      },
    });
    const result = await defaultCommandRunner("psql", [
      "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1",
      "-c", "SELECT id || ':' || encode(payload, 'hex') FROM legacy_fixture",
    ], { env: {
      PGHOST: target.hostname,
      PGPORT: target.port || "5432",
      PGUSER: target.username,
      PGPASSWORD: target.password,
      PGDATABASE: target.pathname.slice(1),
    } });
    assert.equal(result.stdout.trim(), "1:00ff80");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
