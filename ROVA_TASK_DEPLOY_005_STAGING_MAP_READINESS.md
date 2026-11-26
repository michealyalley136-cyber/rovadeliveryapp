# ROVA TASK DEPLOY-005 — Staging Map Readiness

**Historical assessment:** Git status, staging observations, and validation results below describe DEPLOY-005, not the current branch or current Railway state. They do not authorize a new deployment.

## Status

- **IMPLEMENTED:** The customer dashboard, MapLibre/MapTiler integration, Geoapify geocoding/routing, marker lifecycle fix, and motorcycle/taxi route-state fixes are implemented.
- **LOCALLY VERIFIED:** Dependency audits, lint, type-check, 137 tests, Prisma validation/generation, build, diff checks, and redacted provider requests passed.
- **GIT RELEASED:** Commit `50ac3263343a1eb870f48afdafd4d3d608f4aa62` is on `origin/feature/customer-dashboard` after explicit approval from the prior task.
- **LIVE-VERIFIED:** Staging customer login succeeds, protected customer APIs reject unauthenticated access, and the new `/api/maps/config` route appeared after the branch push.
- **BLOCKED:** Staging MapTiler and Geoapify variables are not configured. Their provider-account terms, quotas, and allowed-origin administration could not be reviewed from Codespaces.
- **PENDING:** Railway staging variable approval, a Railway deployment observation after configuration, independent browser/mobile tests, and a Ghana-based tester.
- **PRODUCTION:** Not modified, merged, or deployed.

## Current Git and worktree state

| Item | Value |
| --- | --- |
| Branch | `feature/customer-dashboard` |
| GitHub commit | `50ac3263343a1eb870f48afdafd4d3d608f4aa62` |
| Commit title | `Add real Ghana customer map planning` |
| Remote SHA | Matches local `HEAD` |
| New Railway variable changes | None |
| New Git push during DEPLOY-005 | None |
| Uncommitted work | Pre-existing `ROVA_MASTER_LOGIN_PREVIEW_RAILWAY_SYNC_REPORT.md` edit remains preserved |
| Saved stash | `stash@{0}: On main: Codespaces pre-sync slideshow changes 2026-11-22` |
| Prisma schema/migrations | Unchanged |

The push of `50ac326` occurred under the approval recorded for DEPLOY-004. DEPLOY-005 itself has not requested or performed another commit, push, Railway variable change, or production action.

## Implementation review

The source contains:

- MapTiler Streets v4 through `ROVA_MAPTILER_PUBLIC_KEY`.
- Geoapify search/autocomplete, reverse geocoding, and route requests through `ROVA_GEOAPIFY_API_KEY`.
- Motorcycle route profile: `MOTORCYCLE`, sent to Geoapify as `motorcycle`.
- Taxi route profile: `DRIVING`, sent to Geoapify as `drive`.
- Ghana coordinate and country filtering.
- A customer-only server authorization gate for map APIs.
- Longitude/latitude marker creation before `Marker.addTo(map)`.
- Finite coordinate validation, marker reuse, and drag-listener cleanup.
- Route invalidation for service, pickup, and destination changes.
- Cancellation of obsolete in-flight route requests.
- Service-first motorcycle and taxi pages without a service toggle.
- Explicit unavailable/provider-error states and no synthetic route fallback.
- No `ROVA_MAPTILER_SERVER_KEY` reference in source or committed files.

## Release files

Commit `50ac326` contains 28 files:

- `.env.example`
- `.env.staging.example`
- `ENVIRONMENT.md`
- `README.md`
- `ROVA_TASK_DEPLOY_004_STAGING_SYNC_REPORT.md`
- `ROVA_TASK_MAP_001_GHANA_MAP_FOUNDATION_REPORT.md`
- `ROVA_TASK_MAP_002_LIVE_GHANA_INTEGRATION_REPORT.md`
- `src/app/api/maps/config/route.ts`
- `src/app/api/maps/geocode/route.ts`
- `src/app/api/maps/reverse/route.ts`
- `src/app/api/maps/route/[service]/route.ts`
- `src/app/customer/customer-dashboard.css`
- `src/components/customer-booking.tsx`
- `src/components/customer-map-planner.tsx`
- `src/components/rova-map.tsx`
- `src/lib/maps/ghana.ts`
- `src/lib/maps/marker-lifecycle.ts`
- `src/lib/maps/planner-state.ts`
- `src/lib/maps/types.ts`
- `src/server/__tests__/customer-booking-flow.test.tsx`
- `src/server/__tests__/maps-ghana.test.ts`
- `src/server/__tests__/maps-providers.test.ts`
- `src/server/__tests__/maps-route-service.test.ts`
- `src/server/maps/auth.ts`
- `src/server/maps/config.ts`
- `src/server/maps/errors.ts`
- `src/server/maps/geoapify.ts`
- `src/server/maps/http.ts`

No source or committed file contains provider credential values, and the focused commit contains no Prisma file.

## Credential and provider review

### Local credential presence

Codespaces contains both development credential variables by name:

- `ROVA_MAPTILER_PUBLIC_KEY`: present
- `ROVA_GEOAPIFY_API_KEY`: present
- `ROVA_MAPTILER_SERVER_KEY`: absent and no longer required

No values were displayed or copied into this report.

### MapTiler

The implementation uses a browser-visible key by design and requires an exact allowed HTTP origin:

`rovadeliveryapp-staging.up.railway.app`

The development key rejected a non-browser server-shell request with 403. This is consistent with origin restrictions, but it does not prove that staging is currently an allowed origin. Codespaces has no access to the MapTiler account console, licensing terms for the selected plan, or quota usage. Therefore:

