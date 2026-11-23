# ROVA Task MAP-002A: Live Ghana Map Integration Report

Date: 2026-11-22

## Overall result

**Not live-ready.** The provider architecture, MapTiler Streets v4 configuration, Geoapify Ghana search adapter, routing profiles, security controls, and booking integration pass automated validation. Real tiles, searches, routes, and graphical mobile testing are blocked because the required credentials are not available to the Codespaces process.

No commit, push, Railway change, payment change, authentication change, database change, migration, or production deployment was performed.

## Credential inspection

Safe environment-presence checks reported:

| Variable | Result | Consumer |
| --- | --- | --- |
| `ROVA_MAPTILER_PUBLIC_KEY` | Absent | Browser MapTiler Streets v4 style URL |
| `ROVA_GEOAPIFY_API_KEY` | Absent | Server-only Ghana search/autocomplete/reverse geocoding and `motorcycle`/`drive` road routing |

No key value was printed, written to source, copied into a report, or committed.

### Required secure configuration

Configure the following through Codespaces secrets or the approved deployment secret manager:

```text
ROVA_MAPTILER_PUBLIC_KEY
ROVA_GEOAPIFY_API_KEY
```

- Restart/rebuild Codespaces after adding the secrets.
- Restrict the MapTiler public key to the approved Codespaces preview origin and later staging/production origins. It is intentionally browser-visible in style/tile requests.
- Keep the Geoapify key server-only; only the ROVA server route calls Geoapify.
- No MapTiler server key is required; MapTiler is used only for origin-restricted browser tiles.
- Do not paste keys into chat, `.env`, commits, issue text, or client source.
- Railway settings require separate approval and were not modified.

## PASS/FAIL classification

| Feature | Classification | Result |
| --- | --- | --- |
| MapTiler Streets v4 configured | Implemented but only mock-tested | **PASS** locally: URL selection test passes; live tiles blocked |
| Ghana Geoapify geocoding adapter | Implemented but only mock-tested | **PASS** parsing/country filter tests; live search blocked |
| Reverse geocoding | Implemented but only mock-tested | **PASS** implementation; live result blocked |
| `RIDE` → Geoapify `motorcycle` | Implemented but only mock-tested | **PASS** service/profile regression |
| `TAXI` → Geoapify `drive` | Implemented but only mock-tested | **PASS** service/profile regression |
| Road geometry/distance/ETA handling | Implemented but only mock-tested | **PASS** provider response validation |
| Provider failure behavior | Implemented and live-tested | **PASS**: missing keys return 503, with no fabricated map/route |
| Map API authentication | Implemented and live-tested | **PASS**: unauthenticated map config returns 401 |
| Service-first booking flow | Implemented and live-tested locally | **PASS** |
| No service toggle | Implemented and tested | **PASS** |
| No “GHANA ROAD MAP” heading | Implemented and tested | **PASS** |
| Debounced/cancelled Ghana search | Implemented but only mock-tested | **PASS** code/build/tests; provider requests blocked |
| Pin placement and dragging | Implemented but only mock-tested | **PASS** code/build tests; graphical browser blocked |
| Route invalidation after pin movement | Implemented but only mock-tested | **PASS** stale route cleared; user explicitly requests recalculation |
| GPS permission/manual fallback | Implemented but only mock-tested | Graphical permission flow not verified |
| Mobile touch gestures | Implemented but not live-tested | MapLibre/cooperative gestures configured; physical browser verification blocked |
| Correct attribution | Implemented but not live-tested | MapTiler/OSM attribution configured |
| Live Accra testing | Blocked by credentials | Search, tiles, and routes **UNVERIFIED** |
| Live Tema testing | Blocked by credentials | Search, tiles, and routes **UNVERIFIED** |
| Live Kumasi testing | Blocked by credentials | Search, tiles, and routes **UNVERIFIED** |
| Live Tamale testing | Blocked by credentials | Search, tiles, and routes **UNVERIFIED** |
| Live Takoradi testing | Blocked by credentials | Search, tiles, and routes **UNVERIFIED** |
| Live Cape Coast testing | Blocked by credentials | Search, tiles, and routes **UNVERIFIED** |
| Real dispatch/payment | Not implemented | Intentionally out of scope |

## Local endpoint evidence

With an isolated local demo customer session and no provider credentials:

