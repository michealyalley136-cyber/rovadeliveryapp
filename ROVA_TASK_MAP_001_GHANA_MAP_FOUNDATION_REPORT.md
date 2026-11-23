# ROVA Task MAP-001 and CUSTOMER-BOOKING-002 Report

Date: 2026-11-22

## Status

Implementation and local validation complete. The work remains uncommitted and was not pushed or deployed. No production, Railway secret, Prisma schema, migration, application, or applicant-data changes were made.

## Implemented

- A provider-independent map foundation using the existing MapLibre GL JS 6.19 installation.
- A shared Ghana map renderer for future customer, operator, dispatch, merchant, delivery, and fleet use.
- Typed interfaces for styles, geocoding, reverse geocoding, road routing, service zones, vehicle locations, and coordinates.
- Ghana map bounds, an approximate Ghana validation boundary, and representative coordinate checks.
- Country-prioritized Ghana place search and reverse geocoding.
- Browser GPS with explicit permission-denied/manual-map fallbacks.
- Draggable, correctable pickup and destination markers using GeoJSON longitude/latitude order.
- Actual provider route geometry, distance, and duration handling.
- Explicit route-unavailable and provider-unavailable states; no synthetic road or fake ETA fallback.
- Rate limiting, server-side provider requests, finite coordinate validation, Ghana boundary checks, abort/timeout handling, and no-store responses.
- Shared future vehicle-marker support, while leaving real GPS tracking disabled.
- The dashboard retains service cards and does not show the full journey planner.
- Motorcycle selection opens `/customer/motorcycle`.
- Taxi selection opens `/customer/cab`.
- The selected route fixes `RIDE`/`TAXI` from the trusted server page.
- The browser no longer submits a routing profile. `/api/maps/route/[service]` validates the service path and derives `MOTORCYCLE` or `DRIVING` on the server.
- The planner has no Motorcycle/Taxi toggle and no “GHANA ROAD MAP” heading.
- “Back to Services” returns to the customer dashboard.
- Pickup and destination changes do not alter the selected service.
- The existing clearly labelled simulation ride system remains intact and separate.

## Existing map limitations found

- The customer dashboard previously used no real map in its booking entry flow.
- Booking was browser-only and stored pickup/destination text in session storage.
- The simulation map drew synthetic grid roads, fixed coordinates, scripted vehicle locations, a straight scripted journey path, and simulated ETA/progress.
- The simulation is not suitable as a production geographic map. It remains explicitly labelled as synthetic/demo-only.
- Existing dispatch search used validated coordinates but accepted externally supplied road distance/ETA values; it did not provide a routing provider.
- Saved demo places and old simulation journeys are browser-only and are not account records.

## Selected providers

### Map tiles: MapTiler

MapTiler is selected for licensed commercial street tiles:

- Global commercial map styles and weekly OpenStreetMap-derived updates.
- Required visible attribution is included: © MapTiler © OpenStreetMap contributors.
- The browser style key must be restricted to approved origins.
- Current public pricing reviewed on 2026-11-22:
  - Free: testing/prototyping/non-commercial use.
  - Flex: USD $30/month before usage overages; a commercial production plan is required.

References:

- https://www.maptiler.com/cloud/pricing/
- https://www.maptiler.com/copyright/
- https://docs.maptiler.com/server/api/geocoding/

### Geocoding and road routing: Geoapify

Geoapify is selected for server-mediated geocoding, address autocomplete, reverse geocoding, and road routing:

- Ghana country-filtered address search and autocomplete.
- Reverse geocoding after explicit GPS or map-pin selection.
- Documented `drive` profile.
- Documented `motorcycle` profile; bicycle routing is not substituted.
- Provider-reported road route geometry, distance, and duration.
- Current documentation advertises a free test allowance of 3,000 credits/day; production commercial approval, quota, terms, and pricing must be reviewed before launch.

References:

- https://apidocs.geoapify.com/docs/routing/
- https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
- https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/

No unrestricted public OpenStreetMap tile server is used.

## Provider credentials and current blocker

Required names:

```text
ROVA_MAPTILER_PUBLIC_KEY
ROVA_GEOAPIFY_API_KEY
```

Both keys are expected to be configured for live provider validation. If they are absent:

- the UI correctly displays “Ghana map unavailable”;
- geocoding, reverse geocoding, and route requests explicitly fail when no credentials are configured;
- no synthetic map or fabricated route/ETA is shown.

The MapTiler browser key will be visible in tile/style requests and must be restricted to approved origins. The Geoapify key must remain server-only. No MapTiler server key is required.

## Customer booking flow

1. `/customer` shows the existing ROVA service cards only.
2. Selecting Motorcycle navigates to `/customer/motorcycle`.
3. Selecting Taxi navigates to `/customer/cab`.
4. The server page fixes the service and passes it to the reusable planner.
5. Pickup/destination search, GPS, or map selection cannot change the service.
6. The backend route endpoint derives the provider profile from the route service parameter.
7. The customer reviews provider road geometry, distance, and ETA.
8. No driver is dispatched, no live location is exposed, and no payment is collected.

