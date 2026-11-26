import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_002_TEST_PREFIX,
  cleanupBackupTestPrefix,
  defaultCommandRunner,
  decryptFile,
  encryptFile,
  R2Storage,
  runBackup,
  runRestore,
  validateBackupEnvironment,
} from "./lib.mjs";

class MemoryStorage {
  constructor(objects = []) {
    this.objects = new Map(
      objects.map((object) => [
        object.key,
        {
          key: object.key,
          body: Buffer.alloc(object.size ?? 1),
          size: object.size ?? 1,
          lastModified: object.lastModified ?? "2026-01-01T00:00:00.000Z",
          metadata: object.metadata ?? {},
        },
      ]),
    );
    this.failedPuts = 0;
    this.putAttempts = 0;
    this.deleted = [];
  }

  failNextPuts(count) {
    this.failedPuts = count;
  }

  async put({ key, filePath, size, metadata }) {
    this.putAttempts += 1;
    if (this.failedPuts > 0) {
      this.failedPuts -= 1;
      throw new Error("simulated upload failure");
    }
    if (this.objects.has(key)) {
      const error = new Error("object already exists");
      error.$metadata = { httpStatusCode: 412 };
      throw error;
    }
    this.objects.set(key, {
      key,
      body: await readFile(filePath),
      size,
      lastModified: new Date().toISOString(),
      metadata,
    });
  }

  async head(key) {
    const object = this.objects.get(key);
    return object
      ? { key, size: object.size, metadata: object.metadata, etag: "mock-etag" }
      : null;
  }

  async download(key, outputPath) {
    const object = this.objects.get(key);
    if (!object) throw new Error("mock object missing");
    await writeFile(outputPath, object.body, { flag: "wx" });
  }

  async list(prefix) {
    return [...this.objects.values()]
      .filter((object) => object.key.startsWith(prefix))
      .map(({ key, size, lastModified }) => ({ key, size, lastModified }));
  }

  async delete(key) {
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

function testEnvironment(overrides = {}) {
  return {
    NODE_ENV: "test",
    BACKUP_ENVIRONMENT: "staging",
    RAILWAY_PROJECT_NAME: "keen-contentment",
    RAILWAY_ENVIRONMENT_NAME: "staging",
    BACKUP_EXECUTION_AUTHORIZATION: "STAGING_ONE_TIME_APPROVED",
    BACKUP_STAGING_DATABASE_HOST: "staging-db.railway.internal",
    DATABASE_URL: "postgresql://rova:secret@staging-db.railway.internal:5432/rova_test?schema=public&sslmode=require",
    R2_BUCKET: "rova-ghana-db-backups",
    R2_ENDPOINT: "https://00000000000000000000000000000000.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "synthetic",
    R2_SECRET_ACCESS_KEY: "synthetic",
    BACKUP_ENCRYPTION_KEY_ID: "staging-2026-11",
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    BACKUP_RUN_ID: "test-run",
    BACKUP_STORAGE_DRIVER: "r2",
    ...overrides,
  };
}

function fakeCommandRunner({ content = "PGDMP disposable test dump", serverVersion = "180001", clientVersion = "18.1" } = {}) {
  const calls = [];
  const runner = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === "--version") return { stdout: `pg_dump (PostgreSQL) ${clientVersion}` };
    if (command === "psql") return { stdout: serverVersion };
    const fileArgument = args.find((argument) => argument.startsWith("--file="));
    if (fileArgument) await writeFile(fileArgument.slice("--file=".length), content, { mode: 0o600 });
    return { stdout: "" };
  };
  runner.calls = calls;
  return runner;
}

function restoreIdentity(overrides = {}) {
  return {
    database: "rova_restore_test",
    user: "test",
    serverAddress: "127.0.0.1",
    inRecovery: false,
    hasUserObjects: false,
    ...overrides,
  };
}

function fakeRestoreCommandRunner({ identity = restoreIdentity(), failRestore = false } = {}) {
  const calls = [];
  const runner = async (command, args) => {
    calls.push({ command, args });
    if (command === "psql") return { stdout: JSON.stringify(identity) };
    if (command === "pg_restore" && failRestore && args.includes("--exit-on-error")) {
      throw new Error("restore failed");
    }
    return { stdout: "" };
  };
  runner.calls = calls;
  return runner;
}

let directory;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rova-backup-test-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

