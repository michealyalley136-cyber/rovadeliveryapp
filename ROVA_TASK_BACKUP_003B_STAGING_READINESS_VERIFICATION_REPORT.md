# ROVA GHANA - BACKUP-003B staging readiness verification

Date: 2026-11-23. Repository branch: `feature/customer-dashboard`. Intended Railway project: `keen-contentment`; intended environment: `staging`.

## Executive summary

**NO-GO for a live staging backup now.** Local tests establish important worker behavior, not the live database, key escrow, IAM policies, storage safeguards or deployment settings. The staging owner must supply the evidence and approvals below. The worker does not itself enforce the staging bucket, and its Docker entrypoint executes a backup when started; those are material operational hazards, not assumptions of safety.

No live Railway, PostgreSQL or R2 operation was performed. No credentials were printed, the real encryption key was not read or decoded, and no password-manager contents were accessed. The only database writes were to newly created disposable, network-isolated local test containers containing synthetic data.

## 1. Railway and database isolation

- The local branch is verified. The project name and staging target are supplied by the task, not independently verified in Railway. The Railway CLI, local link/config and checked Railway token environment variable names were absent; no Railway control-plane or database connection was available. No available Railway tool provided authorized access.
- The earlier user-supplied read-only inspection says both staging and production services use `ghcr.io/railwayapp-templates/postgres-ssl:18`. Treat that as reported image configuration, **not** a measured server version or evidence of separate databases. Identical or different logical resource IDs alone do not prove physical isolation.
- Service membership, environment-scoped hostname, private DNS resolution, underlying database and volume identity, source credentials, production credential exclusion, and database read-only grants are **NEEDS OWNER EVIDENCE**. Railway documents private networking per environment, but that does not prove which database a particular URL references.
- Owner read-only procedure: in `keen-contentment` select `staging`; inspect the intended PostgreSQL service, environment-scoped volume and private domain; independently compare the production configuration without connecting to or querying production data. Confirm separate underlying storage/databases and staging-only credentials, resolving any ambiguity with Railway support. Inspect the worker's intended `DATABASE_URL` reference in staging, including service reference, private host, port and database, without revealing it. Do not rely on a shared variable or public TCP proxy.
- With separately authorized staging private-network access and securely injected libpq variables, run `psql -X -w -c 'SHOW server_version'` and `psql -X -w -c 'SHOW server_version_num'`; do not put a URL or password on a command line. The DBA must also verify target identity, TLS policy, staging-only access, read-only grants, complete schema/table/sequence/large-object access and RLS coverage. Share only sanitized pass/fail and version evidence. Do not apply migrations.

## 2. PostgreSQL compatibility

The worker Dockerfile installs `postgresql18-client`. The worker queries the connected server's `server_version_num` and `pg_dump --version`, failing before the dump if the server major exceeds the client. A local test checks the rejection. PostgreSQL 18 tools completed a synthetic PostgreSQL 18 backup/restore and restored a synthetic PostgreSQL 16 custom archive; see validation below.

Actual staging runtime version is **NEEDS OWNER EVIDENCE**, so real staging compatibility is not yet verified. If the measured server is newer than the installed client, stop and update/retest the worker. Use a compatible isolated restore server, normally the same major as the client or newer.

## 3. Local R2 configuration and secrets

The table reports only presence or bounded format checks in the current process environment; **PRESENT means defined, not necessarily nonempty, valid, authorized or configured in Railway**. Checks did not perform R2 requests.

| Variable | Presence | Checked format |
| --- | --- | --- |
| `R2_ACCESS_KEY_ID` | PRESENT | - |
| `R2_SECRET_ACCESS_KEY` | PRESENT | - |
| `R2_ENDPOINT` | PRESENT | VALID |
| `R2_BUCKET` | PRESENT | VALID |
| `BACKUP_ENVIRONMENT` | PRESENT | VALID |
| `BACKUP_ENCRYPTION_KEY` | PRESENT | - |
| `BACKUP_ENCRYPTION_KEY_ID` | PRESENT | VALID |

Endpoint validation was a basic `https://`/nonempty-host pattern, not an authenticated connection or full URL/jurisdiction check. Bucket and environment were compared to the requested staging values; key ID was checked against the worker's safe-character/length rules. The real key was **not read**, so its 32-byte decoded length and canonical encoding were **NOT TESTED**; an authorized owner must verify through an approved secret-handling mechanism without disclosing the value.

