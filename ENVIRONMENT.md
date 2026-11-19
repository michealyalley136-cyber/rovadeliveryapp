# Environment

Copy `.env.example` to `.env.local` for local work.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the Prisma application/admin repositories |
| `AUTH_SECRET` | Random session-signing key (minimum 32 characters) |
| `APPLICATIONS_ENABLED` | Global application intake switch (defaults to enabled) |
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

Set deployment-specific variables in the hosting provider's secret manager. Do not commit credentials or applicant information. Admin provisioning reads `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, and optional `ADMIN_ROLE` from the process environment; keep the password out of shell history and logs. See the [README](./README.md) for the setup steps.
