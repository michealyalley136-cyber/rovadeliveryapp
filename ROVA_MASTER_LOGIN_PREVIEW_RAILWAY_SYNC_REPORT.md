# ROVA Master Login, Preview and Railway Sync Report

Report generated: 2026-11-22

## Status summary

### Implemented

- Secure server-issued application-recognition marker with a 90-day expiration.
- Homepage Login visibility is decided during server rendering, preventing a Login flash for unrecognized visitors.
- Login appears for a valid recognition marker or a valid administrator session.
- Recognition is a presentation preference only. It is not an authentication session and cannot grant operational permissions.
- Public role-selection login removed and replaced with a branded, disabled pre-launch sign-in interface.
- `/admin` remains a separate credential-protected route.
- Applicant form data is no longer written to local storage. The legacy `rova-application-draft` key is removed when the form loads.
- Account-to-role architecture and unresolved backend dependencies documented in `ROVA_ACCOUNT_ACCESS_DESIGN.md`.
- Codespaces development server restored on port 3100 with a `0.0.0.0` host binding.

### Tested

- `npm ci`: passed; 0 dependency vulnerabilities.
- `npm audit`: passed; 0 vulnerabilities.
- `npm audit --omit=dev`: passed; 0 vulnerabilities.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed; 19 test files and 108 tests.
- `npx prisma generate`: passed.
- `npx prisma validate`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Local and Railway staging route checks passed for `/`, `/login`, `/apply`, `/application-status`, `/customer`, `/driver`, and `/admin`.
- Ten configured slideshow images remained present.
- Fresh and tampered recognition markers hide Login locally; a valid server-signed marker shows Login.
- A failed local and staging application request does not set the recognition cookie.
- Local and staging dashboard/admin session APIs return 401 without valid sessions.

### Deployed

- Implementation commit: `17c2a5c80abd16abc786ef31d248db5def5a470e`.
- Branch: `feature/customer-dashboard`.
- Pushed to `origin/feature/customer-dashboard`.
- Railway staging began serving the new `/login` route after the push, changing from 404 before deployment to 200 during observation.
- Railway staging currently serves the pre-launch login page, hides Login for a fresh browser, and retains all ten campaign slides.
- Production was not merged, deployed, or otherwise modified. Its `/login` still returned 404 during this verification.

### Not yet implemented

- Real customer/operator credential authentication and durable account sessions.
- Password recovery, verified contact ownership, and secure account-to-application linking.
- Secure identity recovery for recognition markers lost through cookie clearing or device changes.
- Merchant, fleet, dealer, and strategic-partner portals.
- Secure multi-role switching after server-side role approval.
- Database migration or account-schema work.

## Codespaces preview

Root cause: no Next.js process was listening on port 3000 or 3100. The requested preview URL existed, but the expected application process had not been started, so the forwarded URL returned 404.

The existing project scripts support Next.js development. The process was started with:

```text
npm run dev -- --hostname 0.0.0.0 --port 3100
```

The port is forwarded as private. Correct current preview:

https://improved-engine-7v47g66rvwg93wp9w-3100.app.github.dev/

Local verification returned 200 for all required routes. Graphical browser interaction, visual mobile-menu inspection, and slideshow animation were **UNVERIFIED**; HTTP and server-rendered checks passed.

## Git and preservation state

- Working branch: `feature/customer-dashboard`.
- Starting feature commit: `330694d899690804de3fdeb62226d885574cbfb7`.
- Implementation commit: `17c2a5c80abd16abc786ef31d248db5def5a470e`.
- The implementation commit is on `origin/feature/customer-dashboard`.
- Stash preserved and untouched: `stash@{0} On main: Codespaces pre-sync slideshow changes 2026-11-22`.
- No stash entry was popped, deleted, or indiscriminately applied.
- No Prisma schema or migration file changed.
- No campaign image changed or was deleted.
- Existing customer/driver/admin implementations were retained.

## Applicant recognition

Recognition is issued only after `createApplication` completes its database transaction and returns the saved application's existing reference. Invalid or incomplete submissions and database failures do not set the cookie.

The cookie:

- is HttpOnly;
- is Secure in production or on HTTPS;
- uses SameSite=Lax;
- is scoped to Path=/;
- expires after 90 days;
- contains a signed, domain-separated marker with no applicant reference, contact details, or role;
- uses an environment-bound issuer.

The recognition key is derived from the existing `AUTH_SECRET` for a distinct `rova/application-recognition/v1` purpose. No new secret or local-storage token was introduced.

A valid recognition marker only changes homepage navigation. Regression tests confirm that it is rejected as both demo and administrator authentication material.

## Identity and account access

Applicants without the marker can still use the existing application-status route. Existing applicants and applicants on another device must not submit duplicates. Before recognition recovery is implemented, ownership should be established through a separately approved verified-contact or account-linking flow. Reference and telephone matching alone must not issue recognition.

