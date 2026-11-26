# ROVA GHANA - BACKUP-001 Low-Cost Database Protection Report

**Historical record, not an operating runbook:** The original retention, startup, and production-backup descriptions below are superseded. The current worker defaults to no backup, supports only explicitly authorized staging execution, and rejects `BACKUP_RETENTION_COUNT`; automatic deletion is disabled. See [BACKUP-003C](./ROVA_TASK_BACKUP_003C_FINAL_DEPLOYMENT_SAFETY_REPORT.md) and [SECURITY-FIX-001](./ROVA_TASK_SECURITY_FIX_001_REMEDIATION_REPORT.md). No live backup or deployment is approved by this report.

## Executive decision

**READY FOR SECURITY/OPERATIONS APPROVAL; NOT READY FOR DEPLOYMENT.**

This task prepared a dedicated, short-lived PostgreSQL logical-backup process for staging and production. It creates a custom-format `pg_dump`, validates the archive, encrypts it client-side with AES-256-GCM, uploads it to private Cloudflare R2-compatible storage, verifies the uploaded bytes and metadata, applies retention, and supports restore into a deliberately isolated database.

No Railway service, database, variable, network setting, migration, customer feature, dispatch capability or payment capability was changed. No Railway or Cloudflare resource was provisioned. The backup process was not deployed.

Real Cloudflare R2 integration is **UNVERIFIED**. Railway cron availability on the current plan is **UNVERIFIED**. These are approval gates, not assumptions.

## 1. Implemented architecture

Files prepared:

- `scripts/backup/backup.mjs`: short-lived backup command;
- `scripts/backup/restore.mjs`: isolated restore command;
- `scripts/backup/lib.mjs`: validated configuration, encryption, storage, upload verification, retry, retention and restore logic;
- `scripts/backup/Dockerfile`: dedicated non-root image with Node.js and PostgreSQL 18 client tools;
- `scripts/backup/backup.test.mjs`: encryption, upload, failure, retry, restart and retention tests.

The dedicated image uses:

- `pg_dump --format=custom --compress=9` for a transactionally consistent logical snapshot;
- `pg_restore --list` before encryption to reject malformed archives;
- AES-256-GCM streaming encryption with a random 96-bit IV, authenticated header/key ID and 128-bit tag;
- SHA-256 for the plaintext dump and encrypted object;
- Cloudflare R2 through the S3-compatible API in `@aws-sdk/client-s3`;
- a private R2 `PutObject`, `HeadObject`, byte-for-byte `GetObject` verification and only then retention deletion;
- a maximum of three upload attempts by default, with bounded exponential delays;
- seven daily recovery points by default.

The PostgreSQL connection password is passed through `PGPASSWORD` to the child process rather than as a command-line argument. The code never logs `DATABASE_URL`, database passwords, R2 secrets or encryption-key material. Event output is structured JSON containing only operation status, environment, object key, sizes and sanitized errors.

Temporary dump, encrypted and verification files are created in a mode-0700 directory and removed in `finally`, including on failures. The production image runs as UID/GID 10001 and the filesystem mock is rejected when `NODE_ENV=production`.

### Environment separation

Run staging and production as separate Railway cron definitions or separate manual invocations. They must have independent:

- `DATABASE_URL`;
- R2 API tokens;
- R2 buckets (recommended) or separately scoped bucket permissions;
- `BACKUP_ENCRYPTION_KEY`;
- `BACKUP_ENCRYPTION_KEY_ID`;
- object prefixes;
- Railway variables and access roles.

The key is written as:

```text
rova/postgres/<staging-or-production>/daily/<timestamp>-<run-id>.dump.custom.enc
```

Only `staging` and `production` are accepted. The backup encryption key is explicitly rejected if it equals `IDENTITY_NOTIFICATION_ENCRYPTION_KEY`.

## 2. Required external configuration

No values below should be entered in Git, a report, a shell history file, a public variable, or a support ticket. Use Railway secrets and an approved external secret manager.

### 2.1 Cloudflare R2

For the strongest isolation, create two private Standard buckets:

```text
<approved-name>-staging
<approved-name>-production
```

