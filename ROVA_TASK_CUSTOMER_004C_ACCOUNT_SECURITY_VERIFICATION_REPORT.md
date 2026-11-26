# ROVA GHANA — CUSTOMER-004C Account Security Verification Report

## Executive summary

CUSTOMER-004C verified the complete customer identity lifecycle against a disposable PostgreSQL 16 database and a real Next.js production build. The complete test suite ran with **zero skipped tests**.

No Railway database, secret, migration or deployment was touched. `CUSTOMER_RIDES_ENABLED`, payments and live dispatch remain disabled.

**Deployment recommendation: HOLD.** Core authentication and ownership behavior passed, but `after()` delivery is not durable and a future approved PostgreSQL outbox/worker is required before production identity messaging can be considered reliable.

## 1. Implementation reviewed

The following CUSTOMER-004A/004B protections were preserved:

- Reviewed CUSTOMER application eligibility.
- No automatic User/role grant from an application.
- Unique application-to-account relation.
- Hashed, expiring, single-use activation/reset tokens.
- Bcrypt password storage.
- ACTIVE status and CUSTOMER role checks.
- Durable `CustomerSession` database records.
- Session token-hash binding.
- Logout, password-reset and suspension revocation.
- Environment-isolated demo/customer/admin JWT audiences.
- HTTPS/public-address-only identity webhook delivery.
- Manual redirects and sanitized provider errors.
- Owner-scoped booking APIs and disabled booking gate.

## 2. Isolated PostgreSQL environment

A uniquely named PostgreSQL 16 container was bound to loopback only and used a disposable database. Seven checked-in migrations were applied with `prisma migrate deploy`; `prisma migrate status` reported the database current.

No production applicant data, Railway credential or Railway endpoint was used. The container and test database were disposable and removed after verification.

Migration validation included:

- existing Applicant/Application/Trip/SimulatedRide preservation;
- account-to-application unique relation;
- activation/reset hash uniqueness;
- durable session token-hash uniqueness;
- foreign keys and expiry/revocation/lifecycle checks;
- booking, history and identity-session indexes.

## 3. Automated test counts

Final full run:

- Test files: **29 passed**
- Tests: **194 passed**
- Skipped: **0**
- Real PostgreSQL integration tests: **21 passed**
  - booking/ownership/concurrency: 9
  - customer identity/activation/session/reset: 12

An earlier full invocation raced parallel Prisma generation after `npm ci` and could not import the generated client for three files. Generation completed and the exact full integration-enabled command was rerun sequentially with 194/194 passing. No security failure was bypassed.

## 4. PostgreSQL integration results

### Activation

Passed:

- Ineligible application rejection.
- Eligible CUSTOMER invitation issuance.
- SHA-256 token-hash storage.
- Successful SENT token delivery state.
- Unique ACTIVE User, CUSTOMER role and CustomerProfile creation.
- Unique application-to-account link.
- Consumed-token replay rejection.
- Duplicate activation denial.
- Expired activation token rejection.

### Password reset

Passed:

- Unknown account: no token/no delivery.
- Suspended account: no token/no delivery.
- Unusable contact: no token/no delivery.
- Failed provider delivery: FAILED + invalidated token.
- Repeated eligible requests within five-minute cooldown: one delivery.
- Three concurrent requests: one PENDING/SENT token and one delivery using a PostgreSQL advisory lock.
- Expired reset token rejection.
- Successful one-time password reset.
- Consumed token replay rejection.
- Password change revokes prior durable sessions.

### Session behavior

Passed:

- Real password login.
- ACTIVE/customer-role requirement.
- Logout revokes copied JWT.
- Session remains available across a fresh Prisma client.
- Cross-environment JWT rejection.
- Suspension revokes and/or prevents protected access.
- Expired/revoked session records are rejected.

### Booking boundaries

Passed with the controlled isolated test environment:

- Customer A and B create independent RIDE/TAXI requests.
- Customer B cannot read/cancel Customer A records.
- Customer B cannot use Customer A pagination cursor.
- Stable account-scoped history.
- Idempotent duplicate creation.
- Concurrent cancellation single winner.
- SUSPENDED/no-role rejection.
- Shared demo session rejection.
- No `Trip` or `SimulatedRide` is created by persistent requests.
- Gate-disabled booking behavior rejects public creation.

Controlled routing fixtures were used for deterministic database tests; live Geoapify was not required to prove persistence and ownership.

## 5. Password-reset public-response and `after()` results

The real production endpoint was called from the isolated production server:

| Identifier | HTTP | Time | Body |
| --- | --- | --- | --- |
| Existing eligible active customer | 202 | 0.004231 s | `{"message":"If an eligible account exists, password-reset instructions will be sent."}` |
| Unknown account | 202 | 0.002954 s | Same |
| Invalid identifier | 202 | 0.003916 s | Same |

All returned `202`, the same body and `no-store` behavior. Account/provider-sensitive processing occurred after the response.

Focused tests additionally verified:

- A mocked slow provider can take eight seconds without delaying the route.
- Provider exception text does not appear in public responses or logs.
- Rate limiting retains the generic 202 body.
- No raw reset token, credential or recipient entered the log assertion.

### `after()` reliability assessment

`after()` successfully removes account/provider timing from the request path, but it is not a durable queue.

Controlled interrupted-work verification:

1. A recent PENDING reset token was placed in the disposable database.
2. The production process was stopped and restarted.
3. Another reset request returned the same 202 response.
4. The PENDING token remained PENDING.
5. The recent-token cooldown found one active token and suppressed duplicate delivery.

Conclusion:

- A forced stop before provider completion can lose the reset message.
- The PENDING token remains unusable and blocks replacement until the cooldown window is no longer matched.
- A graceful 10–30 second hosting shutdown supports ordinary `after()` completion, but this is not guaranteed during forced termination/crash.

## 6. Durable delivery recommendation

No outbox or migration was added because this task required verification only.

Recommended future approved design:

### Proposed `IdentityDeliveryJob`

- `id`
- `tokenId`
- unique `dedupeKey`
- destination channel/type
- `payload` or encrypted/reference-only payload
- `status`: PENDING, PROCESSING, SENT, FAILED, DEAD
- `attemptCount`
- `availableAt`
- `lockedAt`
- `lockOwner`
- `lastErrorCode` (never provider secret, recipient or bearer URL)
- `deliveredAt`
- `createdAt`
- `updatedAt`

Controls:

- Create token and outbox job in one PostgreSQL transaction.
- Unique dedupe key derived from user/purpose/cooldown interval.
- Worker claims jobs using row locks/skip-locking.
- Provider call idempotency key equals token/job ID.
- Exponential retry for transient failures.
- Explicit maximum attempts and dead-letter state.
- Recovery of PENDING/PROCESSING jobs after lock expiry.
- Never store plaintext token in job payload; store encrypted or reconstruct-only data where operationally required.
- Provider delivery and token `SENT` update use an auditable transaction/status reconciliation.
- Suspend/close and password-change transitions invalidate pending jobs.
- Central operational metrics without token, recipient or credential disclosure.

Proposed migration impact is additive: one table, one enum, indexes on `(status, availableAt)`, `tokenId`, and unique `dedupeKey`. It must be separately reviewed and approved.

## 7. Production-build browser verification

Headless Chromium tested a real `next start` production build at `390x844`.

Passed:

1. Eligible synthetic applicant opened a SENT activation link.
2. Applicant set a secure password and activated an account.
3. Activation created an HttpOnly customer session.
4. Personalized verified-customer dashboard loaded.
5. Mobile Account/Activity/Wallet navigation worked without horizontal overflow.
6. Logout removed/invalidated the current session.
7. Replaying the copied JWT returned 401.
8. Replaying consumed activation token returned 400.
9. Existing customer logged in with the created password.
10. SENT reset token changed the password.
11. Old pre-reset session JWT returned 401.
12. Expired reset token returned 400.
13. Consumed reset token returned 400.
14. New password login succeeded.
15. Booking creation returned 403 with `CUSTOMER_RIDES_ENABLED=false`.
16. Durable session survived a Next.js production-process restart.
17. Same session was rejected after the User status changed to SUSPENDED.

