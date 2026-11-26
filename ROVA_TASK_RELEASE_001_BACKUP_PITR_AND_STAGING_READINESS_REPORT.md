# ROVA GHANA — RELEASE-001 Backup, PITR and Staging Readiness Report

**Historical assessment:** Its test results and Railway observations describe the time of RELEASE-001, not current deployment readiness. The DNS-pinning finding below was subsequently addressed locally; see [SECURITY-FIX-002](./ROVA_TASK_SECURITY_FIX_002_WEBHOOK_HARDENING_REPORT.md). Scheduler HTTPS and redirect protections were added later; see [SCHEDULER-SEC-001](./ROVA_SCHEDULER_SEC_001_REPORT.md). A private HTTP-only worker endpoint remains incompatible with production scheduler transport requirements. Separate current evidence and approvals are still required before deployment or migration.

## Executive recommendation

**HOLD: do not migrate or deploy staging.**

The application code is locally verified, but the required Railway project protection state could not be inspected. No Railway CLI token, linked Railway project, `RAILWAY_*` access variable or database service URL was available. Therefore staging and production volume backup enablement, PITR health, retention, PostgreSQL versions, storage, restore points and recoverability are **UNVERIFIED**, not assumed.

No Railway resource, variable, database, migration, worker or secret was changed.

## 1. Railway database protection audit

Project: **keen-contentment**

| Item | Staging | Production |
| --- | --- | --- |
| Volume backup enabled | UNVERIFIED | UNVERIFIED |
| Daily/weekly/monthly schedules | UNVERIFIED | UNVERIFIED |
| Volume snapshot retention/recovery points | UNVERIFIED | UNVERIFIED |
| PITR enabled | UNVERIFIED | UNVERIFIED |
| PITR archiving healthy | UNVERIFIED | UNVERIFIED |
| First base backup completed | UNVERIFIED | UNVERIFIED |
| Restore window/recoverable timestamp range | UNVERIFIED | UNVERIFIED |
| PostgreSQL major/minor version | UNVERIFIED | UNVERIFIED |
| Volume size/used size/free space | UNVERIFIED | UNVERIFIED |
| Storage bucket/PITR variables | UNVERIFIED | UNVERIFIED |
| Independent restore drill | UNVERIFIED | UNVERIFIED |
| Railway plan and usage allowance | UNVERIFIED | UNVERIFIED |

### RELEASE-001A verification result

Direct Railway verification remains **UNVERIFIED** on 2026-11-23.

The Codespaces session contains no Railway CLI installation, Railway token, `RAILWAY_*` access variable, linked project file, Railway TCP/database URL, or authenticated service shell. The available GitHub token only authorizes GitHub operations and is not Railway evidence. No backup, PITR, plan, database, storage or restore-point status was guessed.

### Why project-specific verification is blocked

Railway CLI was not installed/authenticated by the environment, no Railway token was available, and neither staging nor production `DATABASE_URL` was supplied. The GitHub token does not authorize Railway project inspection. Connecting to a guessed URL or asking for live credentials in source would be unsafe and prohibited.

### Exact read-only owner instructions — CLI

An authorized Railway operator should install/use the Railway CLI and authenticate/link **keen-contentment** without exposing tokens in chat or Git. Run the following once for each database service, using its exact environment/service names:

```bash
railway login
railway link

railway postgres pitr status \
  --project <keen-contentment-project-id> \
  --environment staging \
  --service <staging-postgres-service> \
  --json

railway postgres pitr schedule list \
  --project <keen-contentment-project-id> \
  --environment staging \
  --service <staging-postgres-service> \
  --json

railway postgres pitr backup list \
  --project <keen-contentment-project-id> \
  --environment staging \
  --service <staging-postgres-service> \
  --json

railway postgres pitr status \
  --project <keen-contentment-project-id> \
  --environment production \
  --service <production-postgres-service> \
  --json

railway postgres pitr schedule list \
  --project <keen-contentment-project-id> \
  --environment production \
  --service <production-postgres-service> \
  --json

railway postgres pitr backup list \
  --project <keen-contentment-project-id> \
  --environment production \
  --service <production-postgres-service> \
  --json
```

Record only sanitized JSON evidence. Redact project IDs, connection strings, bucket credentials, signed URLs, secret values and private hostnames before sharing.

The owner should additionally capture non-mutating service details:

- PostgreSQL image/tag and version;
- single-node or HA topology;
- attached volume size, used size and free space;
- Railway plan and current usage;
- environment/service names and confirmation that staging and production are separate;
- latest visible deployment/predeploy status;
- live PITR archiver health and restore-range output.

