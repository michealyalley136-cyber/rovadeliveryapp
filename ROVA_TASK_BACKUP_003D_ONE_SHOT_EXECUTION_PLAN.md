# ROVA Ghana - BACKUP-003D one-shot execution plan

**Decision: NO-GO for deployment or a live backup until the evidence and separate approvals below are obtained.** This is a plan, not authorization. Nothing was deployed, no live database was contacted, no backup was executed, and no R2 request was made for this task.

The temporary passive SSH design below supersedes BACKUP-003C's restriction against an idle process and its unresolved remote-command mechanism. It does not supersede any security, isolation or recovery gate in the [staging deployment plan](./ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md).

## 1. Evidence and limits

| Requirement | Finding |
| --- | --- |
| Worker and source | The existing non-root image and backup implementation were reused without modification. The backup scripts are untracked on `feature/customer-dashboard`; a Git deployment of the branch is not an acceptable way to obtain them. The worktree also contains unrelated application changes. |
| Bounded startup | Locally, `/bin/sleep 12` ran as PID 1 with network disabled and UID 10001, remained available for `docker exec`, and exited successfully after its timer. The proposed Railway setting is `/bin/sleep 1800` with restart policy **Never**. Its effective behavior and SSH availability on Railway have not been tested. |
| Default startup | Locally, the image's normal entrypoint returned `idle_no_backup` with networking disabled. No backup process runs at startup. Railway must actually apply the passive override before credentials or execution are trusted. |
| Guards | 16 selected unit tests passed, with 22 skipped. A network-disabled container accepted `--verify` with synthetic settings and rejected both missing authorization and an authorized command with a production environment, before backup began. No authorized backup was run in this task. |
| PostgreSQL | The image installs PostgreSQL 18 client tools and the script rejects a server newer than its client. The user previously reported a PostgreSQL 18 image for each environment; the running staging server version remains unmeasured. BACKUP-003C recorded two passing disposable PostgreSQL integration cases for PostgreSQL 18 and an older PostgreSQL 16 archive; these were not rerun here. |
| Railway | Railway CLI and authenticated project access were unavailable. Project selection, staging database identity, private reference, credentials, applied settings, SSH and service variables remain unverified. Railway documents environment-scoped private networks, but these do not prove separate underlying data, volumes or credentials. |
| R2 | The staging guard pins `rova-ghana-db-backups` and the official HTTPS R2 endpoint shape, but not the Cloudflare account or credential permissions. BACKUP-002 reported staging credentials were denied a production-bucket `HeadBucket`; this is historical evidence, not proof of current permissions. No new R2 operation occurred. |
| Recovery | Encryption/decryption and key-ID handling have prior synthetic tests. The real key was not read, copied, changed or independently recovered. **NEEDS OWNER CONFIRMATION:** a usable recovery copy of the exact key and ID exists outside Railway and GitHub. |

Prior BACKUP-003C validation also reported 38 unit tests, scoped lint and syntax checks, and two disposable PostgreSQL integration tests. They are historical results, not tests rerun here. Local BACKUP-003D testing used synthetic values and no network or backup; the test container and image were removed. The Git stash was not altered.

## 2. Reviewed backup-only deployment package

The local deliverable `rova-backup-003d-worker.tar` contains exactly these six files, preserving their paths:

```text
scripts/backup/Dockerfile
scripts/backup/package.json
scripts/backup/package-lock.json
scripts/backup/backup.mjs
scripts/backup/restore.mjs
scripts/backup/lib.mjs
```

Its SHA-256 is `5fd9b596223ed729108c6d7d1559bbd3206ead4aabadec1d04042aa290345e37`. A local Docker build from this archive succeeded, including `npm ci --omit=dev` and the PostgreSQL 18 client. The archive excludes the web application, migrations, `.env` files, tests, Git metadata and unrelated uncommitted changes. The final image also includes the locked production Node dependencies and base-image packages. It is not a published or independently signed release; an authorized reviewer must verify the archive digest and review these untracked source files and dependency lock before use. Protect the archive against substitution and reapprove any changed digest.

