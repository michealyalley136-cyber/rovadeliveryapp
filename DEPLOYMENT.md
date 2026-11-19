# Deployment

The app is structured for Next.js hosting with an independently managed PostgreSQL database. The deployed public experience is currently a pre-launch recruitment website, not a ride-booking or delivery-dispatch service.

1. Provision PostgreSQL and apply checked-in Prisma migrations with `npx prisma migrate deploy`.
2. Set `DATABASE_URL`, the public canonical `NEXT_PUBLIC_SITE_URL`, and a unique, randomly generated `AUTH_SECRET` in the hosting secret manager.
3. Provision the first administrator through `npm run admin:create`; restrict access to `/admin` and use individual accounts.
4. Configure TLS, secure cookies, database backups, least-privilege credentials, monitoring, and incident response.
5. Replace the process-local application rate limiter with a trusted edge or shared-store limiter. Do not trust caller-supplied forwarding headers.
6. Configure a privacy notice and retention/deletion procedure before collecting real applicants.
7. Run lint, typecheck, tests, Prisma validation, and production build in CI.

Applicant uploads and SMS/email notifications are not implemented. Live rides, dispatch, payments, and food ordering remain disabled. No live deployment, financing offer, employment guarantee, or regulatory approval is implied by this repository.