describe("backup encryption", () => {
  it("encrypts and decrypts without exposing plaintext in the object", async () => {
    const plaintext = "name,amount\nAda,100\n";
    const input = path.join(directory, "input.dump");
    const encrypted = path.join(directory, "input.enc");
    const output = path.join(directory, "output.dump");
    const key = randomBytes(32);
    await writeFile(input, plaintext);

    await encryptFile(input, encrypted, { key, keyId: "staging-v1" });
    await decryptFile(encrypted, output, { key, expectedKeyId: "staging-v1" });

    expect(await readFile(output, "utf8")).toBe(plaintext);
    expect(await readFile(encrypted, "utf8")).not.toContain(plaintext);
  });

  it("rejects tampering and the wrong key identifier", async () => {
    const input = path.join(directory, "input.dump");
    const encrypted = path.join(directory, "input.enc");
    const tampered = path.join(directory, "tampered.enc");
    const output = path.join(directory, "output.dump");
    const key = randomBytes(32);
    await writeFile(input, "recoverable rows");
    await encryptFile(input, encrypted, { key, keyId: "production-v1" });

    await copyFile(encrypted, tampered);
    const body = await readFile(tampered);
    body[body.length - 5] ^= 1;
    await writeFile(tampered, body);

    await expect(
      decryptFile(encrypted, output, { key, expectedKeyId: "staging-v1" }),
    ).rejects.toThrow(/requires key/);
    await expect(
      decryptFile(tampered, output, { key, expectedKeyId: "production-v1" }),
    ).rejects.toThrow();
  });
});

describe("backup configuration and retention", () => {
  it("removes explicitly unset inherited variables from child processes", async () => {
    const previous = process.env.PGSERVICE;
    process.env.PGSERVICE = "unsafe-inherited-service";
    try {
      const result = await defaultCommandRunner(
        process.execPath,
        ["-e", "process.stdout.write(process.env.PGSERVICE ?? 'unset')"],
        { env: { PGSERVICE: undefined } },
      );
      expect(result.stdout).toBe("unset");
    } finally {
      if (previous === undefined) delete process.env.PGSERVICE;
      else process.env.PGSERVICE = previous;
    }
  });

  it("requires exact environments and independent 32-byte encryption keys", () => {
    expect(() => validateBackupEnvironment(testEnvironment({ BACKUP_ENVIRONMENT: "prod" })))
      .toThrow(/staging or production/);
    expect(() =>
      validateBackupEnvironment(testEnvironment({ BACKUP_ENCRYPTION_KEY: "too-short" })),
    ).toThrow(/exactly 32 bytes/);
    expect(() =>
      validateBackupEnvironment(testEnvironment({ BACKUP_ENCRYPTION_KEY: undefined })),
    ).toThrow(/Missing required environment variable: BACKUP_ENCRYPTION_KEY/);
    expect(() => validateBackupEnvironment(testEnvironment({ BACKUP_RETENTION_COUNT: "7" })))
      .toThrow(/automatic retention is disabled/);
    expect(validateBackupEnvironment(testEnvironment({ BACKUP_ENVIRONMENT: "production" })))
      .toMatchObject({ environment: "production" });
    const sharedKey = randomBytes(32).toString("base64url");
    expect(() =>
      validateBackupEnvironment(
        testEnvironment({
          BACKUP_ENCRYPTION_KEY: sharedKey,
          IDENTITY_NOTIFICATION_ENCRYPTION_KEY: sharedKey,
        }),
      ),
    ).toThrow(/distinct from IDENTITY_NOTIFICATION_ENCRYPTION_KEY/);
  });

  it("cleans up only objects inside the dedicated test prefix", async () => {
    const testKey = `${BACKUP_002_TEST_PREFIX}rova/postgres/staging/daily/temporary.dump.custom.enc`;
    const realStagingKey = "rova/postgres/staging/daily/real.dump.custom.enc";
    const storage = new MemoryStorage([{ key: testKey }, { key: realStagingKey }]);

    await expect(cleanupBackupTestPrefix(storage, [testKey])).resolves.toEqual([testKey]);
    expect(storage.deleted).toEqual([testKey]);
    expect(storage.objects.has(realStagingKey)).toBe(true);
  });

  it("rejects cleanup if any supplied key is outside the test prefix", async () => {
    const storage = new MemoryStorage();
    await expect(
      cleanupBackupTestPrefix(storage, [
        `${BACKUP_002_TEST_PREFIX}rova/postgres/staging/daily/temporary.dump.custom.enc`,
        "rova/postgres/staging/daily/real.dump.custom.enc",
      ]),
    ).rejects.toThrow(/outside the backup test prefix/);
    expect(storage.deleted).toEqual([]);
  });

  it("rejects production objects even inside the test namespace", async () => {
    const storage = new MemoryStorage();
    await expect(cleanupBackupTestPrefix(storage, [
      `${BACKUP_002_TEST_PREFIX}rova/postgres/production/daily/temporary.dump.custom.enc`,
    ])).rejects.toThrow(/outside the backup test prefix/);
    expect(storage.deleted).toEqual([]);
  });
});

