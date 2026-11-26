# ROVA GHANA — CUSTOMER-004A Account Activation Report

## Executive summary

CUSTOMER-004A implements reviewed-customer invitation, single-use identity verification, unique account activation, password login/reset and database-backed session revocation. The `CUSTOMER_RIDES_ENABLED` feature remains disabled by default.

No Railway environment was accessed, migrated, configured or deployed. No live driver, dispatch, payment or transportation service was activated.

**Deployment recommendation: HOLD.** The implementation passed isolated PostgreSQL and browser verification, but approved identity delivery credentials, real applicant-contact ownership procedures, backup/PITR, durable operational monitoring and a separate staging authorization are still required.

## 1. Implemented authentication architecture

Four states are explicitly separated:

1. **Registered applicant** — an `Applicant` and `Application` exist. This grants no account access.
2. **Eligible applicant** — a `CUSTOMER` application is at `APPROVED_FOR_NEXT_STAGE` and an authorized administrator explicitly sends an activation invitation.
3. **Activated customer** — the single-use contact-delivery token is redeemed, a unique `User`, `CustomerProfile` and CUSTOMER role are created, and the application is linked to that user.
4. **Authenticated customer** — a password login creates a database-backed `CustomerSession` and an HttpOnly JWT cookie.

Demo and administrator JWTs retain separate cookie names, audiences and claims. Application references and recognition cookies are never authentication credentials.

## 2. Application-to-account relationship

`Application.accountUserId` is a unique nullable relation to `User`. A User can therefore originate from at most one application, and one application can link to at most one account. Existing application rows remain unlinked and all schema changes are additive.

Activation eligibility requires:

- `Application.type = CUSTOMER`
- Current status exactly `APPROVED_FOR_NEXT_STAGE`
- No existing `accountUserId`
- No existing User with the verified normalized phone/email
- A valid unexpired activation token delivered to the reviewed applicant contact
- Password creation satisfying the server password policy

`APPROVED_FOR_NEXT_STAGE` alone does not create a user or grant a role.

## 3. Verification workflow

1. Authorized recruitment/operations administrator reviews the CUSTOMER application.
2. The administrator chooses “Send secure account activation” only for an approved eligible application.
3. The server generates 32 random bytes, stores only its SHA-256 hash, invalidates older unused invitations and creates a 30-minute token.
4. The configured identity provider receives the raw one-time activation URL through the protected delivery boundary.
5. Successful provider delivery changes the token to SENT and records a delivery timestamp.
6. Redemption checks SENT, expiry, consumed/invalidated state, application eligibility and current account uniqueness.
7. A transaction creates the ACTIVE User, customer profile and CUSTOMER role, links the application, consumes the token and invalidates unused application tokens.
8. A durable customer session and HttpOnly cookie are created.

Token replays return a failure. Concurrent redemption is guarded by conditional token consumption and database uniqueness.

## 4. Identity delivery provider security

The external email/SMS provider remains a required deployment dependency. No provider response is simulated in production.

Required server-only variables:

- `ROVA_PUBLIC_URL`
- `CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL`
- `CUSTOMER_IDENTITY_DELIVERY_SECRET` (minimum 32 characters)

Security boundary:

- HTTPS required in staging/production.
- Staging/production rejects HTTP, non-web schemes and URL credentials.
- DNS/literal address resolution must be public; localhost, private, loopback, link-local, CGNAT, benchmark/reserved and multicast targets are rejected.
- Localhost HTTP is permitted only with `ROVA_AUTH_ENVIRONMENT=local` in a development/test runtime.
- Authenticated webhook redirects are disabled (`redirect: manual`) and any 3xx is rejected.
- Provider/network errors are generic.
- Secrets, raw activation URLs and reset URLs are not logged.

## 5. Real customer login

`POST /api/customer/session` accepts the verified phone or email plus password. It:

- Normalizes Ghana phone numbers.
- Compares bcrypt hashes.
- Uses a generic invalid-credential response.
- Requires ACTIVE status and CUSTOMER role.
- Creates a durable session.
- Routes the user to the personalized customer dashboard.

Demo sign-in remains on the existing isolated `/api/session` flow. No arbitrary role selector grants real access.

## 6. Session revocation implementation

`CustomerSession` stores:

- Session ID
- User ID
- SHA-256 hash of the signed JWT
- Expiry
- Revocation timestamp/reason
- Hashed request audit values for optional IP/user agent metadata

The JWT includes `kind=customer`, environment issuer/audience, user subject and database session ID. Every customer-session check requires:

- Valid JWT signature, issuer, audience and expiry
- Matching database session/token hash
- No revocation
- Unexpired database record

Logout conditionally revokes the database session before returning success. If database revocation fails, logout returns 503 and logs only the error name. A copied JWT is invalid after successful logout.

Password reset atomically:

- Consumes the reset token
- Changes the password hash
- Revokes all active customer sessions for that user
- Invalidates other unused reset tokens

Account suspension/closure through the administrator endpoint revokes all active customer sessions. Booking authorization also independently re-checks current status and role.

## 7. Password reset and enumeration protection

Password reset request responses are non-specific for existing/nonexisting/inactive users and contain no account details. Reset links expire after 20 minutes and are single-use.

An external provider is required to deliver reset messages; missing or unsafe provider configuration fails closed.

## 8. Customer booking integration

CUSTOMER-003 booking access now uses durable session context plus the existing:

- Authenticated owner ID
- ACTIVE account status
- CUSTOMER role
- Owner-scoped list/detail/history/cancel queries

Results:

- Demo users remain excluded from real bookings.
- Customer B cannot read, cancel or paginate using Customer A’s record.
- Suspended and no-role accounts receive 403 where a previously issued durable session exists.
- A logged-out copied JWT cannot reach booking APIs.
- Booking history remains PostgreSQL-backed across sessions.
- `CUSTOMER_RIDES_ENABLED=false` continues to block creation and API exposure.

## 9. Database migrations

Migration: `prisma/migrations/20261123020000_customer_identity_sessions/migration.sql`

Additive changes:

- `Application.accountUserId` plus a unique index and foreign key.
- `AccountSecurityTokenPurpose` and delivery-status enums.
- `AccountSecurityToken` table and lifecycle/subject checks.
- `CustomerSession` table and expiry/revocation checks.
- Token-hash and session-token-hash unique indexes.
- Lookup/expiry indexes.
- Foreign keys to Application/User with reviewed deletion behavior.

The migration preserves existing applicants, applications, admin, users, trips, bookings and simulated dispatch tables.

### Isolated migration verification

A disposable loopback-only PostgreSQL 16 database received all seven migrations. `migrate status` reported the schema current. PostgreSQL catalog inspection confirmed the identity/session foreign keys, check constraints and all indexes.

No migration was run against Railway.

## 10. Test results

Final validation:

- `npm ci` — passed, 0 vulnerabilities.
- `npm audit` — 0 vulnerabilities.
- `npm audit --omit=dev` — 0 vulnerabilities.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npx prisma generate` — passed.
- `npx prisma validate` — passed.
- `npm test` with isolated PostgreSQL opt-in — **28 files, 183 tests passed, 0 skipped**.
- `npm run build` — passed.
- `git diff --check` — passed.

Identity/database integration passed:

1. Ineligible applicant rejection.
2. Eligible hashed invitation.
3. Single-use activation and replay denial.
4. Duplicate/linked account denial.
5. Real customer login/logout.
6. Copied JWT rejection after logout.
7. One-time password reset and session revocation.
8. Suspension and active-session revocation.
9. Cross-environment customer JWT rejection.
10. Fresh-client account/link/session persistence.
11. PostgreSQL uniqueness/FK checks.
12. Booking gate remains disabled.
13. CUSTOMER-003 two-customer booking ownership, concurrency, pagination and cancellation suite.

Webhook security tests passed:

- HTTP/FTP/file/credentialed endpoints rejected in deployed environments.
- Staging/production localhost and private/reserved destinations rejected.
- Localhost HTTP permitted only for explicitly local development/test.
- 302 and other redirect following disabled/rejected.
- Valid public HTTPS endpoint accepted.
- Error output cannot contain provider secret or raw activation URL.

### Browser verification

Chromium at `390x844` verified:

- Real phone/password login.
- Personalized verified-customer dashboard.
- Activity, Wallet and Account bottom navigation.
- Booking UI hidden because the booking gate was false.
- No horizontal overflow.
- Logout cookie removal and 401 from the session endpoint.

The process was then stopped and restarted. The pre-existing durable JWT session remained authorized after restart, and became 401 after logout. No physical mobile handset or Safari test was run.

## 11. CUSTOMER-004B password-reset timing hardening

### Precise issue

`POST /api/customer/password-reset` previously awaited:

1. account lookup;
2. ACTIVE/CUSTOMER eligibility checks;
3. token generation and PostgreSQL insert;
4. DNS/webhook validation;
5. synchronous identity-provider delivery for up to eight seconds.

Unknown, suspended, closed, roleless and otherwise ineligible identifiers returned after the lookup. Eligible active customers could therefore be distinguished by a materially longer response time even though all paths used the same status and generic body.

Provider failure timing also varied: a failed delivery could remain slow while invalidating the unusable PENDING token.

### Implemented mitigation

- The route always returns:

  > “If an eligible account exists, password-reset instructions will be sent.”

- This exact `202` body and `cache-control: no-store` structure are used for:
  - valid eligible identifiers;
  - unknown identifiers;
  - suspended/closed/pending users;
  - accounts without the CUSTOMER role;
  - invalid identifier syntax;
  - provider-independent request processing.
- Account lookup, eligibility, token issuance, provider validation and provider delivery now execute in a Next.js `after()` callback after the response is finished. The request path does not await any account- or provider-dependent operation.
- A five-minute background per-account cooldown checks for recent PENDING/SENT reset tokens, limiting repeated delivery attempts without revealing account status.
- Rate-limit rejection uses the same public message and status, with only the rate-control `Retry-After` header.
- Tokens remain SHA-256 hashed, expiring after 20 minutes, required to be successfully SENT, conditionally consumed once and atomically coupled to password update/session revocation.
- Failed provider deliveries remain FAILED and invalidated.
- Logs contain only generic event/error class labels, never raw identifiers, reset tokens or provider credentials.
- The existing webhook HTTPS/public-network/manual-redirect protections remain unchanged.

This does not rely on an arbitrary fixed response delay. The identifier-dependent code is outside the response path.

### Regression tests

Focused reset timing tests verify:

- Identical 202 status/body for eligible, unknown, suspended and malformed identifiers.
- The route does not call the reset service before responding.
- Provider work can take eight seconds while public response time remains bounded.
- Failed delivery exceptions do not expose token/provider text through response or logs.
- Rate limiting preserves the same public body without dispatching work.
- Reset consumption remains delegated to the single-use service.

The isolated identity integration suite was expanded to verify:

- Unknown, suspended and unusable-contact requests create no token/delivery.
- Failed provider attempts are stored FAILED/inactivated.
- Repeated eligible requests within the cooldown create one successful delivery.
- Token replay rejection.
- Password-change session invalidation.

### Validation status

For CUSTOMER-004B, without creating or migrating a new database:

- `npm test`: 27 files passed, 173 tests passed.
- Two PostgreSQL integration files were skipped, totaling 19 tests, because no `TEST_DATABASE_URL` was available and this task explicitly prohibited applying migrations.
- The previous CUSTOMER-004A real-PostgreSQL run had passed the activation/session scenarios; the newly added database assertions are present and will run when the approved isolated database gate is next available.
- `npm audit`: 0 vulnerabilities.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npx prisma validate`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

