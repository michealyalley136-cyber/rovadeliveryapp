# ROVA GHANA — CUSTOMER-003A Database Verification Report

## Executive summary

CUSTOMER-003A completed isolated PostgreSQL migration, service/API, security, concurrency, persistence, restart, Chromium and mobile-viewport verification. No Railway environment was accessed, migrated or deployed. The feature gate remains disabled by default.

**Deployment recommendation: HOLD.** Database booking behavior is verified locally, but real customer registration/activation, durable session revocation, Railway backup/PITR approval, centralized rate limiting, operational monitoring and a separately approved staging migration remain outstanding.

## 1. Implementation review

The implementation was reviewed without weakening protections:

- `BookingRequest` is deliberately separate from fare-oriented `Trip` and dispatch-oriented `SimulatedRide`.
- Booking states are only `REQUESTED` and `CANCELLED`; `DRAFT` is browser-only planning.
- The migration creates an enum, two additive tables, seven indexes, PostgreSQL checks and foreign keys.
- `rova_customer_session` is a separate JWT audience from `rova_demo_session` and administrator sessions.
- Every booking API validates a database `User`, `ACTIVE` status and a `CUSTOMER` role.
- Customer IDs are derived from the session; reads, cursors, history and cancellation include owner scope.
- Idempotency is unique per customer plus a request fingerprint.
- Cancellation uses a transaction and conditional state update.
- `/api/rides` and SimulatedRide remain separate demo/dispatch systems.
- `CUSTOMER_RIDES_ENABLED` defaults to `false` and remains mandatory for booking access.
- No fare, ledger, payment or dispatch write is part of booking creation.

### Why the prior test was skipped

The previous PostgreSQL test was guarded by both:

```text
RUN_BOOKING_DATABASE_TESTS=true
TEST_DATABASE_URL=<isolated database>
```

Neither was provided in the earlier task. The original test also only inserted one hand-built row and read it with a new client. It did not verify CUSTOMER role authorization, APIs, ownership, history, pagination, duplicate races, cancellation races or database constraints.

The integration test was expanded while retaining the explicit opt-in and a separate `TEST_DATABASE_URL`.

## 2. Isolated database setup

- Runtime: PostgreSQL 16 Alpine.
- Host exposure: loopback only.
- Container identity: disposable and uniquely named.
- Database: dedicated empty `rova_customer003a` database.
- Production applicant data: none.
- Railway databases: not connected, inspected, migrated or modified.
- Credentials: generated at runtime and stored only in permission-restricted session state outside Git.
- Paid infrastructure: none.

All six repository migrations were applied with `prisma migrate deploy`. A second `migrate deploy` was a clean no-op and `migrate status` reported no pending migrations.

## 3. Migration verification

### Catalog results

The migrated database contained 31 public tables, including:

- Existing `Applicant`, `Application`, `ApplicationStatusHistory`
- Existing `AdminUser` and administration tables
- Existing `Trip`, `LedgerEntry`, `User`, `UserRole`
- Existing `SimulatedRide`, assignments, offers and drivers
- New `BookingRequest`
- New `BookingRequestStatusHistory`

No existing table was dropped, altered destructively or reset.

### BookingRequest constraints and indexes

Verified in PostgreSQL:

- Primary key on booking ID.
- Unique booking reference index.
- Unique `(customerId, idempotencyKey)` index.
- Stable `(customerId, createdAt, id)` history index.
- `(status, createdAt)` index.
- Foreign key from booking to `User` with `ON DELETE RESTRICT`.
- Coordinate range check.
- RIDE/TAXI-only check.
- Positive route distance/non-negative duration check.
- MOTORCYCLE/DRIVING profile check.
- Consistent cancellation timestamp/status check.

### Booking history linkage

Verified:

- History foreign key to booking with `ON DELETE RESTRICT`.
- Actor foreign key to `User` with `ON DELETE RESTRICT`.
- `(bookingRequestId, createdAt)` index.
- Exactly two entries after successful cancellation: REQUESTED then CANCELLED.

### Repeatability and rollback

Forward migration deployment is repeatable at the Prisma migration-system level: all migrations applied once, and a repeat reported no pending work.

The migration is not itself safe to re-run as raw SQL on an existing migrated schema. Staging deployment must use Prisma migration state and a backup/PITR procedure.

Recommended rollback:

1. Disable `CUSTOMER_RIDES_ENABLED`.
2. Roll back only the application deployment.
3. Keep additive booking tables and data intact.
4. Use backup/PITR only for an approved incident.
5. Never use `migrate reset`, `db push`, dropping columns/tables or destructive Railway migrations.

## 4. Exact integration test results

The opted-in PostgreSQL suite contains **9 passing integration tests**.

1. **Gate and authorization**
   - Disabled gate: 403 / `BOOKING_GATE_DISABLED`.
   - No verified customer session: 401.
   - Shared demo customer session: 401.
   - ACTIVE user without CUSTOMER role: 403.
   - SUSPENDED customer-role user: 403.

2. **Customer A motorcycle creation**
   - Actual API handler and real Prisma/PostgreSQL path.
   - Controlled routing fixture supplied verified server route data.
   - Response service: RIDE.
   - Profile: MOTORCYCLE.
   - Unique ROVA reference.
   - Status: REQUESTED.
   - Concurrent duplicate responses: one 201, one 200, same booking ID.

3. **Customer B taxi creation**
   - Independent ACTIVE CUSTOMER account.
   - Response service: TAXI.
   - Profile: DRIVING.
   - Distinct reference and independent record.

4. **Invalid and stale requests**
   - FOOD service: 400.
   - Invalid latitude: 400.
   - London/out-of-zone pickup: 400.
   - Changed journey reusing an idempotency key: 409 / `IDEMPOTENCY_CONFLICT`.
   - No extra booking persisted.

5. **Fresh authenticated session and client**
   - New customer JWT/session retrieved the same PostgreSQL booking.
   - A new Prisma client retrieved the same record after the original creation path completed.

6. **Customer B ownership**
   - Customer B list contained only Customer B’s booking.
   - Customer A detail: 404.
   - Customer A cancellation: 404.
   - Customer A cursor: 400 / `INVALID_CURSOR`.
   - No reference enumeration.

7. **Pagination**
   - Stable two-row pages had no overlap.
   - Cursor advanced correctly.
   - Customer B’s record did not enter Customer A pages.

8. **Concurrent cancellation**
   - Two simultaneous cancels: one 200, one 409.
   - Final database state: CANCELLED.
   - One cancellation timestamp and reason.
   - One REQUESTED history row and one CANCELLED history row.

9. **PostgreSQL constraints and isolation**
   - Duplicate booking reference rejected by PostgreSQL uniqueness (P2002).
   - Missing customer rejected by foreign key (P2003).
   - Unsupported FOOD service rejected by the database check (PostgreSQL 23514 through Prisma P2010).
   - Customer deletion with booking data rejected by `ON DELETE RESTRICT`.
   - No `Trip` or `SimulatedRide` row was created for the persistent bookings.

All controlled-routing database tests were explicitly fixture-based. They did not pretend live provider availability.

## 5. Customer A and Customer B ownership results

| Operation | Customer A | Customer B |
| --- | --- | --- |
| Create independent booking | Passed, RIDE/MOTORCYCLE | Passed, TAXI/DRIVING |
| Read own booking | Passed | Passed |
| Read other booking | Not applicable | 404 |
| Cancel own pending booking | Passed, one winner | Not attempted on own record |
| Cancel other booking | Not applicable | 404 |
| List records | Owner-only records | Owner-only record |
| Cross-owner cursor | Not applicable | 400 |

## 6. Persistence and restart results

- A fresh authenticated session retrieved the same database row.
- A fresh Prisma client retrieved the same record.
- A full isolated Next.js production process was stopped and restarted.
- The restarted process retrieved two Chromium-created bookings from PostgreSQL.
- Both remained available with CANCELLED status.

This is real database and application-process persistence evidence; it did not use a simulated persistence result.

## 7. Browser and interface verification

An isolated production Next.js process was tested with headless Chromium and a staging-scoped, independently authenticated test customer.

Passed:

- Customer dashboard loading with verified identity.
- Service selection and fixed Motorcycle workflow.
- Live Geoapify Ghana pickup/destination geocoding.
- Live Geoapify road routing (separate from controlled persistence fixtures).
- Review and submit request.
- ROVA confirmation with unique `ROVA-YYYYMMDD-XXXXXXXX` reference.
- Motorcycle, pickup, destination, distance, duration, timestamp and REQUEST RECEIVED wording.
- Explicit no-driver/no-arrival/no-payment wording.
- Return to dashboard.
- Activity history and detail status history.
- Refresh persistence.
- Cancellation.
- Logout clearing both verified-customer and demo cookies.
- New page load no longer retaining the verified session after logout.
- Mobile viewport `390x844`.
- No horizontal page overflow at that viewport.