For each bucket:

1. Keep public development URL access disabled and do not attach a custom domain.
2. Create an R2 S3 API token scoped only to that bucket.
3. Grant only the required object read, write, list and delete actions.
4. Do not reuse either token in the other environment or in the ROVA application service.
5. Record token owner, scope, creation date and rotation date outside R2.
6. Verify that the bucket cannot be fetched anonymously.
7. Do not place encryption keys, key backups or recovery instructions in either bucket.

If organizational policy permits one bucket instead, the two environment tokens must still be distinct and an owner must confirm that the R2 permission model enforces the required environment boundary. Bucket separation is the recommended default because a bucket-scoped token is easier to audit.

### 2.2 Backup encryption keys

Generate a new 32-byte base64url key for each environment, on a trusted operator workstation:

```bash
openssl rand 32 | base64 | tr '+/' '-_' | tr -d '=\\n'
```

Generate staging and production separately. Store:

- only the value as a secret in the corresponding Railway backup service;
- an independently controlled encrypted recovery copy in the approved secret/password manager;
- the non-secret key ID, owner, environment and creation/rotation date in the key register.

Do not use any key currently used for identity-notification encryption, `AUTH_SECRET`, PostgreSQL, R2 or webhook signing. Do not email, paste into chat, attach to a ticket, or store the key alongside R2 objects.

Retain every historical backup encryption key for at least as long as any object encrypted with that key ID remains recoverable. Rotating a key requires keeping old copies available for restore. A lost key makes the affected backup permanently unrecoverable.

Suggested key IDs are environment/version/date identifiers, for example `staging-2026-11-v1`. The ID is not secret.

### 2.3 Staging secret set

Store in the staging backup service only:

```text
BACKUP_ENVIRONMENT=staging
DATABASE_URL=<staging Railway private PostgreSQL URL with SSL settings>
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=<private-staging-bucket>
R2_ACCESS_KEY_ID=<staging-scoped-token-access-key>
R2_SECRET_ACCESS_KEY=<staging-scoped-token-secret>
R2_REGION=auto
BACKUP_ENCRYPTION_KEY_ID=<staging-key-id>
BACKUP_ENCRYPTION_KEY=<staging-32-byte-base64url-key>
BACKUP_RETENTION_COUNT=7
BACKUP_STORAGE_WARNING_BYTES=4294967296
BACKUP_UPLOAD_ATTEMPTS=3
```

Never expose the database publicly to perform this backup. Use Railway's private service hostname/network reference from the backup process. If a private hostname cannot be reached from the selected cron process, stop and revise the topology; do not enable a public database endpoint.

### 2.4 Production secret set

Use the same names in the separately configured production backup process, but with production-only values:

```text
BACKUP_ENVIRONMENT=production
DATABASE_URL=<production Railway private PostgreSQL URL with SSL settings>
R2_BUCKET=<private-production-bucket>
R2_ACCESS_KEY_ID=<production-scoped-token-access-key>
R2_SECRET_ACCESS_KEY=<production-scoped-token-secret>
BACKUP_ENCRYPTION_KEY_ID=<production-key-id>
BACKUP_ENCRYPTION_KEY=<production-32-byte-base64url-key>
```

The remaining settings have the same meanings. Never copy staging secrets into production or production secrets into staging.

## 3. Scheduling and Railway restrictions

Preferred schedule: one successful run every 24 hours, at a staggered time not shared by the two environments.

The preferred runtime is a Railway cron/one-off task that exits after backup completion rather than an always-running backup server. A Railway Pro upgrade is **not authorized or required by this report**.

Before choosing Railway cron:

1. Verify from the current plan's Railway documentation and dashboard that scheduled/cron processes are available without a paid plan change.
2. Verify the process can reference PostgreSQL over Railway private networking.
3. Verify that the custom Dockerfile command is supported or that the image can be built as a separate service.
4. Verify resource limits and temporary disk are sufficient for one compressed custom dump plus its encrypted copy and one verification download. This process requires approximately `2 x compressed backup size + R2 overhead`.
5. Configure only one daily trigger per environment; verify an overlapping invocation will not be started.
6. Configure failure alerting from Railway logs to the approved operational channel.
7. Test using approved staging-only credentials first, with deployment separately authorized.

