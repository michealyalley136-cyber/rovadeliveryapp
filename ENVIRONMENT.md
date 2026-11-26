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
| `ROVA_PUBLIC_URL` | Public HTTPS base URL used in secure customer activation/reset links; must use HTTPS in staging/production |
| `CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL` | Server-only provider endpoint for email/SMS identity verification; HTTPS and public network resolution required in staging/production, with the validated address pinned for the outbound connection |
| `CUSTOMER_IDENTITY_DELIVERY_SECRET` | Provider bearer secret (minimum 32 characters); never log or expose it |
| `IDENTITY_NOTIFICATION_WORKER_URL` | Internal base URL used by the scheduled identity notification processor |
| `IDENTITY_NOTIFICATION_WORKER_SECRET` | Server-only worker authorization secret (minimum 32 characters) |
| `IDENTITY_NOTIFICATION_ENCRYPTION_KEY_ID` | Active outbox payload key identifier used for rotation |
| `IDENTITY_NOTIFICATION_ENCRYPTION_KEY` | 32-byte base64url AES-GCM key for temporary notification payloads |
| `ROVA_DEMO_MODE` | Legacy isolated demo setting; never use for real customer accounts |
| `ROVA_MAPTILER_PUBLIC_KEY` | Browser-restricted MapTiler key for the `streets-v4` Ghana basemap; restrict to approved Codespaces/staging origins |
| `ROVA_GEOAPIFY_API_KEY` | Server-only Geoapify key for Ghana geocoding, autocomplete, reverse geocoding, and driving/motorcycle road routing |

Set deployment-specific variables in the hosting provider's secret manager. Do not commit credentials or applicant information. Admin provisioning reads `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, and optional `ADMIN_ROLE` from the process environment; keep the password out of shell history and logs. See the [README](./README.md) for the setup steps.

Application submission requires `AUTH_SECRET` and a valid `ROVA_AUTH_ENVIRONMENT` in deployed environments. The server validates recognition signing configuration before saving an application; an invalid configuration makes submission temporarily unavailable rather than saving without a recognition marker. Local development also needs a securely supplied `AUTH_SECRET` of at least 32 characters to submit applications. Do not use production secrets locally.

Deploy the additive Prisma migration with `npx prisma migrate deploy` before enabling a version that accepts customer registrations. It does not activate customer ride services.

Map configuration is optional until approved commercial provider credentials are available. Missing credentials must render an explicit unavailable state and reject geocoding/routing requests; the application must not substitute synthetic roads or fabricated estimates. The MapTiler browser key is visible by design and must be restricted to approved website origins. Only that public key is sent to the browser. The Geoapify key remains server-only for geocoding and routing; it must not be logged or returned in API responses. No MapTiler server key is required.

Set `ROVA_AUTH_ENVIRONMENT=staging` in staging and `ROVA_AUTH_ENVIRONMENT=production` in production. The issuer is a server-side environment identity (`urn:rova:auth:staging` or `urn:rova:auth:production`); deployed authentication fails closed if the setting is absent or invalid. `NEXT_PUBLIC_SITE_URL` remains the canonical public-site URL and is not used to determine JWT trust.

Customer identity delivery fails closed. Production runtimes must use `ROVA_AUTH_ENVIRONMENT=staging` or `production`; `local` is permitted only in development/test. Deployed webhooks require HTTPS and public network addresses. Local HTTP and local private-address exceptions require an explicit `ROVA_AUTH_ENVIRONMENT=local` and are limited to `localhost` or literal loopback addresses whose DNS answers are all loopback; other private destinations remain forbidden. The outbound request uses a fresh direct connection pinned to a validated DNS address, preserving hostname-based TLS certificate verification and SNI. It does not use environment-configured HTTP proxies or follow redirects. Activation and password-reset bearer links are sent only to the configured provider; raw tokens, webhook credentials and provider request bodies must not be logged.

Customer logout revokes the exact durable session in PostgreSQL before clearing its cookie. If revocation fails, the API returns an error and retains the cookie so the user can retry; repeated revocation is safe. Revocation still requires database availability, and logout must not be reported as confirmed while the database is unavailable.

The backup restore command currently supports only an explicitly confirmed empty local PostgreSQL database. Set `RESTORE_TARGET_MODE=isolated`, use a literal loopback `RESTORE_TARGET_DATABASE_URL` with a database named `rova_restore_*`, and set `RESTORE_ISOLATED_CONFIRM=I_UNDERSTAND_THIS_IS_AN_EMPTY_LOCAL_DATABASE`. The tool verifies the connected database, user, server address and absence of user objects before downloading and again before restoring; it does not use destructive `pg_restore --clean`. Remote, staging and production destinations are refused. There is no live-restore override; any future live recovery requires a separate approved and protected workflow.

Identity notification payloads use AES-256-GCM. Keep `IDENTITY_NOTIFICATION_ENCRYPTION_KEY_<KEY_ID>` configured for every key ID that can still be referenced by an unexpired `IdentityNotificationOutbox` row; `IDENTITY_NOTIFICATION_ENCRYPTION_KEY` is retained as a `v1` fallback. Rotate by creating a new 32-byte base64url key, setting the new ID as active, and retaining old key variables until all old rows are delivered, expired and purged. Never rotate or delete old keys while PENDING/PROCESSING/FAILED rows reference them. The scheduled worker command calls the protected internal processor with `npm run identity:notifications`; deployment scheduling must be separately approved and monitored.