No physical-device test, Safari test or Ghana cellular-network test was performed.

Screenshots were created only in session artifact storage outside Git.

### Verification finding fixed

Browser testing found the shared logout endpoint cleared only `rova_demo_session`, not `rova_customer_session`. This was fixed so logout clears both. A regression test now confirms both cookies are removed.

The account UI was also corrected to label independently authenticated users as **VERIFIED CUSTOMER** and shared identities as **DEMO ACCOUNT**.

## 8. Security findings

Verified protections:

- Feature gate defaults disabled.
- Gate is insufficient without a verified DB-backed customer.
- Demo JWT cannot satisfy the customer JWT audience.
- Administrator JWT cannot satisfy the customer JWT audience.
- ACTIVE status and CUSTOMER role are checked server-side.
- Suspended and no-role users cannot create.
- Client-supplied owner IDs are not accepted.
- Cross-customer detail/cancel/history/cursor access returns non-enumerating responses.
- No raw route geometry is returned in booking DTOs.
- No location history or GPS trail is stored.
- No credential values entered Git.
- Booking creation creates neither `Trip` nor `SimulatedRide`.
- No payment or fare record exists.
- No driver or operator lookup is invoked.
- Cancellation race does not corrupt state.
- Private booking API responses use `private, no-store`.

The in-memory rate limiter remains instance-local and should not be treated as a distributed abuse control.

## 9. Final validation

Final successful commands:

- `npm ci` — passed, 0 install-time vulnerabilities.
- `npm audit` — 0 vulnerabilities.
- `npm audit --omit=dev` — 0 vulnerabilities.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` with `RUN_BOOKING_DATABASE_TESTS=true` and isolated `TEST_DATABASE_URL` — **26 files, 164 tests passed, 0 skipped**.
- `npx prisma generate` — passed.
- `npx prisma validate` — passed.
- `npm run build` — passed.
- `git diff --check` — passed.

The one initial full-test invocation immediately after `npm ci` could not import Prisma because `prisma generate` had not yet completed in that parallel validation step. Generation then succeeded and the complete suite reran with 164/164 passing. No implementation behavior was changed to bypass that prerequisite.

## 10. Staging migration impact

Expected additive staging impact:

- One enum: `BookingRequestStatus`.
- Two tables: `BookingRequest`, `BookingRequestStatusHistory`.
- Seven indexes.
- Three foreign keys.
- Four check constraints.

No applicant, administration, user, trip or simulated-dispatch records are modified by the migration. `Trip` remains separate and retains its fare requirement.

Before any staging deployment:

1. Verify a restorable backup and PITR window.
2. Confirm staging and production database isolation.
3. Apply the migration to a restored or disposable staging-like database.
4. Verify real independently authenticated staging accounts.
5. Run the opted-in PostgreSQL suite and browser smoke suite.
6. Confirm recruitment and administration regression results.
7. Review MapTiler/Geoapify configuration without printing keys.
8. Keep `CUSTOMER_RIDES_ENABLED=false` during rollout.
9. Obtain separate authorization for staging migration and any gate enablement.

## 11. Outstanding blockers

- Real customer registration, credential recovery and independently verified activation are not implemented.
- Durable/revocable server-side sessions are not implemented.
- A production customer account login must not be inferred from the isolated test session primitive.
- Backup and point-in-time recovery were not verified for Railway.
- Centralized/distributed rate limiting and observability are not deployed.
- Data-retention/deletion policy is not approved.
- Physical/mobile Ghana-device and Safari verification is absent.
- Railway staging migration has not occurred.
- No driver authentication, driver dashboard or live dispatch work has started.
- No payment system exists or is enabled.

## 12. Deployment-readiness recommendation

**Recommendation: APPROVED FOR ISOLATED DATABASE REVIEW, NOT APPROVED FOR STAGING DEPLOYMENT.**

The persistent booking layer, ownership checks, PostgreSQL schema, concurrency behavior, restart persistence and browser journey passed locally. Keep the booking gate disabled and do not migrate Railway until real-account activation, durable session revocation, backup/PITR and explicit migration/deployment approvals are complete.

No commit, push, merge or deployment was performed. The existing Git stash remained intact and unrelated existing worktree reports/changes were preserved.
