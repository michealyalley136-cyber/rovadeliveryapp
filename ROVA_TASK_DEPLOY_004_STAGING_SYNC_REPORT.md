# ROVA TASK DEPLOY-004 — Staging Sync Report

## Status

- **IMPLEMENTED:** Latest Codespaces customer-dashboard and Ghana mapping implementation is present locally.
- **TESTED LOCALLY:** Automated validation is complete.
- **DEPLOYED TO STAGING:** **No.** No commit, push, Railway variable change, migration, or deployment was performed.
- **LIVE-VERIFIED:** Staging currently serves the existing commit only. The refreshed motorcycle and taxi mapping implementation is not deployed.
- **BLOCKED:** Railway credentials/control-plane access, staging map variables, final release approval, and a Ghana-based browser tester are required.
- **PENDING STAGING APPROVAL:** Commit and push to `feature/customer-dashboard` have not been requested or performed.
- **PENDING PRODUCTION APPROVAL:** Production was not modified and is outside this task.

## Current versus proposed Git state

| Item | Current value |
| --- | --- |
| Branch | `feature/customer-dashboard` |
| Local and remote `HEAD` | `6414498b82eef497752ad383031fd9c6f6843bfd` — `Clarify returning applicant recovery path` |
| Proposed commit | Not created; all release work remains uncommitted |
| Push performed | No |
| Merge performed | No |
| Railway staging deployment performed | No |
| Production modification | None |

The existing branch is synchronized with `origin/feature/customer-dashboard` at the same `HEAD`, while the local worktree contains the mapping release. The saved stash `stash@{0}: On main: Codespaces pre-sync slideshow changes 2026-11-22` remains intact.

## Changes ready for review

### Customer and booking flow

- Service-first customer dashboard integration for motorcycle and taxi journeys.
- Fixed motorcycle and taxi routes: no service toggle in the booking planner.
- Real MapLibre/MapTiler `streets-v4` Ghana basemap.
- Geoapify autocomplete/search, reverse geocoding, and road routing APIs.
- Provider-derived geometry, distance, and ETA; no synthetic-road fallback.
- Motorcycle requests use Geoapify `motorcycle`; taxi requests use `drive`.
- No live dispatch or payment activation.

### Marker and search/state corrections

- Markers receive finite `[longitude, latitude]` coordinates before `Marker.addTo(map)`.
- Invalid or unavailable marker coordinates are ignored safely.
- Existing markers are updated rather than duplicated.
- Drag listeners are detached and markers removed during cleanup.
- Map construction no longer depends on routine service-zone array renders.
- Invalid vehicle coordinates cannot create markers.
- Selected map-pin addresses no longer trigger a redundant autocomplete search.
- Selecting a pin clears stale search errors and failed searches do not alter valid coordinates.
- Route results are keyed to the exact service, pickup, and destination coordinates.
- In-flight route requests are aborted when inputs or service change, preventing stale distance/ETA results.
- Custom duplicate attribution was removed; MapLibre's style-source attribution control is retained.

### Files included in the proposed release

Tracked modifications:

- `.env.example`
- `.env.staging.example`
- `ENVIRONMENT.md`
- `README.md`
- `src/app/customer/customer-dashboard.css`
- `src/components/customer-booking.tsx`

The pre-existing edit to `ROVA_MASTER_LOGIN_PREVIEW_RAILWAY_SYNC_REPORT.md` is unrelated to this mapping release and is intentionally excluded from the focused commit. It remains preserved in the worktree.

New implementation files:

- `src/app/api/maps/config/route.ts`
- `src/app/api/maps/geocode/route.ts`
- `src/app/api/maps/reverse/route.ts`
- `src/app/api/maps/route/[service]/route.ts`
- `src/components/customer-map-planner.tsx`
- `src/components/rova-map.tsx`
- `src/lib/maps/ghana.ts`
- `src/lib/maps/marker-lifecycle.ts`
- `src/lib/maps/planner-state.ts`
- `src/lib/maps/types.ts`
- `src/server/maps/auth.ts`
- `src/server/maps/config.ts`
- `src/server/maps/errors.ts`
- `src/server/maps/geoapify.ts`
- `src/server/maps/http.ts`

New focused tests:

- `src/server/__tests__/customer-booking-flow.test.tsx`
- `src/server/__tests__/maps-ghana.test.ts`
- `src/server/__tests__/maps-providers.test.ts`
- `src/server/__tests__/maps-route-service.test.ts`

Task reports:

- `ROVA_TASK_MAP_001_GHANA_MAP_FOUNDATION_REPORT.md`
- `ROVA_TASK_MAP_002_LIVE_GHANA_INTEGRATION_REPORT.md`
- `ROVA_TASK_DEPLOY_004_STAGING_SYNC_REPORT.md`

## Validation results

All of the following passed after the final marker/search/route-state fixes:

| Check | Result |
| --- | --- |
| `npm ci` | Passed |
| `npm audit` | Passed; 0 vulnerabilities |
| `npm audit --omit=dev` | Passed; 0 vulnerabilities |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 23 files, 137 tests |
| `npx prisma generate` | Passed |
| `npx prisma validate` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Prisma schema/migration diff | None |
| Dependency secret scan | No credential values found |