## Files created

- `src/app/api/maps/config/route.ts`
- `src/app/api/maps/geocode/route.ts`
- `src/app/api/maps/reverse/route.ts`
- `src/app/api/maps/route/[service]/route.ts`
- `src/components/customer-map-planner.tsx`
- `src/components/rova-map.tsx`
- `src/lib/maps/ghana.ts`
- `src/lib/maps/types.ts`
- `src/server/maps/auth.ts`
- `src/server/maps/config.ts`
- `src/server/maps/errors.ts`
- `src/server/maps/geoapify.ts`
- `src/server/maps/http.ts`
- `src/server/maps/maptiler.ts`
- `src/server/__tests__/customer-booking-flow.test.tsx`
- `src/server/__tests__/maps-ghana.test.ts`
- `src/server/__tests__/maps-providers.test.ts`
- `src/server/__tests__/maps-route-service.test.ts`

## Files modified

- `src/components/customer-booking.tsx`
- `src/app/customer/customer-dashboard.css`
- `.env.example`
- `.env.staging.example`
- `ENVIRONMENT.md`

The dashboard service-first adjustment removed the planner from `src/components/customer-dashboard.tsx`; the final file matches its original pre-map version, so it has no task diff.

An unrelated pre-existing uncommitted change to `ROVA_MASTER_LOGIN_PREVIEW_RAILWAY_SYNC_REPORT.md` was preserved and was not included in this mapping work.

## Validation

| Gate | Result |
| --- | --- |
| `npm ci` | PASS; 0 dependency vulnerabilities at install |
| `npm audit` | PASS; 0 vulnerabilities |
| `npm audit --omit=dev` | PASS; 0 vulnerabilities |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 23 files and 129 tests |
| `npx prisma generate` | PASS |
| `npx prisma validate` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Focused results:

- Dashboard does not render the planner: PASS.
- Motorcycle service opens and fixes `RIDE` + `MOTORCYCLE`: PASS.
- Taxi service opens and fixes `TAXI` + `DRIVING`: PASS.
- Service toggle absent: PASS.
- “GHANA ROAD MAP” absent: PASS.
- Back to Services present: PASS.
- Unsupported route service rejected server-side: PASS.
- Invalid provider route data rejected without fabrication: PASS.
- Accra, Tema, Kumasi, Tamale, Takoradi, and Cape Coast coordinate coverage: PASS.
- Maplibre compile/build integration: PASS.
- Live Maps/places/routing calls: **UNVERIFIED** until provider approval and credentials exist.
- Live tile/GPS/mobile gesture integration: **UNVERIFIED** due to missing provider credentials and no graphical browser.
- Graphical desktop/mobile layout inspection: **UNVERIFIED**; responsive CSS and server-rendered route checks passed.

Local authenticated route checks returned 200 for `/customer`, `/customer/motorcycle`, and `/customer/cab`. The dashboard output had no planner; motorcycle and taxi output carried the correct fixed service/profile markers and no service toggle.

## Security and privacy

- The Geoapify server key is never sent to the browser.
- The public MapTiler key is explicitly expected to be origin-restricted.
- Mapping routes require a customer demo/real session today; they return 401 otherwise.
- No live driver locations are exposed.
- GPS remains client-side except for a provider reverse-geocoding request after explicit user action.
- Location data is not persisted by the new planner.
- The route API stores no location and issues no auth session.
- Provider errors do not fall back to a route or ETA.
- JWT, administrator, and application-recognition code was not modified.
- No Prisma schema or migration changes were made.

## Remaining limitations

- Commercial provider accounts, key restrictions, quotas, contracts, and production approval are required.
- Live Ghana provider coverage and route quality need integration testing after credentials are approved.
- Motorcycle route legality/quality must be accepted by operations and validated with actual Ghana provider responses before live customer ETAs or navigation.
- No driver dispatch, booking persistence, traffic-aware guarantee, turn-by-turn navigation, fare engine, payment, or live GPS sharing is implemented.
- No authenticated real-account GPS tracking is implemented.
- Operational service zones beyond the Ghana mapping boundary require separately approved business/geofence definitions.

## Railway staging readiness

**Not ready for deployment review yet.**

Blockers:

1. Review and approve MapTiler and Geoapify commercial terms, quotas, expected monthly costs, and Ghana coverage.
2. Provision separate restricted staging and production credentials through the secret manager.
3. Run live geocoding, reverse-geocoding, map-tile, and routing tests.
4. Perform graphical mobile/desktop gesture and layout verification.
5. Review this report and the exact diff.
6. Re-run validation after credentials are configured.

Do not push to the auto-deploying Railway staging branch until those reviews pass. No deployment was performed.

## Next milestone

Add an approved booking backend and durable journey-plan state, then connect provider routes to fare estimation without charging. Before dispatch, add authenticated accounts, approved operational zones, verified driver authorization, consent-aware GPS controls, and server-side trip authorization. Live driver navigation should reuse `RovaMap`, `MapVehicleUpdate`, and `VehicleLocationProvider` rather than creating another map engine.
