# ROVA DEV-CHECKPOINT-003 — Local checkpoint report

## Decision: HOLD

Three local commits were created, but checkpoint preparation stopped before the documentation commit after an additional scheduler-transport security issue was confirmed. The existing commits are retained; they have not been pushed. This is not deployment approval.

## Local commits

| Commit | Message | Scope |
| --- | --- | --- |
| `313599ac6a642c9dee3b882e7601fc8b94880005` | `feat(db): add customer booking and identity schemas` | Prisma schema and three customer migrations |
| `1fe5b35fb00c56ebd2147919e5b8a2fc2737bcc2` | `feat(customer): add secure bookings and identity delivery` | Customer booking, authentication, sessions, outbox, security controls and tests |
| `ac872da0c924258382de7b44e51e3418840099c3` | `feat(ops): add encrypted backup and isolated restore tooling` | Backup and restore tooling, tests, configuration and dependencies |

These are unsigned local commits, using an individually approved per-command signing override; Git signing configuration was not changed. Each has the Copilot co-author trailer. Files were staged explicitly and staged diffs, filenames and whitespace were reviewed before each commit. Pattern-based secret scans found no actual credentials in the committed content; such scans cannot prove absence of all secrets. Examples and test credentials reviewed were placeholders or synthetic fixtures. A whitespace-only cleanup in `src/server/account-security.ts` was necessary for the staged diff check.

The branch is **3 commits ahead, 0 behind** the locally recorded `origin/feature/customer-dashboard`; no fetch was performed, so remote changes since that reference was last updated are unknown.

## Newly identified blocker

The scheduled identity notification processor in [scripts/process-identity-notifications.mjs](./scripts/process-identity-notifications.mjs) accepts the configured `IDENTITY_NOTIFICATION_WORKER_URL` without enforcing HTTPS in production and uses `fetch` with default redirect handling. It sends `IDENTITY_NOTIFICATION_WORKER_SECRET` as a bearer token. A misconfigured HTTP endpoint can expose that credential to observers on the network; a same-origin redirect can carry it to another endpoint. This concerns the internal scheduler request, not the separately hardened outbound identity webhook.

A controlled local test ran the real processor with `NODE_ENV=production`, a synthetic secret, and an HTTP server bound to `127.0.0.1`. The server received the bearer credential over HTTP, issued a same-origin 302 redirect, and received the bearer again at the redirected endpoint; the processor exited 0. No real credentials or external endpoints were used. This does not establish that the processor is currently deployed, that a real credential was exposed, or that cross-origin redirects retain authorization.

Hold further checkpoint commits pending review and remediation or explicit risk acceptance of this scheduler transport. Do not configure or run it against an insecure endpoint. The implementation and security protections were not changed during this checkpoint.

## Pending and excluded files

The documentation group was unstaged after the finding; the index is empty. The following remain uncommitted:

- Modified: `ROVA_MASTER_LOGIN_PREVIEW_RAILWAY_SYNC_REPORT.md`.
- Untracked: `ROVA_BUILD_DIAG_001_REPORT.md`.
- Untracked: `ROVA_DEV_CHECKPOINT_001_FINAL_REVIEW.md`.
- Untracked: `ROVA_DEV_CHECKPOINT_002_LOCAL_COMMIT_REPORT.md`.
- Untracked: `ROVA_DEV_CHECKPOINT_003_REPORT.md` (this report).
- Untracked: `ROVA_TASK_BACKUP_001_LOW_COST_DATABASE_PROTECTION_REPORT.md`.
- Untracked: `ROVA_TASK_BACKUP_002_REAL_R2_VERIFICATION_REPORT.md`.
- Untracked: `ROVA_TASK_BACKUP_003B_STAGING_READINESS_VERIFICATION_REPORT.md`.
- Untracked: `ROVA_TASK_BACKUP_003C_FINAL_DEPLOYMENT_SAFETY_REPORT.md`.
- Untracked: `ROVA_TASK_BACKUP_003D_ONE_SHOT_EXECUTION_PLAN.md`.
- Untracked: `ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md`.
- Untracked: `ROVA_TASK_CUSTOMER_003A_DATABASE_VERIFICATION_REPORT.md`.
- Untracked: `ROVA_TASK_CUSTOMER_003_PERSISTENT_BOOKING_SYSTEM_REPORT.md`.
- Untracked: `ROVA_TASK_CUSTOMER_004A_ACCOUNT_ACTIVATION_REPORT.md`.
- Untracked: `ROVA_TASK_CUSTOMER_004C_ACCOUNT_SECURITY_VERIFICATION_REPORT.md`.
- Untracked: `ROVA_TASK_CUSTOMER_004D_DURABLE_IDENTITY_DELIVERY_REPORT.md`.
- Untracked: `ROVA_TASK_DEPLOY_005_STAGING_MAP_READINESS.md`.
- Untracked: `ROVA_TASK_RELEASE_001_BACKUP_PITR_AND_STAGING_READINESS_REPORT.md`.
- Untracked: `ROVA_TASK_SECURITY_FIX_001_REMEDIATION_REPORT.md`.
- Untracked: `ROVA_TASK_SECURITY_FIX_002_WEBHOOK_HARDENING_REPORT.md`.

The BACKUP-002 real R2 verification report was already excluded from the proposed documentation commit because it contains orphaned fragments before its heading and a stray trailing token. It remains untouched for owner review. Other documentation references that report, so its exclusion may leave unresolved links until the report is reviewed and included or those references are addressed. The documentation reports are historical records; their earlier state and recommendations should not be read as current Railway verification.

## Validation and outstanding risks

- The prior [SECURITY-FIX-002 report](./ROVA_TASK_SECURITY_FIX_002_WEBHOOK_HARDENING_REPORT.md) records lint, typecheck, Prisma generation and validation, both audits, and diff checks passing; the standard test run had 232 passed, 0 failed and 23 skipped. Both audits reported 0 vulnerabilities.
- The subsequent [BUILD-DIAG-001 report](./ROVA_BUILD_DIAG_001_REPORT.md) records a successful controlled production build, 23 PostgreSQL integration tests passed with 0 skipped against disposable PostgreSQL 18, and 19 focused webhook tests passed with 0 skipped. The earlier exit-143 cause remains unknown.
- SECURITY-FIX-001 recorded two passing containerized backup integration cases using synthetic data. These previous validations were not rerun in this checkpoint; the only code adjustment here was whitespace.
- The new local scheduler test passed in demonstrating the unsafe behavior, not in validating a security fix. Current tracked and staged `git diff --check` checks passed; these checks do not inspect untracked files.
- The process-local authentication rate limiter and reliance on proxy-supplied headers remain deployment-readiness concerns. Backup deployment, storage isolation, external key recovery and Railway migration state also require independent owner evidence and approval as described in the historical reports.

## Safety and preservation

No push, merge, Railway operation, live migration, production or staging change, or live backup was performed in this task. Railway's externally managed state was not independently inspected. Pushing this branch may trigger a staging deployment and `prisma migrate deploy`; do not push without separate authorization and migration review.

The existing stash remains `stash@{0}` at `faa676654a6f5c7a82cbe5541c58dfc4c8dfd249`; it was not modified. The remaining files are preserved and unstaged.

**HOLD — scheduler transport issue requires review; documentation checkpoint remains uncommitted.**