For a future, separately approved deployment, extract the verified archive into a **new empty directory outside the repository**, inspect its exact file list and ensure nothing else is present. Use this directory as the entire upload/build context; do not run `railway up` on the dirty repository. Do not push the feature branch. Retain the reviewed archive and digest securely for the restore drill.

## 3. Exact proposed staging service settings

After separate service-creation and deployment approval, select the existing project **keen-contentment** and **staging** environment, then create a dedicated temporary service with no Git source, automatic deploy trigger or app association. Before deploying, review all staged settings and confirm they apply to this service and staging only:

| Setting | Required value |
| --- | --- |
| Build | Dockerfile builder; context is the empty-directory extraction of the six-file archive; `RAILWAY_DOCKERFILE_PATH=scripts/backup/Dockerfile`. No application build or start command. |
| Start command override | `/bin/sleep 1800` exactly. Railway documents that a Docker image start override replaces the default image start command. This is a passive process, not the backup entrypoint; verify effective deployment settings. |
| Lifecycle | One replica; restart policy **Never**; no cron, redeploy trigger, predeploy command, migration, HTTP healthcheck or persistent volume. Do not configure an automatic retry. |
| Networking | No public domain, TCP proxy or HTTP endpoint. Private environment networking must reach only the verified staging database as authorized; outbound HTTPS to the authorized R2 account is required for the later backup. SSH is an authenticated Railway control-plane access path, not a public application endpoint. Restrict operators and registered SSH keys. |
| Resources | Proposed maximum 1 vCPU and 512 MiB, if supported by the actual plan; verify ephemeral disk can hold at least three times the expected compressed dump plus headroom. Actual size, limits and provider guarantees require owner evidence. |

The override deliberately keeps a service alive for at most 30 minutes from container start, then exits. Confirm the deployment remains stopped after exit and does not restart. Do not launch an execution if the remaining lifetime is less than the DBA's conservative expected backup-plus-verification time plus a safety margin. If 30 minutes is insufficient, stop and obtain approval for a suitably sized bound before deployment. An expiry, crash or disconnect during execution can interrupt `pg_dump`, verification or upload, leave an object of uncertain status and leave temporary plaintext until the platform destroys storage; treat that as a failure, preserve all objects, investigate and do not retry without fresh approval. A lost SSH connection alone does not establish whether the remote command finished.

Service variables, configured only by an authorized owner in the staging service's secure UI or approved secret manager, are:

| Name | Requirement |
| --- | --- |
| `DATABASE_URL` | Staging-only read-only backup principal and database on the verified private host and port, with approved TLS settings. A `${{STAGING_POSTGRES_SERVICE.DATABASE_URL}}` reference is only an example: substitute the actual staging service name and use it only if its resolved URL is private and uses an appropriately restricted backup principal. Do not assume the provider's default database credentials are read-only. |
| `BACKUP_STAGING_DATABASE_HOST` | Exact verified private hostname from that same staging service, e.g. `${{STAGING_POSTGRES_SERVICE.RAILWAY_PRIVATE_DOMAIN}}` if the reference exists and resolves correctly. Verify host equality without printing the URL. |
| `RAILWAY_PROJECT_NAME`, `RAILWAY_ENVIRONMENT_NAME` | Railway-provided runtime values must be `keen-contentment` and `staging`. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Staging-only credentials, restricted to the correct account and bucket; no production credentials. |
| `R2_ENDPOINT`, `R2_BUCKET` | Official bare HTTPS R2 account endpoint; bucket exactly `rova-ghana-db-backups`. Confirm account and effective permissions independently. |
| `BACKUP_ENVIRONMENT` | `staging`. |
| `BACKUP_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY_ID` | Existing staging key, canonical base64url encoding of exactly 32 bytes, and its matching unique identifier. Obtain from the approved secret store without displaying or copying either into reports. Confirm independent recovery before the first live run. |
| Optional | `BACKUP_STORAGE_DRIVER` defaults to `r2`; `R2_REGION` defaults to `auto`; `BACKUP_UPLOAD_ATTEMPTS` defaults to 3; `BACKUP_STORAGE_WARNING_BYTES` defaults to 4 GiB; `BACKUP_RUN_ID` may be a safe identifier. Leave `PG_DUMP_BIN` and `PG_RESTORE_BIN` unset to use image tools. |
| Must be unset | `BACKUP_EXECUTION_AUTHORIZATION`, `BACKUP_RETENTION_COUNT`, `BACKUP_TEST_PREFIX`, `BACKUP_TEST_STORAGE_DIR`, `PGHOSTADDR`, `PGSERVICE`, and `PGSERVICEFILE`. Never persist the authorization marker. |