Prisma generation and validation used a non-connecting local placeholder only; no database migration or data mutation was run.

## Real provider verification

Direct, redacted development-environment provider checks succeeded for Geoapify:

- `Kotoka International Airport, Accra, Ghana` resolved in Ghana.
- `Osu, La, Accra, Greater Accra Region, Ghana` resolved in Ghana.
- Motorcycle profile: `motorcycle`
  - 8,762 m
  - 2,780.421 seconds
  - 305 geometry points
  - Geometry type: `MultiLineString`
- Taxi profile: `drive`
  - 7,419 m
  - 2,018.511 seconds
  - 244 geometry points
  - Geometry type: `MultiLineString`

These are real provider responses, not synthetic fallback data. They differ from the user-supplied Airport Bypass to La screenshot because they are a different Kotoka-to-Osu test pair.

The MapTiler development key returned 403 to a non-browser server-shell request. That is consistent with a browser-origin-restricted key, but this session could not inspect the provider account or confirm that Railway's hostname is permitted.

## Browser verification

Local browser automation was unavailable because the environment has no Chromium/Chrome/Playwright runtime. The user provided screenshot evidence of the Codespaces motorcycle route displaying:

- Pickup: Airport Bypass, Accra
- Destination: La, Accra
- Route: 7.8 km
- Estimate: 31 minutes

That screenshot is recorded as supplied evidence, not an independent browser test performed by this session. Taxi/mobile interactions, marker drag behavior, visual attribution, and geocoding error recovery still require browser verification.

Required post-approval live links:

- `https://rovadeliveryapp-staging.up.railway.app/customer`
- `https://rovadeliveryapp-staging.up.railway.app/customer/motorcycle`
- `https://rovadeliveryapp-staging.up.railway.app/customer/cab`

No result is claimed as Ghana-tested until an authorized Ghana-based tester completes it.

## Railway staging findings

Read-only HTTP checks show:

- `/`, `/customer`, `/customer/motorcycle`, and `/customer/cab` currently return 200 from the existing deployment.
- `/api/dashboard` and `/api/rides` return 401 without a session.
- An invalid application-recognition cookie did not grant customer dashboard access.
- The customer demo sign-in endpoint now recognizes the staging auth environment; no `ROVA_AUTH_ENVIRONMENT` error was observed.
- The current deployment does not contain the mapping API routes: `/api/maps/config`, `/api/maps/geocode`, `/api/maps/reverse`, and `/api/maps/route/RIDE` return 404.
- This is consistent with staging still serving commit `6414498b`, before the mapping files are committed.

Railway CLI, a Railway token, deployment ID, build/predeploy logs, and control-plane access are unavailable in Codespaces. The branch and production-change boundaries were therefore not changed.

## Required Railway variables

Review and approve these staging-only variables before deployment:

| Variable | Intended value/placement | Status |
| --- | --- | --- |
| `ROVA_AUTH_ENVIRONMENT` | `staging` | Staging sign-in indicates it is configured; do not change or rotate it during this release |
| `ROVA_MAPTILER_PUBLIC_KEY` | A separately approved browser-restricted staging key, or the reviewed existing key with the exact additional allowed origin `rovadeliveryapp-staging.up.railway.app` | **Required before staging map tiles; not applied** |
| `ROVA_GEOAPIFY_API_KEY` | Server-only Railway staging variable | **Required before staging search/reverse/routing; not applied** |

Before approving shared MapTiler use:

1. Confirm MapTiler terms permit one key across the approved Codespaces and staging origins.
2. Add the exact staging hostname without weakening the origin list to a wildcard.
3. Confirm the server-side Geoapify key is not exposed in client bundles.
4. Review the staging provider quotas/rate limits; do not purchase a paid plan without separate authorization.
5. Preserve `AUTH_SECRET`, `DATABASE_URL`, `ROVA_DEMO_MODE`, JWT validation, and all production variables unchanged.

## Database and predeploy impact

- Current release introduces **no Prisma schema or migration changes**.
- The existing Railway predeploy command `npx prisma migrate deploy` is non-destructive with respect to the reviewed diff because no new migration is proposed.
- Live Railway migration status was not queried because staging `DATABASE_URL` and a Railway service shell are unavailable.
- Do not run `migrate reset`, `db push --force-reset`, or any production database command.
- Before a future deployment, review Railway's predeploy log and confirm the staging database's `_prisma_migrations` state. No schema-bearing rollout is needed for this mapping release.

## Authorization boundary and blockers

Required before proceeding:

1. Approve the exact file list and focused mapping/booking release.
2. Approve the staging-only MapTiler origin/key arrangement and Geoapify variable.
3. Confirm whether `ROVA_DEMO_MODE` remains intentionally enabled or should remain unchanged at its current behavior.
4. Approve creation of a focused commit on `feature/customer-dashboard`.
5. Approve pushing that commit to `origin/feature/customer-dashboard`.
6. Provide authenticated Railway access or have an authorized operator apply the reviewed variables and confirm deployment logs/ID/SHA.
7. Arrange an authorized Ghana-based browser tester after deployment.

No commit, push, merge, Railway variable update, predeploy execution, or staging deployment is being performed at this stop point.
