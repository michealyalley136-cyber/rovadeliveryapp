# ROVA GHANA - BACKUP-003C final deployment safety report

Date: 2026-11-23. Project requested: `keen-contentment`; environment: staging; branch: `feature/customer-dashboard`.

## Recommendation: NO-GO for a live backup

Local startup and staging safeguards are implemented and tested. Owner confirmation is still required for real Railway database identity and isolation, key recovery, R2 permissions and retention protections, encrypted temporary storage, and a provider-supported no-cron one-shot launch that cannot automatically repeat. Deployment and first execution require separate approvals. No live Railway database was contacted, no R2 request was made, and no backup, deployment, migration, Railway configuration change, commit or push was performed.

## 1. Startup and authorization safety

The existing non-root image still enters `node scripts/backup/backup.mjs`, but its default mode now emits `idle_no_backup` and exits successfully without connecting, even if an authorization marker is present. It does not keep an idle worker alive. `--verify` validates configuration locally without connecting; `--execute-staging` invokes the existing backup workflow only after its authorization and staging checks pass. Unknown arguments fail. The root package's existing `backup:run` invokes the same passive default with no arguments, not a backup. No cron, Prisma command or predeploy hook was added.

Execution requires `BACKUP_EXECUTION_AUTHORIZATION=STAGING_ONE_TIME_APPROVED`, `RAILWAY_PROJECT_NAME=keen-contentment`, `RAILWAY_ENVIRONMENT_NAME=staging`, `BACKUP_ENVIRONMENT=staging`, `R2_BUCKET=rova-ghana-db-backups`, an official bare HTTPS R2 account endpoint, R2 storage and credentials, a valid key and ID, and a PostgreSQL URL whose private hostname equals `BACKUP_STAGING_DATABASE_HOST`. `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE`, `BACKUP_TEST_PREFIX` and the obsolete retention setting must be unset. A missing or invalid requirement fails before a dump or R2 request. The server/client version check runs before `pg_dump`.

These are defense-in-depth checks, not proof of isolation: Railway-provided names and the approved host are configuration inputs, and a misconfigured private service could still point elsewhere. Only independently verified Railway networking, staging-only database credentials and R2 authorization can establish the real production boundary. The generic restore/test helpers are not a security sandbox for arbitrary code running in the image.

### Exact planned command - do not run now

In an explicitly approved **one-shot container already in the staging private network**, with all other staging variables securely injected:

```sh
BACKUP_EXECUTION_AUTHORIZATION=STAGING_ONE_TIME_APPROVED node /app/scripts/backup/backup.mjs --execute-staging
```

The marker is not a secret, a unique token, or durable replay protection: running the command again creates another backup. Do not store it in Railway service variables or a persistent start override; prevent retry, restart and overlapping execution. An owner must verify a Railway-supported method for injecting this command for exactly one run without an always-running service or a configured cron schedule. Current Railway documentation says `railway run` executes locally and `railway cron run` requires a cron schedule; neither is established as the required remote no-cron one-shot. Until the actual invocation mechanism and its lifecycle/retry behavior are proven, first execution remains blocked. Never run the command from this report merely to test it.

## 2. Database and Railway evidence

The current branch is verified; Railway CLI and control-plane access were unavailable. The project/environment and both PostgreSQL image tags (`ghcr.io/railwayapp-templates/postgres-ssl:18`) were reported by the user, not independently checked. No staging or production database connection was made. Matching or differing logical resource IDs do not establish whether underlying data or volumes are independent.

**NEEDS OWNER EVIDENCE:** select `keen-contentment > staging`, verify the service/volume and environment-scoped private domain, and confirm the worker's `DATABASE_URL` and `BACKUP_STAGING_DATABASE_HOST` reference that staging service only. Verify distinct physical database/volume and staging-only credentials by control-plane evidence without accessing production data. Check read-only privileges, complete data coverage, RLS, TLS and private routing. For actual PostgreSQL version, an owner may later use the read-only procedure in the [deployment plan](./ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md); the image tag alone is not a runtime version. The local image installs PostgreSQL 18 tools and fails closed if the actual server is newer.

## 3. Encryption recovery

No existing key or secret value was read, copied, replaced, or rotated. No Railway variables were changed. The implementation uses authenticated AES-256-GCM and records the key ID in the encrypted header and metadata; restore requires the matching ID/key and checks integrity. Local synthetic tests show successful encryption, decryption and restore and rejection of missing/wrong keys.

