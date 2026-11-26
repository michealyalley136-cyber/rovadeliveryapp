# ROVA GHANA — CUSTOMER-003 Persistent Booking System Report

## 1. Current booking architecture

The existing customer journey planner was a browser and in-memory demo. `/api/rides` created demo-store trips with estimated fares, while `/api/dashboard` read temporary shared-demo data. `Trip` is fulfillment and ledger oriented and requires `estimatedFarePesewas`. `SimulatedRide` is explicitly a dispatch simulation and includes operational search, assignment and driver-offer states. Neither model is a safe representation of a non-operational persistent customer request.

The existing MapTiler/Geoapify integration, Ghana polygon validation, RIDE=`MOTORCYCLE` and TAXI=`DRIVING` profiles, route rate limiting, Prisma PostgreSQL adapter and status-history patterns were reusable.

## 2. New persistent booking design

**Architecture decision: a dedicated `BookingRequest` model.**

This additive boundary keeps fare and live-trip fields out of the customer request, prevents dispatch simulation from being mistaken for a real booking, and leaves existing applications, `Trip`, `SimulatedRide`, operators and administration untouched. A future dispatch task can create/link a separate `Trip` only after driver authentication and operational approval exist.

Only `REQUESTED` and `CANCELLED` are persisted operational states. `DRAFT` is client-side planning only. The server never advances a booking to searching, assignment, en-route, in-progress or completed.

| Capability | Classification |
| --- | --- |
| Dedicated persistent request architecture | IMPLEMENTED |
| Existing `Trip` and simulated ride isolation | IMPLEMENTED, UNIT TESTED |
| Server-verified Ghana road route | IMPLEMENTED, UNIT TESTED |
| No dispatch, fare, payment method or ledger entry | IMPLEMENTED, UNIT TESTED |

## 3. Prisma model and migration changes

Prisma adds:

- `BookingRequestStatus`: `REQUESTED`, `CANCELLED`.
- `BookingRequest`: unique ID/reference, authenticated customer owner, RIDE/TAXI service, immutable journey endpoints, route result, routing provider/profile/timestamp, audit metadata, idempotency fingerprint, cancellation data, timestamps and status history.
- `BookingRequestStatusHistory`: previous/new state, actor user, reason and timestamp.
- User relations for owned requests and booking status changes.
- Unique indexes for reference and `(customerId, idempotencyKey)`.
- Stable history indexes for `(customerId, createdAt, id)`, status history and cancellation-era queries.
- PostgreSQL checks for coordinate ranges, supported services/profiles, positive distance/non-negative duration and cancellation consistency.

Migration: `prisma/migrations/20261123010000_customer_booking_requests/migration.sql`.

The migration is additive. It creates two tables, one enum and indexes/foreign keys. It does not alter or remove any existing applicant, application, user, `Trip`, ledger or simulated-dispatch data. It was generated and validated but **was not applied to any Railway environment**.

## 4. Authentication and customer ownership protections

A separate HttpOnly `rova_customer_session` JWT audience and `kind=customer` were added. Demo `rova_demo_session` and administrator tokens cannot satisfy this audience. Shared demo IDs cannot be used for private booking access.

Every booking operation:

1. Requires the real customer cookie.
2. Loads the customer from `User` by authenticated subject.
3. Requires `UserStatus=ACTIVE`.
4. Requires a database `UserRole` whose role key is `CUSTOMER`.
5. Scopes all reads, history and cancellation by the authenticated `customerId`.
6. Rejects browser-supplied ownership.

Missing ownership returns the same 404 response as a nonexistent ID, preventing reference enumeration. Applicants are never activated or granted roles by this implementation.

| Capability | Classification |
| --- | --- |
| Active verified customer requirement | IMPLEMENTED, UNIT TESTED |
| CUSTOMER role requirement | IMPLEMENTED, UNIT TESTED |
| Shared-demo isolation | IMPLEMENTED, UNIT TESTED |
| Cross-customer read/cancel denial | IMPLEMENTED, UNIT TESTED |
| Suspended/closed account denial | IMPLEMENTED, UNIT TESTED |
| Durable production customer login/session revocation | BLOCKED, NOT IMPLEMENTED |

## 5. Implemented APIs

Versioned private APIs avoid changing `/api/rides`:

- `POST /api/v1/bookings` — validate, independently route, persist and return a request.
- `GET /api/v1/bookings?limit=&cursor=` — stable account-owned paginated history.
- `GET /api/v1/bookings/[bookingId]` — account-owned detail.
- `GET /api/v1/bookings/[bookingId]/history` — account-owned status history.
- `POST /api/v1/bookings/[bookingId]/cancel` — transaction-safe eligible cancellation.