Physical handset, Safari and Ghana cellular-network testing was not performed.

### Booking browser visibility

The public booking gate correctly remained disabled, so the production browser did not render or call private booking history. Two-customer booking retrieval, ownership denial and pagination were instead verified in the real PostgreSQL/API integration suite using an isolated test-only process environment where the gate can be asserted without deployment.

## 8. Security and release validation

Successful:

- `npm ci` — passed; 0 audit vulnerabilities at install.
- `npm audit` — 0 vulnerabilities.
- `npm audit --omit=dev` — 0 vulnerabilities.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` with isolated `TEST_DATABASE_URL` and opt-in — **194 passed, 0 skipped**.
- `npx prisma generate` — passed.
- `npx prisma validate` — passed.
- `npm run build` — passed.
- `git diff --check` — passed.

Security scans and review confirmed:

- no Railway URL or credential was added;
- no webhook secret or reset/activation bearer token was logged;
- no local/private webhook target is permitted in staging/production;
- authenticated webhook redirects are disabled;
- demo JWTs cannot satisfy customer JWT authorization;
- copied JWTs fail after logout/reset;
- current suspended status fails session access;
- no dispatch, payment or financial action is triggered.

## 9. Proposed migration requirements

No new CUSTOMER-004C migration was created or applied. A future identity-delivery outbox is the only recommended schema change:

- additive table/enum only;
- unique idempotency/dedupe constraints;
- indexes for worker polling and recovery;
- foreign key to the hashed security-token record;
- no destructive change to Applicant, Application, User, BookingRequest or CustomerSession.

Migration must be reviewed, tested on an isolated restored database and separately approved before Railway use.

## 10. Remaining security risks

- Best-effort `after()` delivery can lose a message on forced termination.
- PENDING cooldown can delay replacement after interruption.
- Provider delivery remains an external operational dependency.
- Rate limiting is process-local rather than distributed.
- Delivery DNS validation does not pin the resolved IP, so DNS rebinding remains a hardening concern for a misbehaving configured provider.
- Real provider credentials and provider retention controls are not configured/tested.
- Central monitoring/dead-letter handling is absent without an outbox worker.
- No physical mobile, Safari or Ghana-network matrix was completed.
- Backup/PITR and Railway environment isolation remain unverified.
- Real customer contact ownership and production support/escalation procedures require operational approval.

## 11. Railway staging blockers

Do not migrate or deploy until:

1. A durable delivery outbox/retry architecture is reviewed and approved.
2. The identity provider and HTTPS public endpoint are approved.
3. Staging backup and PITR are verified.
4. Separate staging JWT/provider/public URL secrets are prepared.
5. Distributed rate limiting and delivery observability are approved.
6. The additive migrations are reviewed on a restored staging-like database.
7. Isolated, independently controlled staging test customers are available.
8. Explicit staging migration and deployment authorization is granted.
9. `CUSTOMER_RIDES_ENABLED` remains false.
10. Driver dispatch and payment systems remain disabled.

## 12. Final recommendation

**Authentication functionality: verified. Production delivery readiness: HOLD.**

Activation, credential login, reset, replay prevention, status revocation, environment isolation, booking ownership and restart persistence passed isolated database and production-browser verification. The only direct reliability failure found was loss of provider delivery during forced interruption of `after()`, demonstrated by a surviving unusable PENDING token. A separately approved PostgreSQL outbox is recommended before staging enablement.

No commit, push, merge, Railway access, deployment or secret change was performed. Existing unrelated work and the saved Codespaces stash were preserved.