- Exact origin inclusion is **unverified**.
- Commercial-use permission is **unverified**.
- Quota and billing tier are **unverified**.
- Sharing the Codespaces key with staging is **not approved** until the account owner confirms the plan, exact origin list, and terms.
- Do not remove existing origin restrictions or create an unrestricted key.

### Geoapify

Using the existing development server-only key, redacted live requests verified:

- Kotoka International Airport geocoding: real Ghana result.
- Osu geocoding: real Ghana result.
- Motorcycle route: Geoapify `motorcycle`, 8,762 m, 2,780.421 seconds, 305 geometry points.
- Taxi route: Geoapify `drive`, 7,419 m, 2,018.511 seconds, 244 geometry points.

This confirms endpoint/function support for development only. Geoapify account restrictions, IP/origin policy, commercial permissions, remaining quota, and whether the development key may be used in staging remain **unverified**. The staging key must be a separately reviewed server-only Railway variable.

## Railway staging findings

Railway CLI and `RAILWAY_TOKEN` are unavailable, so no variable names, values, deployment ID, build log, predeploy log, or control-plane configuration can be inspected directly.

Read-only HTTP observation after the approved branch push found:

- `/`: 200
- `/customer`: 200
- `/customer/motorcycle`: 200 and protected by customer sign-in
- `/customer/cab`: 200 and protected by customer sign-in
- Unauthenticated `/api/maps/config`: 401, confirming the new route is present and protected
- Authenticated staging demo customer login: 200
- Authenticated `/api/maps/config`: 200

The authenticated configuration returned only boolean availability checks for this report:

| Capability | Staging state |
| --- | --- |
| MapTiler style configured | False |
| Geoapify search | False |
| Geoapify autocomplete | False |
| Geoapify reverse geocoding | False |
| Motorcycle routing | False |
| Taxi driving routing | False |

This proves the code rollout changed from the old 404 map API state to the new protected map API, but it does not independently identify Railway's deployment ID or Git SHA. Staging remains mapping-configured **false** until approved variables are supplied.

## Required Railway staging variables

Prepare these variables in Railway's staging service only:

| Variable | Required value/property | Status |
| --- | --- | --- |
| `ROVA_AUTH_ENVIRONMENT` | `staging` | Remains intact; authenticated staging JWT identity was accepted |
| `ROVA_MAPTILER_PUBLIC_KEY` | Exact-origin-restricted browser key including `rovadeliveryapp-staging.up.railway.app` | Missing/unconfigured on staging |
| `ROVA_GEOAPIFY_API_KEY` | Separately reviewed server-only staging key | Missing/unconfigured on staging |

Do not modify:

- `AUTH_SECRET`
- `DATABASE_URL`
- `ROVA_DEMO_MODE`
- JWT validation rules
- Any production variable

No Railway variable was added, replaced, or deleted.

## Validation

Final local validation for commit `50ac326` passed:

| Check | Result |
| --- | --- |
| `npm ci` | Passed |
| `npm audit` | Passed; 0 vulnerabilities |
| `npm audit --omit=dev` | Passed; 0 vulnerabilities |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 23 test files, 137 tests |
| `npx prisma generate` | Passed |
| `npx prisma validate` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Secret-shaped value scan | Passed |
| Prisma schema/migration diff | None |

Prisma commands used a non-connecting local placeholder. No migration or database query was run.

## Predeploy and database impact

Railway's existing predeploy `npx prisma migrate deploy` can be reviewed before the next deployment, but this release contains no new migration. Live migration status could not be queried without authenticated Railway/database access.

No destructive database command is approved or required:

- No `migrate reset`
- No `db push --force-reset`
- No production database access
- No schema or data migration

## Remaining live-validation plan

After explicit staging-variable approval and a completed Railway deployment:

1. Confirm Railway deployment status and SHA if dashboard access is supplied.
2. Load the staging homepage.
3. Sign in with an approved staging demo customer session.
4. Open motorcycle and taxi booking.
5. Confirm MapTiler real Ghana streets load.
6. Search for Kotoka International Airport and an Osu/La destination.
7. Confirm distinct draggable pickup and destination markers.
8. Confirm motorcycle uses `motorcycle` and taxi uses `drive`.
9. Confirm route geometry, distance, and ETA are provider-derived.
10. Change pins and confirm stale routes disappear/recalculate.
11. Test mobile controls and page switching.
12. Verify recruitment, application status, admin authorization, and unauthenticated rejection remain intact.
13. Obtain independent browser verification, including a Ghana-based tester where available.

No Ghana-based live test is claimed yet.

## Exact approvals required

1. **Provider owner approval:** Confirm the MapTiler plan permits the staging origin and add `rovadeliveryapp-staging.up.railway.app` without weakening existing restrictions.
2. **Provider owner approval:** Provide or approve a separately restricted, server-only Geoapify key for Railway staging and confirm quotas/licensing.
3. **Railway approval:** Authorize addition of `ROVA_MAPTILER_PUBLIC_KEY` and `ROVA_GEOAPIFY_API_KEY` to the staging service only.
4. **Operator/access approval:** Supply authenticated Railway control-plane access or have an authorized Railway operator perform the two variable additions and record the deployment ID/SHA.
5. **Live-test approval:** Authorize the staging demo browser workflow and an independent Ghana tester.

No additional Git commit or push is currently required. No Railway configuration, deployment, database action, production action, or paid upgrade has been performed at this gate.