The backup command exits non-zero on any dump, archive-list, encryption, upload, verification or retention error. Logs emit `failed`/`fatal`; success emits `succeeded`. Secrets are not included.

### Interim secure manual procedure

If scheduling is unavailable without a plan upgrade, do not upgrade. Use the following manual procedure daily after operator approval:

```bash
docker build -f scripts/backup/Dockerfile -t rova-backup:backup-001 .

docker run --rm \
  --env-file /secure/path/staging-backup.env \
  rova-backup:backup-001
```

Use a separately protected production env file only from an approved operator workstation. The env file must be encrypted at rest, mode 0600 or equivalent, outside Git, and removed from temporary workstations after the run. Confirm that the `succeeded` event and verified R2 object exist before leaving the procedure.

A restart reruns the dump as a new safe attempt. It does not delete a previous recoverable object if upload verification has not succeeded. Three in-process upload retries are applied. If the process is killed, rerun it; the new timestamp normally creates a separate recovery point. Never alter an existing last-known-good object manually.

## 4. Retention and storage controls

Default retention is seven daily objects per environment. The retention sorter preserves the newest N and is guarded to retain at least one object. A deletion is logged explicitly by object key. Deletions are attempted only after the new object passes metadata, size and SHA-256 download verification. If the upload or verification fails, retention processing is not reached.

This remains logical retention, not lifecycle immutability. The operator should enable R2 object lock/versioning only if the selected Cloudflare configuration and cost have been approved; it is not assumed here.

### Free-storage estimate

Using Cloudflare R2 Standard's published 10 GB-month free storage allowance as the planning target:

```text
aggregate retained encrypted bytes
  ~= 7 days x 1 staging compressed dump
   + 7 days x 1 production compressed dump
   + small encryption/object metadata overhead
```

For planning with equal average encrypted size `B` for each environment:

```text
total storage ~= 14 x B
maximum equal B ~= 10 GB / 14 = 0.714 GB (714 MB decimal)
```

Examples:

| Encrypted backup per environment | 14 total daily objects | Fits 10 GB-month? |
| --- | ---: | --- |
| 50 MB | 0.70 GB | Yes |
| 250 MB | 3.50 GB | Yes |
| 500 MB | 7.00 GB | Yes, monitor growth |
| 700 MB | 9.80 GB | Barely |
| 750 MB | 10.50 GB | No |
| 1 GB | 14.00 GB | No |

The disposable restore drill produced a 2,649-byte custom dump and a 2,707-byte encrypted object, but that result is only an overhead/functional measurement. It is not a prediction of real database size.

`BACKUP_STORAGE_WARNING_BYTES=4294967296` (4 GiB per environment) is the conservative implemented default. Two environments reaching that threshold would approach 8 GiB in total before the 10 GB planning ceiling. The code lists only its own environment; configure account-level bucket usage alerts and review aggregate staging plus production usage because per-environment warnings cannot know another credential's bucket.

Other R2 free-plan operation allowances are expected to be much larger than this design's daily use (one put/head/get/list plus occasional retention deletes). Confirm Cloudflare's current official pricing and quotas at approval time. Actual costs depend on measured encrypted object size, retention, object operations and account usage.

If aggregate storage or projected month-end usage exceeds 10 GB-month, the owner must choose an approved lower retention, compress/omit only explicitly approved large nonessential data, or accept a paid R2 overage. Do not automatically delete the only recoverable backup or reduce production retention to hide a warning.

## 5. Restore and recovery procedure

The restore command supports only an explicitly confirmed, empty local PostgreSQL database. It refuses:

- a missing `RESTORE_TARGET_MODE=isolated` or exact empty-local-database confirmation;
- an object outside the selected environment prefix;
- metadata/environment/encryption mismatches;
- a key ID mismatch;
- failed encrypted-byte or decrypted-dump hashes;
- a destination that is not a literal loopback URL and a `rova_restore_*` database;
- any connected database identity mismatch, non-loopback server address, recovery server, or existing user objects.