`NODE_ENV=production` is an image runtime setting, not selection of a production database. Guard inputs are not independent identity evidence. The URL parser forwards `sslmode` but not arbitrary URL query options such as `sslrootcert`; if required, arrange a trusted CA and libpq TLS configuration separately and verify it. The principal must read all intended schemas, tables, sequences and large objects, including RLS-covered data, without writes or DDL. Document missing privileges, extension dependencies and scope; stop if completeness is uncertain.

The first-run source is private compressed plaintext before encryption. Confirm encrypted isolated ephemeral storage, snapshots, disk capacity and secure disposal with Railway. Normal cleanup does not guarantee deletion after a crash or cryptographic erasure. If these safeguards are not acceptable, do not deploy/run this design.

## 4. Future deployment and SSH commands - DO NOT RUN NOW

Only after the owner has approved service creation and deployment, created the dedicated empty staging service, configured and reviewed the settings above, and verified CLI authentication and IDs, the deployment command is:

```sh
railway up <REVIEWED_EMPTY_EXTRACT_DIRECTORY> --path-as-root --project <PROJECT_ID> --environment staging --service <TEMP_WORKER_SERVICE_ID>
```

Replace each placeholder with its reviewed value; do not paste literal angle brackets. The command uploads and deploys. Do not use `--new` or `--yes`, and cancel any prompt to create a project or target another service. The Railway CLI can create resources when run interactively without a linked project, so explicitly verify the project and existing temporary service before proceeding. Check the effective build/start/restart settings and the specific running deployment instance immediately; if anything differs, stop. Do not deploy the customer application.

Railway's documented syntax is `railway ssh [OPTIONS] [COMMAND...]`, with `--project`, `--environment`, `--service`, `--deployment-instance` and `--` before a remote command. It requires a registered SSH key. Obtain the actual **deployment instance ID** from the staging deployment; it is not the service ID. For services without a domain, Railway also documents a service-instance ID as an SSH target; do not confuse that with a service ID or assume it is the deployment-instance ID. Verify the dashboard/CLI target and registered operator key, without changing production.

The safe configuration preflight, after deployment approval but before backup approval, is:

```sh
railway ssh --project <PROJECT_ID> --environment staging --service <TEMP_WORKER_SERVICE_ID> --deployment-instance <DEPLOYMENT_INSTANCE_ID> -- node /app/scripts/backup/backup.mjs --verify
```

Require exit 0 and `configuration_valid`. This checks locally without contacting PostgreSQL or R2; it does not prove service identity, credential scope, connectivity or recoverability. If the SSH process does not receive service variables, or Railway cannot execute this command on the specified instance, stop. Do not print variables or use `railway run` as a workaround: it runs locally, not inside the private service. Actual SSH variable propagation and command execution are **not verified** here.

Only after a distinct, explicit first-backup approval, sufficient remaining timer, all owner evidence and the preflight above, execute exactly once:

```sh
railway ssh --project <PROJECT_ID> --environment staging --service <TEMP_WORKER_SERVICE_ID> --deployment-instance <DEPLOYMENT_INSTANCE_ID> -- env BACKUP_EXECUTION_AUTHORIZATION=STAGING_ONE_TIME_APPROVED node /app/scripts/backup/backup.mjs --execute-staging
```

The authorization marker is an intent guard, not a secret, expiring credential, unique token or replay protection. Repeating the command creates another backup; coordinate one operator and no retry. `--execute-staging` refuses missing authorization, non-staging settings, a different bucket and invalid private-host configuration before backup. It also checks the actual server version against `pg_dump` before dumping. The separate owner evidence below is necessary because these checks cannot prove the true target or R2 account.