- `/api/maps/config`: HTTP 200; style unavailable and all provider capability flags false.
- `/api/maps/geocode`: HTTP 503.
- `/api/maps/route/RIDE`: HTTP 503.
- `/api/maps/route/TAXI`: HTTP 503.
- `/api/maps/config` without a session: HTTP 401.

This verifies useful failure states without exposing a key or manufacturing a map/route.

## Profile and key consumption

- `ROVA_MAPTILER_PUBLIC_KEY` is consumed by `MapTilerStyleProvider` to construct `https://api.maptiler.com/maps/streets-v4/style.json`.
- `ROVA_GEOAPIFY_API_KEY` is used only by the server-side Geoapify geocoding and routing providers.
- `/api/maps/route/RIDE` validates the service server-side and selects `motorcycle`.
- `/api/maps/route/TAXI` validates the service server-side and selects `drive`.
- The browser cannot replace the route profile with a submitted value.
- 400 ms search debouncing and AbortController cancellation limit duplicate geocoding work.
- Geocoding is rate-limited to 30 requests per 10 minutes; reverse geocoding to 40; routing to 12.

## Ghana test matrix

The following locations are valid in the local Ghana boundary and model tests:

- Accra
- Tema
- Kumasi
- Tamale
- Takoradi
- Cape Coast

That establishes coordinate validation only. It does **not** prove MapTiler search completeness, tile coverage, Geoapify road availability, route legality, or ETA quality. Those require approved live credentials and are blocked.

Suggested first live cases after configuration:

1. Accra: Kotoka International Airport to Accra Mall.
2. Tema: Tema Port to Community 1 Market.
3. Kumasi: Kejetia Market to KNUST.
4. Taxi profile from Accra to Tema (`drive`).
5. Motorcycle profile within Accra (`motorcycle`).
6. A corrected Accra pickup pin at a nearby entrance, followed by route recalculation.
7. A deliberately impossible/unsupported pair to confirm provider-unavailable/no-route messaging.

## Usage and cost estimate

The application cannot quote an approved bill until account plans and restrictions are confirmed.

Small-pilot planning assumption:

- 100 active planning users/day.
- 1.5 route plans/user/day.
- 2 geocoding suggestions/user/day.
- 20 map days/month.

Estimated monthly calls:

- 4,000 search requests.
- 3,000 route requests.
- 2,000 initial map sessions.
- Additional tile requests depend on zoom, pan, session duration, caching, and MapTiler metering.

MapTiler publicly advertised Flex pricing reviewed for MAP-001 starts at USD $30/month, while free use is non-commercial/test-oriented. Geoapify advertises a 3,000-credit/day test allowance; commercial plan, motorcycle credit cost, overage, and quota must be approved. These figures are planning estimates, not a purchase authorization or guaranteed bill.

## Automated validation

| Gate | Result |
| --- | --- |
| `npm ci` | **PASS** |
| `npm audit` | **PASS**, 0 vulnerabilities |
| `npm audit --omit=dev` | **PASS**, 0 vulnerabilities |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS**, 130 tests in 23 files |
| `npx prisma generate` | **PASS** |
| `npx prisma validate` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** |

## Security and scope

- The browser-visible MapTiler key is separated from the server-only Geoapify key.
- No credential appears in source, reports, or test assertions beyond non-secret test fixture strings.
- Provider responses contain no user account privilege data.
- No live driver locations are accepted or exposed.
- No payments, dispatch, authentication, applicant records, Prisma schema, or migrations were modified.
- The saved stash remains untouched.

## Remaining blockers

1. Make the two approved variables available to Codespaces securely, with provider restrictions.
2. Restart/rebuild the Codespaces server.
3. Run live provider API checks for Accra, Tema, and Kumasi, then the remaining Ghana cities.
4. Inspect actual road-following geometry and provider distance/ETA.
5. Load the map in a graphical desktop and mobile browser and verify pan, zoom, touch, controls, pin drag, permission prompts, and mobile layout.
6. Confirm MapTiler/Geoapify commercial plans, quota, attribution, and allowed origins.
7. Review the complete uncommitted diff.

## Deployment readiness

**FAIL — not ready for deployment.**

Implementation validation passes, but live-provider behavior is blocked by missing credentials. Railway must not be modified and the branch must not be pushed until live Accra/Tema/Kumasi tests, mobile testing, provider licensing, and configuration review pass.