The target database must be empty and local; target labels alone do not establish isolation. The destination is checked before reading backup data and again immediately before restoration. The restore no longer uses `pg_restore --clean --if-exists`; it refuses populated targets instead. Staging and production destinations are unsupported by the command, and there is no live-restore override.

Required restore configuration:

```text
BACKUP_ENVIRONMENT=staging
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=<staging-private-bucket>
R2_ACCESS_KEY_ID=<staging-restore-token-access-key>
R2_SECRET_ACCESS_KEY=<staging-restore-token-secret>
BACKUP_ENCRYPTION_KEY_ID=<key-id-recorded-on-selected-object>
BACKUP_ENCRYPTION_KEY=<matching-environment-historical-key>
BACKUP_OBJECT_KEY=rova/postgres/staging/daily/<approved-object>.dump.custom.enc
RESTORE_TARGET_MODE=isolated
RESTORE_TARGET_DATABASE_URL=postgresql://<local-user>:<local-password>@127.0.0.1:5432/rova_restore_<unique-name>
RESTORE_ISOLATED_CONFIRM=I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE
```

Then run:

```bash
docker run --rm \
  --env-file /secure/path/staging-restore.env \
  --entrypoint node \
  rova-backup:backup-001 \
  scripts/backup/restore.mjs
```

The source backup may be selected from either supported backup environment, but the restore destination remains local and isolated. Staging/production restores are not supported by this command. Any future live recovery requires a separate approved workflow with explicit authorization and safeguards; do not extend the current confirmation flag to authorize it.

After the tool emits `restore_succeeded`, an operator must independently verify:

1. expected tables and schemas;
2. critical row counts and selected business records;
3. binary/JSON data where relevant;
4. Prisma/application compatibility if approved;
5. environment-specific secrets are not copied from the source database;
6. restore target access is revoked or the target destroyed after the drill.

If a restore fails, preserve the encrypted object and decryption key, record only sanitized error details, and do not restore into any live database.

## 6. Verification results

Verification timestamp: 2026-11-23 UTC.

### Automated tests

Command:

```bash
npx vitest run scripts/backup/backup.test.mjs
```

Result: 8 tests passed.

Covered:

- exact staging/production environment validation;
- 32-byte backup-key validation;
- rejection of a key shared with identity-notification encryption;
- AES-256-GCM encrypt/decrypt round trip;
- no plaintext in the encrypted object;
- tamper authentication failure;
- wrong key-ID rejection;
- custom-dump generation and archive-list validation using safe mocks;
- successful S3-compatible upload behavior using an in-memory mock;
- metadata, size and SHA-256 verification;
- failed upload with no retention deletion;
- transient upload retry;
- failed-process restart followed by successful upload;
- retention of the newest seven and preservation of the final backup.

Cloudflare R2 was **not contacted**. This mock result must not be described as real R2 integration.

### Dedicated image

The image built successfully from `scripts/backup/Dockerfile`. The final image runs non-root and contains PostgreSQL 18 client tools.

### Disposable PostgreSQL integration drill

The drill used:

- a disposable PostgreSQL 17 Alpine container;
- a source database containing explicit test fixtures;
- filesystem test storage, not Cloudflare R2;
- a 32-byte all-zero test key used only in the disposable local test;
- a separate target database named `rova_restore_test`;
- real `pg_dump` and `pg_restore`.

Fixture and results:

| Check | Result |
| --- | --- |
| PostgreSQL source accepted test rows | PASS: 3 rows |
| `pg_dump` custom-format generation | PASS |
| Plain custom dump size | 2,649 bytes |
| AES-GCM encrypted object size | 2,707 bytes |
| Mock-storage upload/byte verification | PASS |
| Download, authentication and decryption | PASS |
| Real isolated `pg_restore` | PASS |
| Restored text rows/order/content | PASS: 3 exact rows |
| Restored binary payload | PASS: `de00ad01beef` |
| Temporary PostgreSQL/storage cleanup | PASS |

The restore verified these exact rows in order:

```text
Accra dispatch fixture
Kumasi delivery fixture
Tamale recovery fixture
```

No Railway database was contacted. No real Cloudflare R2 bucket, account, credential or network was used.