### Remaining risk

`after()` is not a durable message queue. Next.js/hosting must permit graceful shutdown long enough for pending callbacks (recommended 10–30 seconds), as documented in the deployment guide. A forced process termination after a token insert but before provider completion leaves the PENDING token unusable and can defer a replacement until the cooldown expires. A future production queue/outbox should add durable retries and distributed admission controls; this task intentionally avoided a new schema/migration or deployment.

## 12. Security findings and review status

The approved HIGH-severity delivery-webhook issue was fixed:

| Severity | Finding | Resolution |
| --- | --- | --- |
| HIGH | Unsafe webhook schemes/redirects/private destinations could transmit the provider bearer credential and activation/reset URLs to unintended network destinations. | HTTPS/public-address validation, local-only exception, URL-credential rejection, manual redirects and generic provider/network errors. |

The MEDIUM account-timing issue is resolved by CUSTOMER-004B. The remaining reliability concern is limited to durability of background execution during forced termination; it does not restore the account-existence timing oracle during ordinary request handling.

## 13. Provider dependencies

Production identity delivery requires an approved email/SMS provider that:

- Supports authenticated HTTPS webhook delivery.
- Restricts provider credentials to the server environment.
- Accepts recipient, channel, kind, secure link and expiry metadata.
- Does not retain or log raw bearer links beyond approved retention.
- Provides delivery status and incident monitoring.
- Uses a stable public DNS/IP destination.

Provider setup and credentials are deployment decisions and were not modified.

## 14. Remaining blockers

- Approved activation provider contract, account and credentials.
- Independently verified contact-delivery operations and support procedures.
- Durable distributed password-reset queue/outbox and retry monitoring.
- Centralized/distributed rate limiting.
- Operational alerting for activation, reset and session anomalies.
- Account recovery and identity dispute handling.
- Backup/PITR verification for Railway PostgreSQL.
- Retention/deletion policy for identity tokens and session metadata.
- Physical Ghana mobile/network and Safari/browser matrix.
- Explicit staging migration/deployment authorization.

## 15. Deployment readiness and required approvals

**Not ready for staging deployment.**

Required approvals:

1. Database owner review of the additive identity/session migration.
2. Verified backup/PITR plan.
3. Approved public identity-delivery provider and HTTPS endpoint.
4. Separate staging `ROVA_PUBLIC_URL`, provider secret and JWT secret.
5. Isolated real test applicants and test contact ownership.
6. Security approval for the bounded `after()` password-reset timing mitigation and the documented future durable queue/outbox plan.
7. Staging migration approval and application deployment approval.
8. Continued confirmation that `CUSTOMER_RIDES_ENABLED=false`.
9. Separate future authorization before any customer booking activation.

No commit, push, merge or deployment was performed. Existing Codespaces work and the saved Git stash were preserved.