Monitor structured results in a restricted operations channel. Require the documented success event and exit 0, including successful encrypted upload, HEAD/metadata/size and full downloaded SHA-256 verification; verify `deletedCount=0`. Record only approved operational metadata: time, run/object ID, key ID, software/client and server versions, ciphertext size, integrity result, exit status and restore status. Treat metadata and provider errors as sensitive; do not publish credentials, connection strings or records. A failed, timed-out, disconnected or ambiguous command is not success; preserve all objects and investigate before an independently approved retry.

## 5. Owner evidence before any execution

- **Railway and database:** In the dashboard select `keen-contentment > staging`; identify the staging PostgreSQL service, its environment-scoped private domain, database and volume instance. Inspect the worker's reference and resolved connection privately; ensure it cannot reference production, a shared production variable, public proxy or an external production database. Confirm staging-only credentials, independent underlying data/volume, private IPv6/DNS routing, TLS, read-only permissions and full dump coverage. Matching or differing logical resource IDs alone prove neither isolation nor shared data. Ask Railway support if the control plane cannot establish the boundary. Do not query production data.
- **Actual version:** Following separate approval for a staging connection, an authorized owner can inject staging-only libpq variables securely in a trusted private-network session and run `psql -X -w -c 'SHOW server_version_num'` plus `pg_dump --version`, recording only versions. `psql` does not automatically consume `DATABASE_URL`. The future worker also checks before dumping. If the server is newer than the client, stop and update/retest; do not rely on an image tag.
- **Key recovery - NEEDS OWNER CONFIRMATION:** An authorized custodian confirms the exact existing key and matching ID are held in an encrypted, independently controlled recovery vault outside Railway and GitHub, with documented break-glass access and independent R2 read access. Verify retrieval/injection into an isolated runner without printing or exporting secret values to chat, logs or reports. Do not change the existing key for this task. Keep historical key/ID pairs and R2 access for as long as their backups are retained; after any separately approved rotation, select the original pair by object metadata and prove an old backup still restores before retiring a key. Actual key-ID association is not independently verified here.
- **R2 and preservation:** Verify the Cloudflare account, staging bucket and token are correctly scoped and cannot access production, using approved configuration evidence. Confirm lifecycle rules and other principals cannot delete or overwrite the first object or other required points; the worker's lack of automatic deletion does not constrain external actors. Preserve the first successful object until an independent complete restore passes, and never permit automatic deletion of the last known-recoverable object.
- **Operations:** Verify budget, service quota, effective Never restart, 30-minute bound, private SSH, runtime variables, no cron or app hooks, storage encryption/disposal, disk headroom, alerts, and operator ownership. Verify source checksum, current staging migration/predeploy state and an explicit no-migration decision.

## 6. Preservation and isolated restoration

Each backup key includes a random 128-bit suffix and upload uses conditional `If-None-Match: *`; retries or collisions must not overwrite an existing object. Automatic retention and cleanup are absent, and the obsolete retention variable is rejected. Test cleanup is restricted to explicit keys under the separate `backup-002-tests/` namespace, not normal `rova/postgres/staging/daily/` objects. Failures do not trigger deletion. Only ciphertext is uploaded; plaintext exists temporarily on the worker. Cloudflare enforcement of the current conditional PUT and independent external retention controls remain owner evidence, not a new live test.

After separate restore-drill authorization, retain the first object and:

1. Provision a disposable PostgreSQL server on the same isolated host and bind it only to loopback; do not use a remote database URL. Create an empty database named `rova_restore_<unique-name>`. The restore command checks the literal loopback URL and independently queries the connected database, user, server address and existing user objects; a target label or name alone is not isolation.
2. In a fresh non-root restore process, independently retrieve the matching key and ID and staging R2 read-only credentials. Securely inject `BACKUP_ENVIRONMENT=staging`, the R2 variables, `BACKUP_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY_ID`, `BACKUP_OBJECT_KEY`, `RESTORE_TARGET_MODE=isolated`, `RESTORE_TARGET_DATABASE_URL`, and `RESTORE_ISOLATED_CONFIRM=I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE`; leave `BACKUP_RETENTION_COUNT` and `BACKUP_TEST_PREFIX` unset. The URL must use a loopback address and the `rova_restore_` prefix. Override the image entrypoint to run `node /app/scripts/backup/restore.mjs`. Staging and production destinations are refused; this command has no live-restore override.
3. Require ciphertext hash verification, authenticated decryption, plaintext hash and archive validation, two successful empty-target identity checks, successful `pg_restore`, `restore_succeeded` and exit 0. The restore does not use destructive `--clean`; populated targets are rejected and conflicting objects cause restore failure. Check schema, extensions, migration state, table counts and representative records privately. Exact comparisons require a separately approved write freeze spanning the baseline and snapshot, or another verified same-snapshot method; otherwise call checks plausibility checks. Never export private rows, unreviewed logs or record hashes.
4. Record only safe pass/fail and aggregate results, recovery duration and key ID. This fresh restore process demonstrates recovery without the original worker or Codespace. Destroy the disposable runner, database, encrypted storage, snapshots and associated logs using the provider's verified secure-destruction or cryptographic-erasure process; ordinary file deletion is not proof of erasure. Preserve the R2 object.

Logical backups omit cluster roles, ownership, ACLs and external configuration, and are not PITR: they cannot replay WAL to an arbitrary time. Confirm separate recovery of those dependencies and separately assess PITR.

## 7. Teardown, costs and approvals

After the command completes or fails, wait for the bounded process to exit and verify no automatic restart. Following the separately approved temporary-service teardown, remove **only** the identified staging worker deployment/service and its dedicated variables using Railway's dashboard; confirm no service remains running and no unintended deployments exist. Do not delete the PostgreSQL service, its volume, R2 bucket or any backup object. Preserve approved metadata and the encrypted backup; confirm temporary plaintext storage disposal. Do not enable a cron schedule. Later daily automation, restoration drills and retention/deletion mechanisms require separate review and approval.

Railway's published container rates are approximately $0.000463/vCPU-minute and $0.000231/GB-minute. A 30-minute session at a constant 1 vCPU and 0.5 GB would be about **$0.0174** compute; idle usage should be lower but is not measured. Add workspace plan fees/credits, network egress ($0.05/GB), R2 storage and requests, database load, retries and restore costs. Check actual billing, pricing, plan, limits and shared free allowances; no charge is guaranteed to be zero. No automatic pruning exists, so retained storage grows.

Required approvals are distinct: (1) source/security and staging service creation/configuration/deployment; (2) exactly one first backup after preflight and all evidence; (3) independent isolated restore and secure destruction; and (4) any later automation or retention change. Owner confirmation of external key recovery, actual staging isolation/version/permissions, R2 scope and external preservation, ephemeral storage safeguards, Railway SSH behavior and effective settings remain outstanding.

**Final recommendation: NO-GO** until those items are evidenced and the relevant separate approvals are granted. Documentation establishes a plausible SSH workflow, not successful execution on this project.

## Sources

- [Railway SSH CLI](https://docs.railway.com/cli/ssh), [deploy CLI](https://docs.railway.com/cli/up), [start command overrides](https://docs.railway.com/builds/build-and-start-commands), [restart policy](https://docs.railway.com/deployments/restart-policy), [private networking](https://docs.railway.com/networking/private-networking), [variables](https://docs.railway.com/variables), [pricing](https://docs.railway.com/pricing/plans).
- [BACKUP-002 evidence](./ROVA_TASK_BACKUP_002_REAL_R2_VERIFICATION_REPORT.md), [BACKUP-003C safety report](./ROVA_TASK_BACKUP_003C_FINAL_DEPLOYMENT_SAFETY_REPORT.md), [deployment plan and detailed recovery procedures](./ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md), [worker Dockerfile](./scripts/backup/Dockerfile), [backup implementation](./scripts/backup/lib.mjs).