Controls include Zod schemas, Ghana coordinates/service-zone checks, strict service values, bounded field lengths, bounded streaming request bodies, per-customer/IP action rate limits, idempotency keys with request fingerprints, safe error DTOs, `private, no-store` responses, and privacy-conscious structured database/provider failure logging.

| Capability | Classification |
| --- | --- |
| Versioned booking API surface | IMPLEMENTED, UNIT TESTED |
| Zod and input-size validation | IMPLEMENTED, UNIT TESTED |
| Ownership-scoped pagination and lookup | IMPLEMENTED, UNIT TESTED |
| Idempotent creation | IMPLEMENTED, UNIT TESTED |
| Rate limiting | IMPLEMENTED |
| Route provider failure safety | IMPLEMENTED, UNIT TESTED |
| Real HTTP/database end-to-end API verification | BLOCKED |

## 6. Booking confirmation experience

The customer planner presents review details and, for an enabled verified account, submits a server-verified request. The confirmation includes ROVA branding, reference, Motorcycle/Taxi, pickup, destination, road distance, estimated travel time, creation timestamp and “Request received.”

It explicitly says the saved request is a **non-operational pilot booking**, no driver will arrive and no payment was collected. It does not claim assignment, arrival, tracking or payment success.

| Capability | Classification |
| --- | --- |
| Professional pilot confirmation | IMPLEMENTED |
| Dynamic confirmation interaction | NOT IMPLEMENTED as browser-tested; BLOCKED |

## 7. Customer dashboard integration

The existing ROVA layout, Ghana visuals, services, navigation, demo activities, wallet deferral, safety and account sections remain. Verified-account mode adds:

- Latest saved booking on Home.
- Persistent paginated Activity history.
- Reference, service, endpoints, time, route summary and status.
- Details/status-history expansion.
- Cancellation for `REQUESTED` records.
- Loading, empty, network, expired-session and unavailable-database error states.

Account changes reset booking display state and refetch only after ownership is resolved. Browser storage remains limited to demo conveniences and is never the booking source of truth.

| Capability | Classification |
| --- | --- |
| Home latest booking | IMPLEMENTED |
| Activity history, details and cancellation UI | IMPLEMENTED |
| Stable pagination integration | IMPLEMENTED |
| Account isolation during loading/switching | IMPLEMENTED |
| Browser verification in Ghana network/device matrix | BLOCKED |

## 8. Cancellation and status rules

Cancellation uses a database transaction and conditional update where owner and status are `REQUESTED`. Exactly one competing attempt can transition the record and append `REQUESTED → CANCELLED` history. A later attempt receives 409. Cancelled records remain readable in history.

Only `REQUESTED` and `CANCELLED` exist in `BookingRequestStatus`; there is no automatic dispatch transition.

| Capability | Classification |
| --- | --- |
| Concurrent cancellation guard | IMPLEMENTED, UNIT TESTED |
| Historical cancelled record retention | IMPLEMENTED, UNIT TESTED |
| Dispatch state prevention | IMPLEMENTED, UNIT TESTED |

## 9. Test results

Commands run:

- `npm ci`: passed; 0 vulnerabilities reported during install.
- `npm audit`: passed, 0 vulnerabilities.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed — 154 tests, 25 suites; 1 isolated PostgreSQL suite skipped.
- `npx prisma generate`: passed. A syntactically valid non-connecting local URL was used only for Prisma tooling and is not persistence evidence.
- `npx prisma validate`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

Focused booking tests cover:

- Active/status/role authorization.
- Demo token separation.
- Cross-customer 404 behavior.
- Fixed Motorcycle/Taxi profiles.
- Idempotent duplicate submissions.
- Out-of-zone rejection.
- Provider failure with no write.
- No fare/ledger persistence.
- Stable ownership-scoped pagination.
- Concurrent cancellation serialization.
- API 401/403/400/404/409 boundaries.
- No automatic transition to dispatch states.

The full suite also re-ran recruitment, administration, maps, simulated dispatch and existing customer tests.

| Capability | Classification |
| --- | --- |
| Mocked/unit regression coverage | UNIT TESTED |
| Existing feature regression suite | UNIT TESTED |

## 10. Database integration results

No `DATABASE_URL` or `TEST_DATABASE_URL` was available, and no local PostgreSQL server was available. The PostgreSQL persistence test is present and remains explicitly gated by:

- `RUN_BOOKING_DATABASE_TESTS=true`
- `TEST_DATABASE_URL` pointing to an explicitly isolated database with the migration applied.

It creates isolated tagged records, disconnects Prisma, opens a fresh client and verifies the saved booking. It was skipped in this environment. It does not run migrations or touch Railway.

| Capability | Classification |
| --- | --- |
| Prisma schema generation/validation | IMPLEMENTED |
| Real PostgreSQL migration application | BLOCKED |
| Refresh/server-restart persistence | IMPLEMENTED as test scaffolding; BLOCKED as database-tested |
| Fresh authenticated session database read | BLOCKED |