**NEEDS OWNER CONFIRMATION:** the real key's association with its ID, an independently retained recovery copy of both outside Railway and the Codespace, independent R2 recovery access, and tested break-glass retrieval. The real key was not inspected; its format and identity are not independently verified. Retain old key/ID pairs for all historical backups throughout their recovery lifetime, and test restoration before retiring them. Loss of the key makes the corresponding backup unrecoverable.

## 4. Preservation and isolation

- The normal execution path pins the bucket name and staging environment; it rejects the named production bucket and other invalid settings before database or storage work. Current real credential scope and account identity remain **NEEDS OWNER EVIDENCE**. BACKUP-002's earlier staging-token denial of production-bucket `HeadBucket` remains historical evidence, not a new verification or proof of all permissions.
- Every object key includes a 128-bit random suffix; conditional `If-None-Match: *` PUT protects existing keys against overwrite. Local mock tests cover collisions. No real R2 request tested the new guard or conditional path.
- There is no automatic retention or deletion in the backup workflow. `BACKUP_RETENTION_COUNT` is rejected. Test cleanup is restricted to explicit staging keys under the separate `backup-002-tests/` namespace. Failure paths do not call deletion. This does not prevent other principals or lifecycle rules from deleting backups: the owner must establish external protection, preserve the first successful object through an independent successful restore, and ensure the last known-recoverable object is never deleted automatically.
- Only encrypted data is uploaded; the implementation first writes a compressed plaintext dump in a restricted temporary directory. Normal cleanup is tested, but forced termination and block-storage erasure cannot be guaranteed by `finally`. Obtain evidence for encrypted ephemeral storage, crash cleanup, snapshots and secure disposal before running.

## 5. Local validation

| Check | Result |
| --- | --- |
| Unit tests | 38 passed; include missing authorization, invalid project/environment/bucket/private hostname, libpq override rejection, missing configuration, verification-only mode, existing preservation tests, and an authorized workflow using synthetic in-memory storage and fake PostgreSQL commands. |
| Real image startup | Local Docker build succeeded; with networking disabled, default startup exited with `idle_no_backup`, including when the authorization marker and synthetic configuration were present. An explicit execution without authorization exited nonzero. |
| Authorized CLI entry | With entirely synthetic configuration and networking disabled, `--execute-staging` entered the backup workflow, failed at PostgreSQL connectivity and reported failure without success. No R2 operation occurred. |
| PostgreSQL integration | Two passed: PostgreSQL 18 synthetic encrypted backup/restore and a PostgreSQL 16 synthetic archive restored by PostgreSQL 18 tools. Filesystem test storage and disposable isolated containers were used. The validated private hostname was mapped to loopback by the test's injected command runner; this does not verify Railway DNS. |
| Lint and syntax | Scoped ESLint and `node --check` passed for backup scripts and tests. |

The temporary test containers, synthetic archive and local test image were cleaned up. No real staging key was used in these tests.

## 6. Costs and required decisions

Using the published rates summarized in the deployment plan, 30 five-minute runs averaging 0.25 vCPU and 0.25 GB are roughly $0.026/month compute; 0.1 GB per daily upload adds about $0.15/month Railway egress at $0.05/GB. R2 Standard storage/operations and workspace plan fees/credits depend on actual account usage. Without automatic pruning, retained data and cost grow; these are estimates, not measured bills.

Before any future action:

1. Database owner confirms actual staging server major, private service/volume isolation, staging-only credentials, read-only grants and schema coverage.
2. Security owner confirms external key/ID recovery, R2 token/account scope, first-object preservation and encrypted ephemeral-storage safeguards.
3. Infrastructure owner verifies the no-cron, no-idle, non-repeating one-shot launch mechanism, effective startup/restart settings, limits, monitoring and costs.
4. Release owner separately approves immutable worker source, staging-only deployment, and then exactly one execution. The worker files are currently untracked; they are not automatically available to a Railway Git build. Independent restoration and daily automation require further approval.

The [BACKUP-003B report](./ROVA_TASK_BACKUP_003B_STAGING_READINESS_VERIFICATION_REPORT.md) is historical; its default-start and bucket-guard findings are superseded by this report. All outstanding owner evidence remains open.