## 7. Security review

| Control | Status |
| --- | --- |
| PostgreSQL remains private | Prepared; Railway private networking remains approval/runtime verification |
| Client-side encryption before storage upload | Implemented with AES-256-GCM |
| R2-scoped credentials | Required and documented; not provisioned or tested |
| Staging/production paths separated | Implemented |
| Staging/production credentials and encryption keys separated | Required and fail-closed where observable |
| Backup key distinct from identity-outbox key | Runtime equality check implemented |
| Key stored away from backups | Mandatory documented external custody |
| Public R2 access disabled | Required approval check; not provisioned here |
| Secret-safe logging | Implemented; do not relax |
| Upload integrity | Size, metadata and full SHA-256 download check implemented |
| Restore authentication/integrity | AES-GCM plus encrypted and plaintext SHA-256 checks |
| Last backup protection | Retention minimum is one and deletion happens only after verified new upload |
| Isolated restore guard | Explicit confirmation, object-prefix match and test/restore/drill database-name guard |
| Dependency audit | `npm audit` reported no vulnerabilities during package installation |

Remaining risks:

- R2 API/token scoping and anonymous-access state are not verified.
- Railway's actual plan, cron support, private DNS and runtime disk/CPU limits are not verified.
- R2 aggregate account storage and object counts are not known.
- Real compressed production/staging sizes are not known.
- A restore of the actual ROVA schema and data is not yet performed.
- Key escrow access, rotation and dual-control recovery have not been rehearsed.
- Alert delivery and missed-backup monitoring are not configured.

No backup system should be considered operational until those risks have corresponding evidence.

## 8. Exact approvals and owner actions

Approval is required separately for each action below. This report itself approves none of them.

1. Security approves private R2 bucket design, scoped token permissions, non-public settings and key-escrow custody.
2. Operations confirms an approved Cloudflare R2 account/billing ceiling and current R2 pricing/quotas.
3. Owner authorizes generation of two distinct backup encryption keys and records their custodians/key IDs.
4. Railway owner provides read-only evidence of the current plan, cron capability and private-network access without changing a resource.
5. Railway owner approves a dedicated, short-lived staging backup process only; no Pro upgrade is authorized.
6. Database owner approves the staging `DATABASE_URL` and confirms it is not production.
7. Operator creates only the approved private staging R2 bucket/token/secrets and runs one manual staging test.
8. An independent operator confirms staging R2 object privacy, metadata, SHA-256 verification, alert logs and seven-object retention.
9. Database owner creates a separate isolated restore database and approves a staging restore drill.
10. Security validates restored row integrity, key recovery from external escrow and post-drill target teardown.
11. Operations verifies actual staging encrypted size and projects combined 14-object storage use.
12. Separately approve production R2, secrets, process, manual test and restore drill. Staging approval does not authorize production.
13. Separately approve any Railway cron/schedule, application deployment, migration or infrastructure change.

Required pre-deployment evidence:

- sanitized screenshots/configuration exports for both private R2 buckets and token scopes;
- proof anonymous object access fails;
- sanitized Railway plan/private-network and cron evidence;
- first successful staging and production backup event records;
- `HeadObject`/download hash verification evidence without connection strings or secret material;
- actual measured encrypted sizes and aggregate retention projection;
- successful isolated restore results for each environment;
- key-recovery rehearsal and named dual custodians;
- missed-backup/failure alert test;
- explicit owner sign-off with a stated R2 monthly cost ceiling.

## 9. Prohibited actions and hold points

Do not:

- deploy this process during this task;
- enable Railway backups, PITR, cron, services or variables;
- expose either PostgreSQL service publicly;
- apply a Prisma migration or run any database reset;
- point restore at a live staging or production application database;
- enable customer bookings, dispatch or payments;
- copy the identity-notification key into backup configuration;
- upload plaintext dumps;
- commit `.env` files, dump files, encrypted test objects or keys;
- delete the last known recoverable object to meet a storage threshold;
- state that real R2 integration passed based only on the local mock drill.

**Final deployment recommendation: HOLD pending the exact approvals and external evidence above.**