## 11. Security review

Implemented safeguards:

- Real-customer cookie audience is distinct from demo/admin JWTs.
- Database status and CUSTOMER role checked on every operation.
- All private queries include authenticated ownership.
- No client customer ID is accepted.
- Route distances/times are server-calculated and service profiles are server-derived.
- Provider failure cannot create a successful request.
- Input, body and rate limits are enforced.
- Coordinates are validated at application and database boundaries.
- Idempotency and request fingerprints prevent accidental/replayed duplicates.
- Cancellation uses a conditional transactional transition.
- No full route geometry, browser GPS trail, map API key or unnecessary location history is exposed.
- Cancellation history and booking records remain private and no-store.
- No payment, ledger or fare field exists in the booking model.

Remaining risks/blockers:

- Durable customer session revocation is not implemented.
- Production customer registration, credential verification and account activation are not implemented.
- The new JWT creation primitive is not exposed through an approved activation/login flow.
- In-memory rate limiting is instance-local, not a globally durable limit.
- Backup, point-in-time recovery and environment isolation were not verifiable here.
- Operational monitoring/alert routing is not configured for booking events.
- A production data-retention schedule and deletion workflow are not approved.

## 12. Pending real-account authentication dependencies

Before public use, an approved account task must provide:

1. Independently registered customers.
2. Verified credentials/contact recovery.
3. `ACTIVE` activation controlled by an administrator or verified workflow.
4. Durable sessions with revocation and rotation.
5. A CUSTOMER role assignment process independent from recruitment approval.
6. Individually authenticated staging test customers.
7. Logout and compromised-account revocation tests.

Demo JWT identities remain unsuitable and are blocked from all booking APIs.

## 13. Feature-gate behavior

Real booking creation and history are disabled unless:

```env
CUSTOMER_RIDES_ENABLED=true
```

The default is false. Even when enabled, a valid separate real-customer cookie, ACTIVE database user and CUSTOMER role are mandatory. The shared demo dashboard explicitly displays that persistent booking submission is unavailable. `LIVE_DISPATCH_ENABLED` remains unrelated and does not enable any booking transition.

| Capability | Classification |
| --- | --- |
| Disabled-by-default gate | IMPLEMENTED, UNIT TESTED |
| Demo booking operation denial | IMPLEMENTED, UNIT TESTED |
| Railway gate enablement | NOT IMPLEMENTED, BLOCKED |

## 14. Railway staging deployment requirements

No staging deployment or migration was performed.

Required approval sequence:

1. Preserve/verify a Railway PostgreSQL backup and point-in-time recovery procedure.
2. Confirm staging is isolated from production data and credentials.
3. Review the additive migration with a database owner.
4. Apply the migration only to an isolated test database first.
5. Run the gated database integration suite and ownership tests with separate real test accounts.
6. Confirm applicant/administrator smoke tests and existing demo behavior.
7. Confirm MapTiler and Geoapify staging credentials remain valid.
8. Keep `CUSTOMER_RIDES_ENABLED=false` during application rollout.
9. Separately approve and enable real customer auth.
10. Separately approve enabling the booking gate for remote testers.
11. Verify rollback readiness and observability before traffic.
12. Obtain explicit migration and staging deployment authorization.

Rollback recommendation: disable the feature gate first and roll the application revision back. Leave the additive tables intact to preserve saved requests. Restore data from the verified backup/PITR procedure only for an approved incident; do not use `prisma migrate reset`, `db push`, destructive columns or automatic Railway migrations.

| Capability | Classification |
| --- | --- |
| Migration file and rollback procedure | IMPLEMENTED |
| Staging migration/deployment | BLOCKED |
| Production deployment | NOT IMPLEMENTED, BLOCKED |

## 15. Remaining production-readiness issues

The system is **not production-ready**. Required gates still include:

- Real account registration/authentication/activation.
- Durable session revocation.
- Isolated PostgreSQL integration verification.
- Browser and mobile verification, including real Ghana provider behavior.
- Backup/PITR verification.
- Centralized rate limiting and monitoring.
- Retention/deletion policy.
- Approved migration/recovery runbook.
- Driver authentication and separate dispatch design.
- Separate review for live state transitions and operational ownership.

No production data was changed and no deployment was attempted. Existing saved Codespaces stash files and unrelated reports were not modified.

## 16. Recommended next development task

**CUSTOMER-004 — Verified customer authentication, activation and durable session revocation.**

Deliver customer registration/login, independently assigned ACTIVE CUSTOMER accounts, revocable server-side sessions, isolated test identities and integration tests. Once that is accepted, rerun CUSTOMER-003 against an isolated PostgreSQL staging clone, perform browser/device verification, review backups, obtain migration approval, and then enable only the persistent request gate. Driver dispatch, fare calculation and payment remain separate later tasks.
