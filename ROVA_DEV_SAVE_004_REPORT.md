# ROVA DEV-SAVE-004 — Local scheduler checkpoint and build diagnosis

## Result

The scheduler security remediation was reviewed, explicitly staged, checked, and committed locally. The production build remains unresolved, so deployment remains **HOLD**. Nothing was pushed or deployed.

## 1. Local commit

- **Commit:** `c2d628c8391c50fd880cd2be70c979991cd09ac1`
- **Message:** `fix(identity): secure notification scheduler transport`
- **Files in the commit (five):**
  - `scripts/process-identity-notifications.mjs`
  - `scripts/identity-notification-transport.mjs`
  - `scripts/identity-notification-transport.test.mjs`
  - `ENVIRONMENT.md`
  - `ROVA_SCHEDULER_SEC_001_REPORT.md`

Only these scheduler files and directly related documentation were staged. The exact staged diff and filenames were reviewed, `git diff --cached --check` passed, and the staged files matched the reviewed worktree. The secret-pattern scan found no private-key, common GitHub/AWS token, or JWT-shaped values. It matched one credential-shaped URL in the rejection test; this was verified as a synthetic `user:password@worker.example` fixture, not a credential. The existing modified `ROVA_MASTER_LOGIN_PREVIEW_RAILWAY_SYNC_REPORT.md` and the other pending reports were not staged.

The three prior local commits were not amended or rewritten. The branch is `feature/customer-dashboard`, now **4 commits ahead and 0 behind** the locally recorded `origin/feature/customer-dashboard`. No fetch was performed.

## 2. Controlled build and diagnosis

One controlled build was run in an attached persistent shell with `DATABASE_URL=postgresql://localhost:5432/rova_build_no_connect`; this was only a placeholder and no database connection occurred.

- Prisma Client generation passed.
- Next.js compilation passed in 19.1 seconds.
- Next.js printed `Running TypeScript ...` and the command ended with **exit 143**.
- No further build attempt was made.

Resource/process observations immediately before the build:

| Resource/evidence | Observation |
|---|---|
| RAM | 7.8 GiB total; about 1.7 GiB available; 164 MiB free |
| Disk | 8.0 GiB available on the workspace filesystem |
| CPU/load | No cgroup CPU quota; load average 0.72 at inspection |
| Processes | No existing Next build; several VS Code TypeScript language servers were active, including processes with roughly 832 MiB and 435 MiB resident memory |
| Cgroup memory | `memory.max` was unlimited; `memory.events` had `oom=0`, `oom_kill=0`, and `oom_group_kill=0` |
| Process limit | 298 current processes against a 9,522 limit |

After termination, approximately 1.6 GiB remained available; cgroup OOM counters were still zero. The kernel journal query returned no matching OOM/kill records. `dmesg` was inaccessible (exit 1). The exit status is consistent with SIGTERM, but the sender is unknown. The active language servers and limited free memory are possible resource pressure, not evidence that they caused the termination. There is no confirmed application build error or OOM kill; external process management or an unobserved host-level event cannot be ruled out.

The build changed `next-env.d.ts`; it was clean before this task and the generated change was restored. No other build-generated tracked change remains.

## 3. Validation

For the scheduler remediation:

- Focused regression tests: **11 passed, 0 failed, 0 skipped**.
- Full `npm test`: **243 passed, 0 failed, 23 skipped** (32 files passed, 2 skipped).
- `npm run lint`: passed on the isolated rerun.
- `npm run typecheck`: passed.
- `npm audit`: passed, 0 vulnerabilities.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- `git diff --check` and staged `git diff --cached --check`: passed.
- `npm run build`: **not passed**, as documented above.

The skipped tests are the standard suite's PostgreSQL integration cases; they were not relevant to this transport-only change and were not counted as passes.

## 4. Remaining uncommitted files

All following work remains unstaged and preserved:

- Modified: `ROVA_MASTER_LOGIN_PREVIEW_RAILWAY_SYNC_REPORT.md`
- Untracked:
  - `ROVA_BUILD_DIAG_001_REPORT.md`
  - `ROVA_DEV_CHECKPOINT_001_FINAL_REVIEW.md`
  - `ROVA_DEV_CHECKPOINT_002_LOCAL_COMMIT_REPORT.md`
  - `ROVA_DEV_CHECKPOINT_003_REPORT.md`
  - `ROVA_TASK_BACKUP_001_LOW_COST_DATABASE_PROTECTION_REPORT.md`
  - `ROVA_TASK_BACKUP_002_REAL_R2_VERIFICATION_REPORT.md`
  - `ROVA_TASK_BACKUP_003B_STAGING_READINESS_VERIFICATION_REPORT.md`
  - `ROVA_TASK_BACKUP_003C_FINAL_DEPLOYMENT_SAFETY_REPORT.md`
  - `ROVA_TASK_BACKUP_003D_ONE_SHOT_EXECUTION_PLAN.md`
  - `ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md`
  - `ROVA_TASK_CUSTOMER_003A_DATABASE_VERIFICATION_REPORT.md`
  - `ROVA_TASK_CUSTOMER_003_PERSISTENT_BOOKING_SYSTEM_REPORT.md`
  - `ROVA_TASK_CUSTOMER_004A_ACCOUNT_ACTIVATION_REPORT.md`
  - `ROVA_TASK_CUSTOMER_004C_ACCOUNT_SECURITY_VERIFICATION_REPORT.md`
  - `ROVA_TASK_CUSTOMER_004D_DURABLE_IDENTITY_DELIVERY_REPORT.md`
  - `ROVA_TASK_DEPLOY_005_STAGING_MAP_READINESS.md`
  - `ROVA_TASK_RELEASE_001_BACKUP_PITR_AND_STAGING_READINESS_REPORT.md`
  - `ROVA_TASK_SECURITY_FIX_001_REMEDIATION_REPORT.md`
  - `ROVA_TASK_SECURITY_FIX_002_WEBHOOK_HARDENING_REPORT.md`
  - `ROVA_DEV_SAVE_004_REPORT.md` (this report)

The Git stash remains `stash@{0}` at `faa676654a6f5c7a82cbe5541c58dfc4c8dfd249`.

## 5. Outstanding deployment blockers

- A complete production build has not been obtained; investigate the unexplained exit 143 before checkpoint or deployment approval.
- Railway private-network HTTPS support and certificate trust for `IDENTITY_NOTIFICATION_WORKER_URL` are unverified. If the endpoint supports only HTTP, delivery will fail closed; use a trusted private TLS endpoint or gateway, not an HTTP exception.
- Scheduler cadence, ownership, failure monitoring, and Railway configuration were not inspected or changed.
- Existing deployment concerns recorded in earlier reports, including process-local authentication rate limiting and proxy-header trust, remain outside this task.

No push, merge, Railway operation, migration, live database access, backup execution, or secret change occurred. The three prior commits, unrelated pending work, and stash remain unchanged.

**Deployment recommendation: HOLD.**