The backup source uses environment variables for R2 credentials and keys; a limited pattern scan of backup scripts found no common AWS access-key or private-key signatures. This is not a comprehensive secret audit or proof that all repository files are free of secrets. Test fixtures use synthetic credentials only.

**FAIL: production-bucket misconfiguration is not prevented by the worker itself.** `R2Storage` accepts the configured `R2_BUCKET`, while `BACKUP_ENVIRONMENT=staging` controls the object prefix, not bucket identity or authorization. The current local bucket comparison does not establish Railway's eventual settings or credential scope. BACKUP-002 reported staging credentials denied production-bucket `HeadBucket` during its earlier test; current authorization, PUT/DELETE restrictions and lifecycle policies remain **NEEDS OWNER EVIDENCE**. Before deployment, the owner must establish and document a provider-enforced staging-only credential boundary and exact bucket configuration, or separately approve a tested fail-closed implementation change. No live R2 retest is authorized by this task.

## 4. Encryption-key recovery

The implementation uses AES-256-GCM; its authenticated header includes the key ID, and object metadata also records the ID and hashes. Restore requires the matching ID and key, verifies downloaded ciphertext and decrypted-dump hashes, and reports failure for missing, mismatched or invalid keys. Synthetic encrypt/decrypt, tampering and missing-key behavior are covered locally.

**NEEDS OWNER EVIDENCE — owner confirmation is required** that an independent encrypted recovery copy of the exact key **and** ID exists outside both Railway and the Codespace, that authorized custodians can recover it, and that corresponding R2 access is available independently. A real backup cannot be recovered after Codespace deletion if that key is lost. No vault contents or actual key were inspected. The [deployment plan](./ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md) specifies escrow, break-glass access, private restoration and key rotation: retain each historical key/ID pair until all associated backups have safely expired.

## 5. Backup preservation and safeguards

| Check | Status | Evidence / limitation |
| --- | --- | --- |
| Unique object key | PASS | Each invocation adds 128 random bits; local repeated-run test produces distinct keys. Random uniqueness is probabilistic. |
| No overwrite on upload | PASS | `If-None-Match: *` conditional PUT is set and tested in a mock; collisions fail verification. Cloudflare documents atomic conditional writes. The revised path has not been tested against the actual staging bucket. |
| No automatic retention | PASS | Backup has no deletion loop and rejects `BACKUP_RETENTION_COUNT`; local tests retain pre-existing objects. No automatic deletion can remove the last known-recoverable object **through the backup path**. |
| External preservation | NEEDS OWNER EVIDENCE | Other R2 principals, lifecycle rules or bucket actions may delete/overwrite objects. Owner must prove scope and preserve the first backup until a complete independent restore succeeds. |
| Explicit, scoped test cleanup | PASS | Helper requires explicit keys under `backup-002-tests/rova/postgres/staging/daily/`, rejects production paths, unrelated real prefixes and traversal; tests use memory storage. The general `R2Storage.delete` method itself accepts a key without enforcing that prefix, and Cloudflare permissions must be independently restricted; do not treat the helper as a bucket-wide IAM control. |
| Test-prefix separation | PASS | Real objects start `rova/postgres/...`; the fixed opt-in test namespace is separate. Tests verify no real-key deletion. |
| Failed upload/restore | PASS | Unit tests cover upload errors, corrupted downloaded bytes and failed restore: failure is reported, no success event follows corruption, and retained objects are not deleted. An object can remain after a later failure. |
| Encrypt and verify before success | PASS | Code encrypts before upload, checks remote metadata/size and downloaded ciphertext SHA-256 before `succeeded`; local corruption test rejects a bad result. |
| Plaintext not retained | NEEDS OWNER EVIDENCE | Plaintext custom dump exists temporarily. New unit tests verify temporary directory removal after ordinary success and upload-verification failure; forced termination, crashes, snapshots and physical erasure are not covered by `finally`. Obtain encrypted ephemeral-storage, cleanup and destruction assurances before use. |
| Recovery metadata retained securely | NEEDS OWNER EVIDENCE | Object metadata stores format, environment, key ID, sizes and hashes; secure bucket access, independent key escrow and restricted operational records have not been verified. Metadata includes plaintext-dump SHA-256 and should be treated as sensitive. |

