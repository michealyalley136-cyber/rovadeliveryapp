# Environment

Copy `.env.example` to `.env.local` for local work.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the Prisma application/admin repositories |
| `AUTH_SECRET` | Random session-signing key (minimum 32 characters); also used to derive a separate application-recognition signing key |
| `ROVA_AUTH_ENVIRONMENT` | Server-only JWT identity: `staging` or `production` when deployed; optional locally |
| `APPLICATIONS_ENABLED` | Global application intake switch (defaults to enabled) |
| `CUSTOMER_APPLICATIONS_ENABLED` | Customer pre-launch registration intake switch |
| `RIDER_APPLICATIONS_ENABLED` | Motorcycle rider application intake switch |
| `DRIVER_APPLICATIONS_ENABLED` | Taxi driver application intake switch |
| `DELIVERY_APPLICATIONS_ENABLED` | Delivery partner application intake switch |
| `VEHICLE_ACCESS_ENABLED` | Vehicle access application intake switch |
| `MERCHANT_APPLICATIONS_ENABLED` | Merchant application intake switch |
| `FLEET_APPLICATIONS_ENABLED` | Fleet owner and dealer application intake switch |
| `PARTNER_APPLICATIONS_ENABLED` | Strategic partner application intake switch |
| `CUSTOMER_RIDES_ENABLED` | Future customer ride capability; defaults to disabled |
| `FOOD_ORDERING_ENABLED` | Future food ordering capability; defaults to disabled |
| `LIVE_DISPATCH_ENABLED` | Future live dispatch capability; defaults to disabled |
| `ROVA_DEMO_MODE` | Legacy isolated demo setting; never use for real customer accounts |
| `ROVA_MAPTILER_PUBLIC_KEY` | Browser-restricted MapTiler key for the `streets-v4` Ghana basemap; restrict to approved Codespaces/staging origins |
| `ROVA_GEOAPIFY_API_KEY` | Server-only Geoapify key for Ghana geocoding, autocomplete, reverse geocoding, and driving/motorcycle road routing |

Set deployment-specific variables in the hosting provider's secret manager. Do not commit credentials or applicant information. Admin provisioning reads `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, and optional `ADMIN_ROLE` from the process environment; keep the password out of shell history and logs. See the [README](./README.md) for the setup steps.

Application submission requires `AUTH_SECRET` and a valid `ROVA_AUTH_ENVIRONMENT` in deployed environments. The server validates recognition signing configuration before saving an application; an invalid configuration makes submission temporarily unavailable rather than saving without a recognition marker. Local development also needs a securely supplied `AUTH_SECRET` of at least 32 characters to submit applications. Do not use production secrets locally.

Deploy the additive Prisma migration with `npx prisma migrate deploy` before enabling a version that accepts customer registrations. It does not activate customer ride services.

Map configuration is optional until approved commercial provider credentials are available. Missing credentials must render an explicit unavailable state and reject geocoding/routing requests; the application must not substitute synthetic roads or fabricated estimates. The MapTiler browser key is visible by design and must be restricted to approved website origins. Only that public key is sent to the browser. The Geoapify key remains server-only for geocoding and routing; it must not be logged or returned in API responses. No MapTiler server key is required.

Set `ROVA_AUTH_ENVIRONMENT=staging` in staging and `ROVA_AUTH_ENVIRONMENT=production` in production. The issuer is a server-side environment identity (`urn:rova:auth:staging` or `urn:rova:auth:production`); deployed authentication fails closed if the setting is absent or invalid. `NEXT_PUBLIC_SITE_URL` remains the canonical public-site URL and is not used to determine JWT trust.