Read-only commands above do **not** include `enable`, `disable`, `restore`, `backup create`, schedule `set`, restart, deploy or secret configuration.

### Exact read-only owner instructions — dashboard

For each environment separately:

1. Open Railway project **keen-contentment**.
2. Select **staging** or **production**.
3. Open its PostgreSQL service, then **Backups**.
4. Capture:
   - volume backup enabled/disabled state;
   - Daily, Weekly and Monthly schedule selections;
   - documented expiration/retention shown for each;
   - newest successful backup name/date/time;
   - oldest retained backup;
   - backup success/failure state;
   - any locked backup.
5. In the PITR section capture:
   - enabled/disabled state;
   - archiver health;
   - first completed base backup;
   - available start/end recovery window;
   - weekly full/daily differential schedule indicators;
   - any PITR warning about a minor-version-pinned image.
6. Open service details/variables read-only and capture only:
   - image major tag and PostgreSQL version;
   - attached volume size and storage use;
   - presence/type of archive configuration (not values);
   - standalone versus HA topology.
7. Open project Billing/Usage and capture:
   - plan name;
   - included usage remaining;
   - volume storage;
   - network egress;
   - database/PITR bucket storage and restored-service estimate where visible.
8. Attach screenshots/export with all credentials and secret variable values obscured.

Do not click Enable PITR, create/restore a backup, change schedules, deploy a staged change, resize a volume, or change variables.

### Evidence bundle to return

Return the following sanitized record for each environment:

```text
project: keen-contentment
environment:
postgres-service:
postgres-version/image:
topology:
volume-size-used:
plan:
volume-backups-enabled:
daily-schedule/retention:
weekly-schedule/retention:
monthly-schedule/retention:
last-successful-backup:
oldest-backup/recovery-point:
PITR-enabled:
PITR-archiver-health:
PITR-first-base-backup:
PITR-window-start:
PITR-window-end:
restore-drill-last-run/result/RTO:
estimated-monthly-increment:
evidence-date/operator:
```

Plus screenshots/export from each Backups tab showing schedule, retention, restore points and PITR health, and database/version/storage metadata from Railway. A read-only authorized Railway operator can supply this without changing resources.

### Current plan eligibility

The project-specific plan and eligibility remain **UNVERIFIED**. Public Railway documentation describes PITR and volume backup capability but does not establish that the keen-contentment services are on a plan, image, topology or account state that currently permits those features. The documented official PostgreSQL major tag requirement must also be checked before PITR enablement.

## 2. Current public Railway backup/PITR capabilities

Public Railway documentation reviewed during this assessment:

- Volume backups can be scheduled daily, weekly and monthly.
- Documented retention: daily 6 days, weekly 1 month, monthly 3 months.
- Volume backups are copy-on-write incremental; only snapshot-unique data is billed.
- Restoring a volume backup stages a new volume and requires deployment.
- Restoring removes backups newer than the selected restore point.
- Volume deletion also deletes volume backups; logical offsite dumps are required to survive volume/project deletion.
- PostgreSQL PITR uses pgBackRest WAL archiving to a Railway bucket.
- PostgreSQL PITR takes weekly full and daily differential backups, retaining four fulls for roughly four weeks.
- PITR enablement is not retroactive; the restore window begins after enablement and the first base backup.
- PITR restoration creates a sibling PostgreSQL service and does not alter the source.
- PostgreSQL HA enablement can include a short switchover interruption.
- A prolonged archive-bucket failure can truncate the PITR window while PostgreSQL stays available.

Sources: Railway “Back Up and Restore Postgres,” updated 2026-11-05, and Railway “Point-in-Time Recovery.”

## 3. Recommended protection policy

### Recommended owner approval choices

| Control | Staging recommendation | Production recommendation | Approval now requested |
| --- | --- | --- | --- |
| Daily volume backup | Enable after status verification | Enable | Yes, but do not execute |
| Weekly volume backup | Enable | Enable | Yes, but do not execute |
| Monthly volume backup | Optional for low-cost longer snapshot retention | Enable | Yes, but do not execute |
| PostgreSQL PITR | Enable before schema/customer integration | Enable before any customer release | Yes, but do not execute |
| Pre-migration manual checkpoint | Mandatory for each migration release | Mandatory | Yes |
| Isolated restore drill | At least once before first customer migration and monthly | Before customer release and quarterly, plus after major schema change | Yes |
| Offsite logical dump | Weekly encrypted | Daily encrypted | Design approval; infrastructure separate |