The worker's direct storage delete operation is not an authorization system. No cleanup or deletion of real storage was performed.

## 6. Worker deployment requirements

These are planned settings, **not** observed Railway settings:

- Separate staging-only worker, repository-root build context, `RAILWAY_DOCKERFILE_PATH=scripts/backup/Dockerfile`, non-root UID 10001, image entrypoint `node scripts/backup/backup.mjs`; no web application predeploy/start command, Prisma migration, public domain, HTTP listener, TCP proxy or persistent volume. Source files are currently untracked, so an approved immutable source/image publication method is needed before a Railway build can be trusted.
- **FAIL: deployment is not inherently passive.** Starting the image invokes the backup immediately. Do not create or start the service until an owner explicitly authorizes that first run together with the service deployment, or a separately reviewed and tested safe startup gate is provided. Prevent unintended restart loops, overlapping deploys and cron. Do not assume Railway configuration alone will defer the first execution.
- Required staging variables: `DATABASE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `BACKUP_ENVIRONMENT`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY_ID`. Use the intended staging private database and staging-only bucket credentials, supplied securely through Railway. Set bucket to `rova-ghana-db-backups` and environment to `staging`. `BACKUP_RETENTION_COUNT` and `BACKUP_TEST_PREFIX` must be unset for the first run. `BACKUP_STORAGE_DRIVER` defaults to `r2`; `R2_REGION` defaults to `auto`; optional controls are `BACKUP_STORAGE_WARNING_BYTES`, `BACKUP_UPLOAD_ATTEMPTS`, `BACKUP_RUN_ID`, `PG_DUMP_BIN` and `PG_RESTORE_BIN`.
- Worker extracts database host, port, user, password, database and `sslmode` from the URL; other query options are not forwarded. If needed, separately configure a trusted CA with libpq settings and verify TLS. The backup key must be independent of other staging and production keys.
- Start budget proposal: one replica, at most 1 vCPU and 512 MiB, subject to actual Railway plan and observed peaks; temporary disk needs approximately three times compressed dump size plus headroom. Verify plan eligibility, private networking, storage isolation/encryption, disk capacity, logs and alert routing before deployment.
- Web app predeploy settings are not visible now. Earlier reports describe `npx prisma migrate deploy` on the web service. Three local untracked booking/identity/outbox migrations exist; live migration status is unknown. A backup worker must not trigger those migrations or any application deployment.

## 7. Expected operating costs

