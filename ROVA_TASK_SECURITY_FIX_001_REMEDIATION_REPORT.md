# ROVA TASK SECURITY-FIX-001 — Remediation Report

## 1. Root causes

1. **Webhook URL validation — High.** The previous implementation resolved a hostname, checked the returned addresses, and then used a separate `fetch` connection. The connection could resolve the hostname again, leaving a DNS-rebinding gap. Its IPv4-mapped IPv6 handling also recognized only dotted IPv4 suffixes, so valid alternate representations could evade private-address classification.
2. **Database restore — High operational risk.** The previous guard relied on a confirmation string and a database name containing `restore`, `test`, or `drill`; it did not verify the connected server/database identity or whether the target already contained application objects. `pg_restore --clean --if-exists` could therefore delete existing target objects.
3. **Logout revocation — Medium.** `clearCustomerSession` deleted the cookie in `finally`. If PostgreSQL revocation failed, the endpoint returned a retryable error after removing the credential needed to retry, while a copied token could remain valid.

## 2. Files changed

- [src/server/customer-identity-delivery.ts](./src/server/customer-identity-delivery.ts)
- [src/server/__tests__/customer-identity-delivery.test.ts](./src/server/__tests__/customer-identity-delivery.test.ts)
- [src/server/auth.ts](./src/server/auth.ts)
- [src/server/__tests__/auth.test.ts](./src/server/__tests__/auth.test.ts)
- [src/server/__tests__/customer-identity-database.integration.test.ts](./src/server/__tests__/customer-identity-database.integration.test.ts)
- [scripts/backup/lib.mjs](./scripts/backup/lib.mjs)
- [scripts/backup/backup.test.mjs](./scripts/backup/backup.test.mjs)
- [scripts/backup/backup.integration.mjs](./scripts/backup/backup.integration.mjs)
- [ENVIRONMENT.md](./ENVIRONMENT.md)
- [ROVA_TASK_BACKUP_001_LOW_COST_DATABASE_PROTECTION_REPORT.md](./ROVA_TASK_BACKUP_001_LOW_COST_DATABASE_PROTECTION_REPORT.md)
- [ROVA_TASK_BACKUP_003D_ONE_SHOT_EXECUTION_PLAN.md](./ROVA_TASK_BACKUP_003D_ONE_SHOT_EXECUTION_PLAN.md)
- [ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md](./ROVA_TASK_BACKUP_003_RAILWAY_STAGING_DEPLOYMENT_PLAN.md)

No dependency manifests were changed.

## 3. Security controls implemented

### Webhook delivery

- Requires HTTPS in deployed environments; rejects unsafe schemes, URL credentials, fragments, and deployed localhost destinations.
- Resolves all destination addresses once, rejects non-public/private/reserved results in deployed environments, and pins the validated address in the actual HTTP(S) connection. The original hostname remains the request host and TLS name.
- Redirects are rejected; provider idempotency headers and encrypted outbox handling remain unchanged.
- Resolver, network, and provider errors are generic and do not include webhook credentials, activation/reset links, tokens, or request bodies.
- Regression tests cover private IPv4/IPv6 and mapped IPv4, unsafe schemes/credentials, DNS pinning and hostname mismatch, redirects, provider idempotency, and redacted failures.

### Restore protection

- Requires `RESTORE_TARGET_MODE=isolated`, an explicit confirmation, a literal loopback URL, and a database name beginning `rova_restore_`.
- Pins libpq to the literal loopback address and removes inherited service-file selection for the connection.
- Queries the connected database, user, server address, recovery state, and user objects before backup access and again immediately before restoration. Mismatches, non-loopback servers, and populated targets fail closed.
- Removes `pg_restore --clean --if-exists`; there is no remote/staging/production target mode or live-restore override. Future live recovery requires a separate approved workflow.
- Preserves encrypted archive compatibility. Tests verify remote/staging and mismatched/populated targets are rejected before storage reads or `pg_restore`; the real PostgreSQL integration also rejects a populated target.

### Logout revocation

- Verifies the customer JWT and revokes only the session matching its session ID, subject, token hash, and `revokedAt: null`.
- Cookie clearing occurs only after successful or already-completed revocation; invalid credentials are cleared, while database failures propagate so the endpoint returns 503 and retains the cookie for a user-initiated retry.
- Repeated/concurrent logout remains idempotent. There is no automatic retry loop. Existing protected API checks still consult durable PostgreSQL session state and fail closed.
- Tests cover transient database failure and retry, retryable 503 behavior, session isolation, concurrent/repeated logout, copied-token replay, persistence through a fresh PostgreSQL client, and suspension/revocation.

## 4. PostgreSQL integration results

- A fresh disposable PostgreSQL 18 instance was used on loopback only.
- `prisma migrate deploy`: **8/8 migrations applied**, including all three customer migrations. No Railway or live database was contacted.
- Booking and customer identity integration suites: **23 passed, 0 failed, 0 skipped** across 2 files.
- The logout integration verifies the revoked state through a fresh Prisma client and rejects replay of the copied token.

## 5. Backup restore safety results

- Containerized PostgreSQL 18 client-tool integration: **2 passed, 0 failed, 0 skipped**.
- PostgreSQL 18 encrypted backup/restore passed; the same test then confirmed a populated restore target was rejected before storage access or `pg_restore`.
- A synthetic PostgreSQL 16 archive restored successfully into a separate empty PostgreSQL 18 loopback database.
- Test data and archive were synthetic. Only task-created containers, image, and temporary archive were removed. No real backup was run.

## 6. Full validation

| Command | Result |
|---|---|
| `npm run lint` | **PASS** — exit 0, no warnings |
| `npm run typecheck` | **PASS** — exit 0 |
| `npm test` | **PASS** — 30 files passed, 2 skipped; 222 tests passed, 23 skipped (245 total) |
| `npx prisma generate` | **PASS** — Prisma Client 7.10.1 generated |
| `npx prisma validate` | **PASS** |
| `npm run build` | **PASS** — production build completed |
| `npm audit` | **PASS** — 0 vulnerabilities |
| `npm audit --omit=dev` | **PASS** — 0 vulnerabilities |
| `git diff --check` | **PASS** |
| Opt-in customer PostgreSQL tests | **PASS** — 23/23; run separately, not counted as skipped passes |
| Containerized backup integration | **PASS** — 2/2; no skipped cases |
| Disposable PostgreSQL migrations | **PASS** — 8/8 applied |

The 23 opt-in tests skipped by the default `npm test` run were separately executed against the disposable PostgreSQL 18 instance and passed.

## 7. Remaining limitations and blockers

- The existing authentication rate limiter remains process-local and derives its key from proxy headers ([src/server/rate-limit.ts](./src/server/rate-limit.ts)). Confirm that the deployed proxy overwrites those headers and use shared rate-limit state before relying on thresholds across multiple instances. This deployment limitation was outside the three requested fixes.
- Logout cannot revoke a database session while PostgreSQL is unavailable. It now reports failure (503), keeps the cookie for an explicit retry, and does not claim successful server-side revocation.
- The restore command intentionally has no live-database restoration capability.

## 8. Checkpoint and Railway status

- **SAFE FOR LOCAL CHECKPOINT** — limited to local review/checkpoint; not approval to deploy.
- No files were staged or committed. No push, pull request, Railway access/deployment/migration, production/shared database connection, real backup, or stash operation occurred. Railway remains unchanged.
- The worktree’s pre-existing uncommitted changes were preserved. Build-generated `next-env.d.ts` changes were restored to their original clean state.