describe("backup upload behavior", () => {
  it("defaults to a non-operational startup even with authorization configured", () => {
    const result = spawnSync(process.execPath, ["scripts/backup/backup.mjs"], {
      env: { ...testEnvironment(), PATH: process.env.PATH },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).event).toBe("idle_no_backup");
  });

  it("verifies configuration without requiring authorization or starting a backup", () => {
    const result = spawnSync(process.execPath, ["scripts/backup/backup.mjs", "--verify"], {
      env: { ...testEnvironment({ BACKUP_EXECUTION_AUTHORIZATION: undefined }), PATH: process.env.PATH },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).event).toBe("configuration_valid");
  });

  it.each([
    [{ BACKUP_EXECUTION_AUTHORIZATION: undefined }, /BACKUP_EXECUTION_AUTHORIZATION/],
    [{ BACKUP_ENVIRONMENT: "production" }, /BACKUP_ENVIRONMENT=staging/],
    [{ RAILWAY_ENVIRONMENT_NAME: "production" }, /keen-contentment staging/],
    [{ RAILWAY_PROJECT_NAME: "other-project" }, /keen-contentment staging/],
    [{ R2_BUCKET: "rova-ghana-prod-db-backups" }, /staging R2 bucket/],
    [{ R2_SECRET_ACCESS_KEY: undefined }, /Missing required environment variable: R2_SECRET_ACCESS_KEY/],
    [{ DATABASE_URL: undefined }, /Missing required environment variable: DATABASE_URL/],
    [{ R2_ENDPOINT: "http://example.invalid" }, /official bare HTTPS/],
    [{ DATABASE_URL: "postgresql://test:test@production-db.railway.internal/test" }, /approved staging private hostname/],
    [{ BACKUP_STAGING_DATABASE_HOST: "example.com" }, /approved staging private hostname/],
    [{ PGHOSTADDR: "127.0.0.1" }, /PGHOSTADDR/],
    [{ BACKUP_STORAGE_DRIVER: "filesystem" }, /requires R2 storage/],
    [{ BACKUP_TEST_PREFIX: BACKUP_002_TEST_PREFIX }, /must be unset/],
  ])("rejects unsafe configuration before any backup operation", async (overrides, message) => {
    const storage = new MemoryStorage();
    const commandRunner = fakeCommandRunner();
    await expect(runBackup({ env: testEnvironment(overrides), storage, commandRunner, tempRoot: directory }))
      .rejects.toThrow(message);
    expect(commandRunner.calls).toEqual([]);
    expect(storage.putAttempts).toBe(0);
    expect(storage.deleted).toEqual([]);
  });

  it("rejects an explicit execution command without authorization", () => {
    const result = spawnSync(process.execPath, ["scripts/backup/backup.mjs", "--execute-staging"], {
      env: { ...testEnvironment({ BACKUP_EXECUTION_AUTHORIZATION: undefined }), PATH: process.env.PATH },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).error).toMatch(/BACKUP_EXECUTION_AUTHORIZATION/);
  });

  it("creates and verifies a backup without deleting existing objects", async () => {
    const previous = Array.from({ length: 8 }, (_, index) => ({
      key: `rova/postgres/staging/daily/2026-11-${String(index + 10).padStart(
        2,
        "0",
      )}T000000Z-old.dump.custom.enc`,
      size: 100,
      lastModified: `2026-11-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const storage = new MemoryStorage(previous);
    const commandRunner = fakeCommandRunner();

    const result = await runBackup({
      env: testEnvironment(),
      storage,
      commandRunner,
      now: new Date("2026-11-23T00:00:00.000Z"),
      tempRoot: directory,
    });

    expect(result.environment).toBe("staging");
    expect(result.objectKey).toMatch(/^rova\/postgres\/staging\/daily\//);
    expect(storage.deleted).toEqual([]);
    expect(commandRunner.calls.map(({ command }) => command)).toEqual(["pg_dump", "psql", "pg_dump", "pg_restore"]);
    const uploaded = await storage.head(result.objectKey);
    expect(uploaded.metadata["sha256-hex"]).toBe(result.encryptedSha256);
    expect(uploaded.metadata.environment).toBe("staging");
    expect(uploaded.size).toBe(result.encryptedSize);
  });

  it("rejects a newer server before dumping or uploading", async () => {
    const storage = new MemoryStorage();
    const commandRunner = fakeCommandRunner({ serverVersion: "190000" });
    await expect(runBackup({ env: testEnvironment(), storage, commandRunner, tempRoot: directory }))
      .rejects.toThrow(/exceeds pg_dump client support/);
    expect(commandRunner.calls.map(({ command }) => command)).toEqual(["pg_dump", "psql"]);
    expect(storage.putAttempts).toBe(0);
  });

  it("fails closed when the server version cannot be parsed", async () => {
    const storage = new MemoryStorage();
    await expect(runBackup({
      env: testEnvironment(),
      storage,
      commandRunner: fakeCommandRunner({ serverVersion: "unknown" }),
      tempRoot: directory,
    })).rejects.toThrow(/Unable to determine PostgreSQL server version/);
    expect(storage.putAttempts).toBe(0);
  });

  it("generates different object keys even for repeated run identifiers", async () => {
    const storage = new MemoryStorage();
    const options = { env: testEnvironment(), storage, commandRunner: fakeCommandRunner(), now: new Date("2026-11-23T00:00:00Z"), tempRoot: directory };
    const first = await runBackup(options);
    const second = await runBackup(options);
    expect(first.objectKey).not.toBe(second.objectKey);
    expect(storage.objects.has(first.objectKey)).toBe(true);
    expect(storage.deleted).toEqual([]);
  });

  it("uses conditional R2 writes so an existing key cannot be overwritten", async () => {
    const storage = new R2Storage({
      R2_BUCKET: "test-bucket",
      R2_ENDPOINT: "https://example.invalid",
      R2_ACCESS_KEY_ID: "test",
      R2_SECRET_ACCESS_KEY: "test",
    });
    const file = path.join(directory, "object");
    await writeFile(file, "data");
    let request;
    storage.client.send = async (command) => {
      request = command.input;
      for await (const chunk of command.input.Body) void chunk;
    };
    await storage.put({ key: "test-key", filePath: file, size: 4, metadata: {} });
    expect(request.IfNoneMatch).toBe("*");
  });

  it("reports a collision without overwriting or deleting the existing object", async () => {
    const storage = new MemoryStorage();
    storage.put = async ({ key }) => {
      storage.objects.set(key, { key, body: Buffer.from("existing"), size: 8, metadata: {} });
      const error = new Error("precondition failed");
      error.$metadata = { httpStatusCode: 412 };
      throw error;
    };
    await expect(runBackup({
      env: testEnvironment({ BACKUP_UPLOAD_ATTEMPTS: "1" }),
      storage,
      commandRunner: fakeCommandRunner(),
      tempRoot: directory,
    })).rejects.toThrow(/verification failed/);
    expect([...storage.objects.values()][0].body.toString()).toBe("existing");
    expect(storage.deleted).toEqual([]);
  });

  it("reports restore failure without deleting the backup", async () => {
    const storage = new MemoryStorage();
    const env = testEnvironment();
    const backup = await runBackup({ env, storage, commandRunner: fakeCommandRunner(), tempRoot: directory });
    const commandRunner = fakeRestoreCommandRunner({ failRestore: true });
    await expect(runRestore({
      env: {
        ...env,
        BACKUP_OBJECT_KEY: backup.objectKey,
        RESTORE_TARGET_MODE: "isolated",
        RESTORE_ISOLATED_CONFIRM: "I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE",
        RESTORE_TARGET_DATABASE_URL: "postgresql://test:test@127.0.0.1/rova_restore_test",
      },
      storage, commandRunner, tempRoot: directory,
    })).rejects.toThrow("restore failed");
    const restoreArgs = commandRunner.calls.find(({ args }) => args.includes("--exit-on-error"))?.args;
    expect(restoreArgs).not.toContain("--clean");
    expect(restoreArgs).not.toContain("--if-exists");
    expect(vi.mocked(console.log).mock.calls.some(([line]) =>
      JSON.parse(line).event === "restore_failed",
    )).toBe(true);
    expect(storage.objects.has(backup.objectKey)).toBe(true);
    expect(storage.deleted).toEqual([]);
  });

  it("isolates test uploads and retention from real staging backups", async () => {
    const oldTestKey =
      `${BACKUP_002_TEST_PREFIX}rova/postgres/staging/daily/2026-11-01T000000Z-old.dump.custom.enc`;
    const realStagingKey =
      "rova/postgres/staging/daily/2026-10-01T000000Z-real.dump.custom.enc";
    const storage = new MemoryStorage([
      { key: oldTestKey, lastModified: "2026-11-01T00:00:00.000Z" },
      { key: realStagingKey, lastModified: "2026-10-01T00:00:00.000Z" },
    ]);
    storage.list = async () =>
      [...storage.objects.values()].map(({ key, size, lastModified }) => ({
        key,
        size,
        lastModified,
      }));

    const result = await runBackup({
      env: testEnvironment(),
      storage,
      commandRunner: fakeCommandRunner(),
      now: new Date("2026-11-23T00:00:00.000Z"),
      tempRoot: directory,
      testPrefix: BACKUP_002_TEST_PREFIX,
    });

    expect(result.objectKey.startsWith(BACKUP_002_TEST_PREFIX)).toBe(true);
    expect(result.objectKey.startsWith("rova/postgres/staging/daily/")).toBe(false);
    expect(storage.deleted).toEqual([]);
    expect(storage.objects.has(oldTestKey)).toBe(true);
    expect(storage.objects.has(realStagingKey)).toBe(true);
    expect(storage.objects.has(result.objectKey)).toBe(true);
  });

  it("rejects any test prefix other than the fixed isolated prefix", async () => {
    const storage = new MemoryStorage();
    await expect(
      runBackup({
        env: testEnvironment(),
        storage,
        testPrefix: "rova/postgres/staging/daily/",
      }),
    ).rejects.toThrow(/testPrefix must be exactly/);
    expect(storage.putAttempts).toBe(0);
    expect(storage.deleted).toEqual([]);
  });

  it("rejects restores configured with any other test prefix", async () => {
    await expect(
      runRestore({
        env: {
          RESTORE_TARGET_MODE: "isolated",
          RESTORE_ISOLATED_CONFIRM: "I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE",
        },
        storage: new MemoryStorage(),
        testPrefix: "rova/postgres/staging/daily/",
      }),
    ).rejects.toThrow(/testPrefix must be exactly/);
  });

  it("rejects staging destinations and non-loopback restore URLs before any database or storage operation", async () => {
    const storage = new MemoryStorage();
    const head = vi.spyOn(storage, "head");
    const commandRunner = vi.fn(async () => ({ stdout: "" }));
    const common = {
      ...testEnvironment(),
      BACKUP_OBJECT_KEY: "rova/postgres/staging/daily/fixture.dump.custom.enc",
      RESTORE_ISOLATED_CONFIRM: "I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE",
      RESTORE_TARGET_DATABASE_URL: "postgresql://test:test@127.0.0.1/rova_restore_test",
    };

    await expect(runRestore({
      env: { ...common, RESTORE_TARGET_MODE: "staging" },
      storage,
      commandRunner,
    })).rejects.toThrow(/live restore targets are unsupported/);
    await expect(runRestore({
      env: {
        ...common,
        RESTORE_TARGET_MODE: "isolated",
        RESTORE_TARGET_DATABASE_URL: "postgresql://test:test@staging.example/rova_restore_test",
      },
      storage,
      commandRunner,
    })).rejects.toThrow(/literal loopback/);

    expect(commandRunner).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });

  it("rejects operational or mismatched database identities before reading a backup", async () => {
    const storage = new MemoryStorage();
    const head = vi.spyOn(storage, "head");
    const commandRunner = fakeRestoreCommandRunner({
      identity: restoreIdentity({ hasUserObjects: true }),
    });
    const env = {
      ...testEnvironment(),
      BACKUP_OBJECT_KEY: "rova/postgres/staging/daily/fixture.dump.custom.enc",
      RESTORE_TARGET_MODE: "isolated",
      RESTORE_ISOLATED_CONFIRM: "I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE",
      RESTORE_TARGET_DATABASE_URL: "postgresql://test:test@127.0.0.1/rova_restore_test",
    };

    await expect(runRestore({ env, storage, commandRunner })).rejects.toThrow(/empty local PostgreSQL database/);
    expect(commandRunner.calls).toHaveLength(1);
    expect(head).not.toHaveBeenCalled();

    const mismatchRunner = fakeRestoreCommandRunner({
      identity: restoreIdentity({ user: "different-user" }),
    });
    await expect(runRestore({ env, storage, commandRunner: mismatchRunner }))
      .rejects.toThrow(/empty local PostgreSQL database/);
    expect(head).not.toHaveBeenCalled();
  });

  it("retries transient upload failures and succeeds after restartable attempts", async () => {
    const storage = new MemoryStorage();
    storage.failNextPuts(2);
    const result = await runBackup({
      env: testEnvironment({ BACKUP_UPLOAD_ATTEMPTS: "3" }),
      storage,
      commandRunner: fakeCommandRunner(),
      now: new Date("2026-11-23T01:00:00.000Z"),
      tempRoot: directory,
    });

    expect(storage.putAttempts).toBe(3);
    expect(storage.objects.has(result.objectKey)).toBe(true);
  });

  it("verifies the existing object after a lost upload response", async () => {
    const storage = new MemoryStorage();
    const originalPut = storage.put.bind(storage);
    let first = true;
    storage.put = async (upload) => {
      await originalPut(upload);
      if (first) {
        first = false;
        throw new Error("lost upload response");
      }
    };
    const result = await runBackup({
      env: testEnvironment({ BACKUP_UPLOAD_ATTEMPTS: "2" }),
      storage,
      commandRunner: fakeCommandRunner(),
      tempRoot: directory,
    });
    expect(storage.objects.has(result.objectKey)).toBe(true);
    expect(storage.deleted).toEqual([]);
  });

  it("does not delete retained objects when upload verification fails", async () => {
    const oldKey =
      "rova/postgres/staging/daily/2026-11-01T000000Z-old.dump.custom.enc";
    const storage = new MemoryStorage([
      { key: oldKey, lastModified: "2026-11-01T00:00:00.000Z" },
    ]);
    storage.failNextPuts(1);

    await expect(
      runBackup({
        env: testEnvironment({ BACKUP_UPLOAD_ATTEMPTS: "1" }),
        storage,
        commandRunner: fakeCommandRunner(),
        now: new Date("2026-11-23T02:00:00.000Z"),
        tempRoot: directory,
      }),
    ).rejects.toThrow("simulated upload failure");

    expect(storage.deleted).toEqual([]);
    expect(storage.objects.has(oldKey)).toBe(true);
  });

  it("fails a corrupted upload verification and cleans up its temporary plaintext", async () => {
    const storage = new MemoryStorage();
    storage.download = async (key, outputPath) => {
      const corrupted = Buffer.from(storage.objects.get(key).body);
      corrupted[corrupted.length - 1] ^= 1;
      await writeFile(outputPath, corrupted, { flag: "wx" });
    };

    await expect(runBackup({
      env: testEnvironment({ BACKUP_UPLOAD_ATTEMPTS: "1" }),
      storage,
      commandRunner: fakeCommandRunner(),
      tempRoot: directory,
    })).rejects.toThrow(/SHA-256 mismatch/);

    const events = vi.mocked(console.log).mock.calls.map(([line]) => JSON.parse(line).event);
    expect(events).toContain("failed");
    expect(events).not.toContain("succeeded");
    expect(storage.deleted).toEqual([]);
    expect(await readdir(directory)).toEqual([]);
  });

  it("cleans up temporary plaintext after a successful backup", async () => {
    await runBackup({
      env: testEnvironment(),
      storage: new MemoryStorage(),
      commandRunner: fakeCommandRunner(),
      tempRoot: directory,
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it("allows a failed run to be restarted without deleting a recoverable backup", async () => {
    const oldKey =
      "rova/postgres/staging/daily/2026-11-01T000000Z-old.dump.custom.enc";
    const storage = new MemoryStorage([
      { key: oldKey, lastModified: "2026-11-01T00:00:00.000Z" },
    ]);
    const env = testEnvironment({ BACKUP_UPLOAD_ATTEMPTS: "1" });
    const now = new Date("2026-11-23T03:00:00.000Z");
    storage.failNextPuts(1);

    await expect(
      runBackup({ env, storage, commandRunner: fakeCommandRunner(), now, tempRoot: directory }),
    ).rejects.toThrow("simulated upload failure");
    const restarted = await runBackup({
      env,
      storage,
      commandRunner: fakeCommandRunner(),
      now,
      tempRoot: directory,
    });

    expect(storage.objects.has(oldKey)).toBe(true);
    expect(storage.objects.has(restarted.objectKey)).toBe(true);
  });
});