Based on public [Railway pricing](https://railway.com/pricing) and [R2 Standard pricing](https://developers.cloudflare.com/r2/pricing/) reviewed in the earlier deployment plan, not actual workspace billing:

- At 30 runs/month, five minutes each, averaging 0.25 vCPU and 0.25 GB, compute is about **$0.026/month**; a full 1 vCPU and 0.5 GB over the same runtime is about **$0.087/month**. Workspace fee and shared included credits, builds, database load, retries and drills are additional or may be covered by credits.
- At 0.1 GB/upload, 30 runs generate approximately 3 GB worker egress, about **$0.15/month** at $0.05/GB if metered as ordinary Railway service egress. R2 Standard lists $0.015/GB-month, operation charges and account-wide free allowances; R2 direct egress is free.
- No automatic pruning exists: 30 x 0.1 GB objects reach roughly 3 GB at month end, with storage growing thereafter. Actual average daily peak storage, other account usage, retry traffic, operations and provider rounding affect bills. The account plan, usage, actual backup size and limits are unknown.

## 8. Local validation

| Validation | Status | Evidence |
| --- | --- | --- |
| Backup, encryption, disabled retention and prefix isolation | PASS | 22 focused Vitest tests passed, including two new tests for corrupted upload verification and ordinary temporary-file cleanup. Missing-key rejection was also added. No real R2 requests. |
| PostgreSQL 18 integration and PostgreSQL 16 archive restore | PASS | Two Node integration cases against disposable isolated PostgreSQL containers and filesystem test storage; synthetic rows and binary values only. |
| Worker image | PASS | Local Docker build of the worker image succeeded; Dockerfile uses non-root user and PostgreSQL 18 client. This does not verify a future Railway deployment. |
| Syntax and scoped ESLint | PASS | All five backup JavaScript files passed `node --check` and scoped ESLint. |
| Actual staging database and current R2 credential permissions | NOT TESTED | Live database access and R2 calls were not performed. |
| Abrupt-kill plaintext cleanup, Railway ephemeral storage and actual backup restoration | NOT TESTED | Requires provider evidence and a separately authorized private drill; no live backup exists in this task. |

## 9. Approval matrix

| Requirement | Status | Evidence | Next action |
| --- | --- | --- | --- |
| Railway staging database isolation | NEEDS OWNER EVIDENCE | No authenticated Railway inspection; network isolation is not proof of data isolation. | Verify environment-scoped target, independent database/volume and staging-only credentials. |
| PostgreSQL version compatibility | NEEDS OWNER EVIDENCE | PG18 image tag reported; local PG18 tests pass, actual server unknown. | Read staging server version privately; compare with client. |
| Cloudflare R2 staging configuration | NEEDS OWNER EVIDENCE | Local non-secret target checks passed; Railway configuration and current token scope unknown. | Confirm Railway staging bucket, HTTPS endpoint, scoped permissions and lifecycle without exposing values. |
| Encryption-key recovery copy | NEEDS OWNER EVIDENCE | No external vault evidence; real key was not read. | Owner confirms independent escrow and recovery of key and ID before first backup. |
| Backup preservation | NEEDS OWNER EVIDENCE | Worker disables deletion and uses conditional PUT; external deletion and actual bucket policy unknown. | Verify external controls; preserve first object until independent restore. |
| Worker container security | NEEDS OWNER EVIDENCE | Non-root Dockerfile and local build verified; Railway service and temporary-storage protections not verified. | Verify effective service settings, encrypted ephemeral storage, no inbound access and cleanup. |
| Database read-only access | NEEDS OWNER EVIDENCE | No live credentials or grants inspected. | DBA confirms staging-only least-privilege access and complete dump coverage. |
| First backup authorization | NEEDS APPROVAL | Deployment starts backup; no approval exists for execution. | Approve exact staging service, immutable source, target, safeguards and one-time run after evidence is complete. |
| Independent restoration procedure | NEEDS OWNER EVIDENCE | Procedure documented and synthetic restoration tested; escrow and isolated real-data target unverified. | Prove key recovery and provision an approved isolated restore drill after the backup. |
| Daily automation readiness | NEEDS OWNER EVIDENCE | Cron eligibility, alerting and safe retention controls unverified; worker never prunes. | Verify plan and monitoring; design tested minimum-recoverable retention, then obtain separate approval. |
| Production-bucket targeting guard | FAIL | Code accepts an arbitrary configured bucket, independently of environment. | Verify enforceable staging-only R2 scope or approve a tested fail-closed guard before execution. |
| Passive worker deployment | FAIL | Docker entrypoint immediately starts the backup. | Explicitly approve first run with deployment, or separately implement and test a safe startup gate. |
| Real encryption-key format | NOT TESTED | Real key was not read or decoded. | Owner verifies canonical base64url and 32-byte length without disclosure. |
| Actual staging backup and restore | NOT TESTED | Prohibited in this task. | Perform only under separate, explicit authorization after all gates close. |

## 10. Required confirmations and approvals

1. Database owner: actual staging version, service/volume and private target identity; independent credentials and read-only coverage; no unintended migration/predeploy.
2. Security/data owner: scoped staging R2 credentials and external preservation; independently retained key and ID; encrypted ephemeral storage, controlled logs, restoration privacy and secure destruction.
3. Infrastructure/billing owner: approved resource and disk limits, plan/cron eligibility, alerts and measured costs.
4. Release owner: immutable source publication and dedicated service, with explicit authorization for **one** staging backup on startup. A separate approval is needed for an isolated restore drill and for daily scheduling or any pruning.

## Final recommendation

**NO-GO.** Resolve the two verified configuration hazards and obtain the outstanding owner evidence and approvals before starting a first live staging backup. The present report does not authorize service creation, deployment, backup, restore, deletion or schedule changes.