Reasons:

- Staging PITR provides a low-RPO safety net around migration testing and is especially useful for a bad migration or identity/outbox defect.
- Production requires PITR because scheduled snapshots alone do not recover to a precise pre-migration moment.
- Volume backups protect routine fixed-point recovery.
- Logical dumps protect against Railway volume/project deletion and provide portable restoration.

### Staging

- Daily volume backup, six-day retention.
- Weekly volume backup, one-month retention.
- PITR with approximately four-week recovery window after its first base backup.
- Pre-migration manual volume/PITR checkpoint immediately before each schema release.
- Weekly offsite logical `pg_dump` to an independently controlled destination.
- Monthly restore drill into a separate scratch database.

Suggested objectives:

- RPO: ≤ 15 minutes for an approved migration/customer-data issue with healthy PITR.
- RTO: ≤ 4 hours for a staging restore/fork and verification.
- Data loss target: no confirmed application or migration test data should require manual recreation.

### Production

- Daily, weekly and monthly volume backup schedules with all documented retention windows.
- PITR continuously healthy, with roughly four weeks of PostgreSQL recovery history.
- Daily encrypted offsite custom-format logical dump.
- Weekly restore verification; full restoration drill before first customer release and after major schema changes.
- Immutable copy/independent destination if regulatory or organization continuity policy requires survival of Railway project deletion.

Suggested objectives:

- RPO: ≤ 5 minutes; validate against actual WAL/archive lag.
- RTO: ≤ 2 hours for service replacement/cutover after a rehearsed restore.
- Retention: monthly snapshots 3 months plus encrypted offsite dumps at least 90 days; extend to organizational/legal requirement.

These are recommendations, not proof that Railway supports the project configuration or that its plan presently has capacity.

## 4. Estimated costs

Project-specific data size, WAL volume, egress, plan and existing included usage are unknown, so exact totals cannot be calculated.

Public Railway rates:

- Subscription: Hobby $5/month or Pro $20/month, each with equivalent included resource usage credit.
- Volume storage: **$0.15/GB-month**.
- PITR bucket storage: **$0.015/GB-month**.
- Network egress: **$0.05/GB**.
- Restored sibling database also consumes normal CPU/RAM/volume/egress while retained.

### Planning formulas

```text
Incremental volume-backup storage/month
  ~= unique snapshot GB × $0.15

PITR storage/month
  ~= retained compressed base backups + WAL GB × $0.015

PITR upload/month
  ~= compressed WAL/base-backup upload GB × $0.05

Restore drill
  ~= restored sibling database CPU/RAM/storage duration
     + operator/release time
```

Illustrative examples, excluding subscription and existing service/database usage:

| Scenario | Approximate incremental backup storage/transfer cost |
| --- | --- |
| 5 GB unique volume snapshot data | $0.75/month |
| 10 GB PITR archive retained | $0.15/month |
| 20 GB compressed WAL/base-backup uploads | $1.00 egress |
| 50 GB PITR archive retained | $0.75/month |

Add normal usage for a temporary restored PostgreSQL service during each drill. Costs can be lower under plan usage credits or higher with churn, active WAL, large backups, multiple restored forks or a worker service. Enabling PITR has no separate feature fee, but it still causes redeployment and bucket/egress/storage usage.

PITR has no separate feature fee in current public documentation. Its incremental cost is:

- retained compressed base backups/WAL bucket storage;
- outbound upload of archived data;
- normal service resources;
- temporary restored sibling service during recovery drills.

Volume backup increment is charged from unique snapshot data. Plan status, current credits, actual database/WAL size and restore-drill duration must be known before an approval ceiling can be finalized.

No subscription, paid upgrade or backup resource was purchased during this assessment.

## 5. Pre-migration protection and restore procedure

Before applying any CUSTOMER migration:

1. Confirm separate staging and production databases and correct target service.
2. Verify Railway project/environment and database UUID/name with an authorized operator.
3. Confirm volume schedules and latest successful snapshot.
4. Confirm PITR status, first base backup, archive health and latest recoverable timestamp.
5. Record `npx prisma migrate status` output from the target staging database.
6. Create a named pre-migration backup/PITR checkpoint.
7. Take an encrypted portable logical dump outside the Railway project.
8. Record database major version, application SHA, migration history and volume size.
9. Freeze concurrent manual schema commands and confirm the release window.
10. Apply `npx prisma migrate deploy` once, then verify `migrate status`.
11. Run post-migration invariants, application smoke tests and a notification queue check.
12. Perform an independent restore drill from the new backup to a sibling/scratch database.
13. Retain backup and outbox encryption keys for at least the backup retention period.