Operational account routing must depend on server-verified account status and authorized role grants. Application type or recruitment approval must never independently activate a role. Pending, rejected, suspended, closed, and unactivated users must remain outside operational dashboards.

The documented future mapping is:

| Application category | Possible access after separate verification and approval |
| --- | --- |
| `CUSTOMER` | Customer dashboard |
| `MOTORCYCLE_RIDER`, `TAXI_DRIVER`, `DELIVERY_PARTNER` | Operator dashboard |
| `MERCHANT` | Merchant dashboard when implemented |
| `FLEET_OWNER` | Fleet dashboard when implemented |
| `VEHICLE_DEALER`, `STRATEGIC_PARTNER` | Relevant partner portal when implemented |
| `VEHICLE_ACCESS` | No automatic operational access |

Multi-role users may receive an authenticated role switcher only after server-side role authorization. Selecting a role must never create permissions.

## Public login

The public `/login` page now has:

- ROVA branding;
- Welcome back;
- phone/email and password fields;
- disabled Sign in;
- Forgot password availability guidance;
- Apply now;
- application-status link;
- homepage link;
- a separate Staff login link.

Credential fields are disabled because real account authentication is not implemented. No fake account or fake successful credential flow was added. Demo portals remain separate and environment-controlled.

## Automated validation

| Gate | Result |
| --- | --- |
| Locked install | PASS |
| Full dependency audit | PASS, 0 vulnerabilities |
| Production dependency audit | PASS, 0 vulnerabilities |
| ESLint | PASS |
| TypeScript | PASS |
| Vitest | PASS, 108 tests in 19 files |
| Prisma generation | PASS |
| Prisma schema validation | PASS |
| Production Next.js build | PASS |
| Diff whitespace check | PASS |

`npm ci` emitted existing notices about Prisma install scripts not covered by npm's allow-scripts policy and the unsupported ESLint 9.39.5 lifecycle. Neither prevented installation or validation.

## Railway staging

Before the push:

- `origin/feature/customer-dashboard`: `330694d899690804de3fdeb62226d885574cbfb7`.
- Staging `/login`: 404.

After the push of `17c2a5c80abd16abc786ef31d248db5def5a470e`:

- Staging `/login`: 200.
- Homepage: 200 and no Login link for a fresh request.
- `/apply`: 200.
- `/application-status`: 200.
- `/customer`: 200 with demo sign-in entry, not real account access.
- `/driver`: 200 with demo sign-in entry, not real account access.
- `/admin`: 200 with the credential-protected portal.
- Protected dashboard and admin-session APIs: 401 without sessions.
- Invalid application request: 400 and no recognition cookie.
- Ten slideshow images: present.

Deployment was observed from live behavior. Railway CLI access and GitHub deployment records were unavailable, so the Railway deployment ID, Railway logs, and an independent Railway commit-SHA attestation are **UNVERIFIED**. The temporal 404-to-200 transition matched the newly pushed implementation but must not be treated as dashboard-level proof.

No real applicant record was created during validation. A successful live application save and applicant-recognition cookie on staging are therefore **UNVERIFIED**. Existing staging applications remaining intact is also **UNVERIFIED** because database credentials were not available. Live cross-environment JWT testing with isolated credentials is **UNVERIFIED**; the unit regression suite passed.

No Prisma file changed, so this work introduces no pending migration. The staging database's overall `prisma migrate status` could not be queried without its database credentials and Railway service shell. Check it and Railway's migration logs before any future schema-bearing deployment.

## Production release readiness

**Not ready for production deployment.**

The implementation commit to evaluate is `17c2a5c80abd16abc786ef31d248db5def5a470e`, but production promotion requires separate approval.

Minimum promotion gates:

1. Confirm the staging Railway deployment SHA and review build/runtime/migration logs.
2. Run staging success-path recognition testing with a safe, isolated database fixture and verify no duplicate production applicant data.
3. Confirm existing staging applications remain intact.
4. Run isolated live JWT cross-environment rejection tests without disclosing credentials.
5. Verify staging and production environment variables and unique secrets.
6. Confirm database backups and point-in-time recovery.
7. Review the no-migration declaration and any future schema changes.
8. Re-run the full validation suite on the exact promoted commit.
9. Obtain explicit production deployment approval.

Rollback plan:

1. Remove new traffic from the affected staging/production deployment through Railway rollback.
2. Deploy the previous verified branch/service release (`330694d` for this staging comparison, or the current confirmed production release).
3. Do not reset or roll back the database destructively.
4. Preserve submitted applications and audit records.
5. Invalidate only recognition cookies if a rollback requires it; existing application data and admin records must remain untouched.

Outstanding risks include unverified Railway metadata/logs, unverified live database-backed success behavior, missing authenticated account backend, unavailable secure recognition recovery, and outstanding database backup/PITR work.