Never restore or cut over directly without validating the fork, data counts, activation/session/outbox rows and application compatibility.

## 6. Backup interaction with encrypted identity delivery

Database backups contain encrypted outbox payloads, key IDs, hashed activation/reset tokens and durable session metadata. They do not contain the AES-GCM encryption key.

Therefore:

- Backups without the matching historical encryption key cannot deliver unfinished outbox payloads.
- Retain each `IDENTITY_NOTIFICATION_ENCRYPTION_KEY_<KEY_ID>` for at least as long as backups could be restored and outbox jobs could be recovered.
- Keep key backups separately from database backups and in the approved secret manager/recovery vault.
- Rotation must introduce a new active key ID while retaining previous keys.
- Do not restore old keys into active production after revocation without incident review.
- Restored sessions remain subject to database revocation records; preserve token-hash/session timestamps during recovery.
- Old restored outbox jobs can be reprocessed only if their tokens are unexpired and not invalidated/consumed, their payload can be decrypted, and provider idempotency keys still suppress duplicate sends.
- At-least-once delivery means a recovery may re-attempt a provider send; use the stable outbox job ID and provider idempotency controls.

## 7. Pending migration inventory

All eight repository migrations exist. The three customer-release migrations are:

### CUSTOMER-003 — `20261123010000_customer_booking_requests`

Adds:

- `BookingRequestStatus` enum.
- `BookingRequest` table.
- `BookingRequestStatusHistory`.
- Reference and `(customerId, idempotencyKey)` unique indexes.
- Customer history, status and cancellation indexes.
- Four check constraints.
- Customer/history owner foreign keys.

Potential operational impact:

- creates new tables/types/indexes;
- modest initial schema lock, low impact while tables are empty;
- no changes to existing `Trip`, applicants or admin tables.

### CUSTOMER-004A — `20261123020000_customer_identity_sessions`

Adds:

- `Application.accountUserId`.
- `AccountSecurityTokenPurpose` and delivery-state enums.
- `AccountSecurityToken`.
- `CustomerSession`.
- Application/account and token/session unique indexes.
- Token/session history/expiry indexes.
- Four tables/relations constraints and foreign keys.

Potential operational impact:

- `ALTER TABLE "Application" ADD COLUMN` with a nullable column is normally metadata-light;
- unique index on a new nullable Application column is expected to scan/build;
- foreign keys and indexes need a reviewed lock window;
- existing application rows remain null/unlinked.

### CUSTOMER-004D — `20261123030000_identity_notification_outbox`

Adds:

- `IdentityNotificationType` and status enums.
- `IdentityNotificationOutbox`.
- Partial unique active-dedupe index.
- Polling, token/status, lease and expiry indexes.
- Lifecycle, retry-count, delivery and type checks.
- AccountSecurityToken foreign key.

Potential operational impact:

- a new empty table and five indexes;
- uses PostgreSQL `SKIP LOCKED`, advisory locks and a partial index;
- requires a PostgreSQL runtime that supports those standard features;
- no existing application data modification.

## 8. Migration ordering and compatibility

Required order is the migration directory order:

```text
20260601000000_initial
20261120000000_add_customer_application_type
20261120010000_heritage_settings
20261120020000_heritage_interval_seconds
20261120030000_simulated_dispatch
20261123010000_customer_booking_requests
20261123020000_customer_identity_sessions
20261123030000_identity_notification_outbox
```

Prisma migration state on each Railway database must be checked first. Do not infer pending status from repository contents.

Recommended rollout compatibility:

- migration-before-new-code for all three customer migrations;
- current/new code should not be switched until all expected migration rows are recorded;
- keep `CUSTOMER_RIDES_ENABLED=false`;
- keep dispatch and payments disabled;
- worker can be deployed only after outbox migration and secure variables exist;
- login/activation UI can be deployed while booking remains disabled;
- never run `migrate reset`, `db push`, force reset, destructive schema rollback or raw re-run of migration SQL.

Because Railway currently runs `npx prisma migrate deploy` automatically before deployment, verify the database target and backup evidence before authorizing that command. A failed migration may block the release, and an automated migration may run without enough operator observation unless predeploy logs and health checks are reviewed. For this release, prefer an operator-observed controlled staging job rather than an unattended implicit first application.

## 9. Rollback and forward recovery

Application rollback:

1. Disable or keep `CUSTOMER_RIDES_ENABLED=false`.
2. Stop/pause identity worker processing if provider or schema behavior is uncertain.
3. Keep additive schema and data intact.
4. Roll application image back to the last compatible reviewed deployment.
5. Verify migration compatibility and legacy admin/recruitment APIs.
6. Use forward corrective migration for schema defects.

Database recovery:

- For localized bad writes or migration-induced row changes, restore to a sibling PITR service, validate and selectively copy data if possible.
- For broad incident/corruption, cut over to a fully validated restored sibling after RTO/RPO approval.
- Do not drop the new tables during routine application rollback.
- Preserve encryption keys and outbox idempotency state across rollback.
- Reconcile duplicate provider attempts using stable outbox IDs.
- Revoke restored customer sessions and invalidate security tokens if the incident scope suggests credential compromise.

## 10. Identity outbox infrastructure readiness

Required staging components:

- PostgreSQL with all three customer migrations.
- AES-256-GCM active key plus all historical outbox key IDs.
- Protected internal worker endpoint.
- `IDENTITY_NOTIFICATION_WORKER_URL`.
- ≥32-character `IDENTITY_NOTIFICATION_WORKER_SECRET`.
- HTTPS `ROVA_PUBLIC_URL`.
- Approved HTTPS provider webhook and ≥32-character provider secret.
- Provider support for stable `idempotency-key`.
- A separately scheduled or continuously running process invoking:

```text
npm run identity:notifications
```

- Recommended interval: 10–30 seconds.
- Metrics for PENDING age, PROCESSING lease age, FAILED, DEAD and EXPIRED counts.
- Dead-letter alert/support runbook.
- Delivery-rate limit aligned with provider quotas.
- Secret rotation and key-retention runbook.
- Graceful shutdown and database timeout/pool limits.

`after()` is no longer the delivery mechanism. A process capable of draining the outbox must be approved, deployed and monitored separately; the current code does not prove Railway has such a process.

## 11. Security assessment

Locally verified:

- Demo JWT/session cannot authorize real booking APIs.
- Real customer JWTs require a matching durable database session.
- ACTIVE status and CUSTOMER role are checked.
- Logout, reset and suspension revoke sessions.
- Session authorization survives a process restart.
- Staging/production JWT issuers and audiences remain separate.
- Cross-customer booking detail/cancel/cursor access is denied.
- `CUSTOMER_RIDES_ENABLED`, dispatch and payment functions remain disabled.
- Outbox payload is AES-GCM encrypted and cleared after terminal processing.
- Database fields contain token hashes, not raw bearer tokens.
- HTTPS-only provider endpoint, no redirects, private/localhost rejection.
- Worker endpoint is separately authenticated.
- Provider/credential/bearer values are not included in public responses or generic logs.
- Applicant/admin/recruitment regressions remain in the full suite.

Residual:

- DNS pinning is not implemented for the provider.
- At-least-once delivery requires provider idempotency.
- Process-local rate limits are not distributed.
- No approved worker scheduler/monitoring exists.
- Provider acceptance, Ghana device/network and physical mobile testing are unverified.
- Key-loss recovery and restored-job key handling require operational rehearsal.

## 12. Final local verification

Commands completed:

- `npm ci` — passed, 0 vulnerabilities.
- `npm audit` — 0 vulnerabilities.
- `npm audit --omit=dev` — 0 vulnerabilities.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npx prisma generate` — passed.
- `npx prisma validate` — passed.
- Isolated `prisma migrate deploy` plus `npm test` — **31 files, 200 tests passed, 0 skipped**, including 23 real PostgreSQL integration tests.
- `npm run build` — passed.
- `git diff --check` — passed.

The isolated database and credentials were removed after testing.

## 13. Worktree and stash status

The branch has extensive uncommitted CUSTOMER-003/004/004D implementation and report changes. No commit, push or merge was performed.

Principal modified/untracked groups:

- customer booking schema, migrations, APIs, services and UI;
- customer account activation/login/reset/session code;
- encrypted outbox schema, worker, script and tests;
- environment/deployment documentation;
- customer task reports;
- unrelated existing task/deployment reports and prior local changes.

Existing stash preserved:

```text
stash@{0} On main: Codespaces pre-sync slideshow changes 2026-11-22
```

The original uncommitted deployment/master report changes remain. No unrelated file was reverted.

## 14. Exact staged deployment sequence

1. Obtain read-only Railway access and verify both database Backups/PITR/status tabs.
2. Approve database protection, restore objectives, costs and plan capacity.
3. Complete independent production and staging restore drills.
4. Approve outbox encryption-key rotation/retention and provider behavior.
5. Review and approve the three customer migrations and auto-predeploy behavior.
6. Configure staging-only secrets; do not copy production secrets.
7. Create a named pre-migration backup, PITR checkpoint and encrypted logical dump.
8. Apply `npx prisma migrate deploy` to the confirmed staging database in an observed release job.
9. Verify `_prisma_migrations`, `prisma migrate status`, constraints and migration logs.
10. Deploy customer authentication/outbox-compatible code while all transportation/dispatch/payment gates remain false.
11. Deploy and schedule the identity notification worker.
12. Verify provider health, HTTPS destination, idempotency, retries, leases, expiry and dead letters.
13. Run isolated staging activation/reset, logout, copied JWT, suspension and session-restart tests.
14. Verify persistent booking APIs and UI with `CUSTOMER_RIDES_ENABLED=false`; verify demo users cannot access real booking data.
15. Run independent Ghana-based desktop/mobile browser tests.
16. Verify monitoring, incident runbook, rollback, restored-database/key compatibility and RTO/RPO results.
17. Only then seek separate production migration/release approval.

## 14A. Customer release dependencies reconfirmed

| Dependency | Release condition |
| --- | --- |
| CUSTOMER-003 persistent bookings | Apply booking migration; keep `CUSTOMER_RIDES_ENABLED=false`; verify owner isolation and demo-user exclusion. |
| CUSTOMER-004A activation/login | Apply identity/session migration; configure HTTPS public URL and identity provider; verify account activation, logout/reset/suspension revocation. |
| CUSTOMER-004D encrypted outbox | Apply outbox migration; preserve token and encrypted job atomicity; verify payload cleanup and retry/expiry behavior. |
| Worker | Separate approved scheduled/continuous process must invoke `npm run identity:notifications`; monitor PENDING age and DEAD/FAILED/EXPIRED jobs. |
| Identity provider | Approved HTTPS endpoint, separate secret, stable `idempotency-key` support, quotas/rate limits and operational support. |
| Encryption keys | 32-byte base64url active key, separate worker/database identity; retain all historical key IDs referenced by active jobs and restorable backups. |
| JWT isolation | Distinct staging/production `AUTH_SECRET` values and `ROVA_AUTH_ENVIRONMENT`; cross-environment token rejection tested. |
| Migration order | Booking → identity/session → identity outbox, in timestamp/Prisma order after earlier repository migrations. |

No customer migration, worker, provider, encryption key, backup, PITR or release action is authorized by this report.

## 15. Required approvals and remaining blockers

Approvals required:

- Read-only Railway operator access or evidence bundle.
- Staging/production backup and PITR enablement/retention approval.
- Pre-migration backup and restore-drill approval.
- Database cost/usage allowance.
- Database owner approval of all three customer migrations.
- Identity provider contract and idempotency acceptance.
- AES-GCM key creation, retention, rotation and escrow.
- Worker scheduler/resource configuration.
- Monitoring/dead-letter support ownership.
- Explicit staging migration and deployment approval.
- Ghana test identities and tester approval.

Outstanding blockers:

- Railway backup/PITR state, version, storage and restore points are unverified.
- No restore drill or RTO/RPO measurement exists for live Railway.
- No approved identity provider or delivery worker deployment exists.
- No distributed rate limiter or DNS pinning exists.
- No Ghana production-like device/browser test.
- Encryption-key backup and restoration have not been rehearsed.
- Automatic predeploy migration target control is not independently verified.

## Final decision

**STOP AT ASSESSMENT.**

The code and isolated database/security verification are ready for release review, but Railway protection evidence and restore verification are missing. Do not apply migrations, enable backups/PITR, provision a worker, rotate secrets, deploy staging, merge to main or enable customer booking operations without explicit separate approval.

### Owner approval required before RELEASE-001 can advance

The owner/authorized Railway operator should approve:

1. Providing the sanitized read-only evidence bundle described above.
2. Enabling/retaining documented volume backup schedules.
3. Enabling PostgreSQL PITR and allowing its initial redeployment.
4. A measured backup/PITR usage-cost ceiling.
5. A pre-migration backup/checkpoint and independent restore drill.
6. The key-retention period matching backup/offsite retention.
7. A separate worker, provider and identity-key staging configuration review.
8. Any future staging migration/deployment as a distinct action.

None of those actions was performed in RELEASE-001A.
