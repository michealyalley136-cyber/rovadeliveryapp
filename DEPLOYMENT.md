# Deployment

The app is structured for Next.js hosting with an independently managed PostgreSQL database. The deployed public experience is currently a pre-launch recruitment website, not a ride-booking or delivery-dispatch service.

1. Provision PostgreSQL and apply checked-in Prisma migrations with `npx prisma migrate deploy`.
2. Set `DATABASE_URL`, the public canonical `NEXT_PUBLIC_SITE_URL`, and a unique, randomly generated `AUTH_SECRET` in the hosting secret manager.
3. Provision the first administrator through `npm run admin:create`; restrict access to `/admin` and use individual accounts.
4. Configure TLS, secure cookies, database backups, least-privilege credentials, monitoring, and incident response.
5. Replace the process-local application rate limiter with a trusted edge or shared-store limiter. Do not trust caller-supplied forwarding headers.
6. Configure a privacy notice and retention/deletion procedure before collecting real applicants.
7. Run lint, typecheck, tests, Prisma validation, and production build in CI.

## Isolated Railway staging

1. In the correct Railway project, create a **staging** environment. Add a separate PostgreSQL service and volume in staging; do not reference, clone credentials for, or connect to the production database. Confirm staging data and its credentials are isolated before running commands.
2. Connect the staging application service to the feature branch in its Railway service settings, and confirm the production service still deploys its intended branch. Avoid copying production secrets or real customer data into staging.
3. Configure staging variables in Railway's staging environment: set `DATABASE_URL` to the staging PostgreSQL service's `DATABASE_URL` reference, set a unique `AUTH_SECRET` of at least 32 characters, and set `NEXT_PUBLIC_SITE_URL` to the staging domain. Use the other variable names and safe defaults in [`.env.staging.example`](./.env.staging.example). Keep demo mode disabled except in an isolated test environment; never use real customer data for a demo.
4. Verify the database target and backups before applying migrations. From a Railway staging service shell/job using its staging-only `DATABASE_URL`, run `npx prisma migrate deploy`, then `npx prisma migrate status`. Do not use `migrate reset`, `db push --force-reset`, or a production connection for this test. For a local shell, copy `.env.staging.example` to `.env.staging` and explicitly load only that file into the process environment before running Prisma; the Prisma config does not automatically load `.env.staging`.
5. Provision a separate staging administrator using the project's admin provisioning script, with a unique staging password supplied securely. Verify settings save, reload, restart persistence, authorization, rotation, and the dashboard on staging. Remove any temporary short interval and restore 180 minutes afterward.
6. Only after staging validation and review, arrange a backed-up production migration (`npx prisma migrate deploy`) against the confirmed production target before deploying the feature. Run it as a controlled deployment step or Railway pre-deploy job, not during the build. Confirm migration success before routing production traffic to the new version. Do not merge or deploy production while staging verification is incomplete.

Railway's [staging isolation guide](https://docs.railway.com/guides/isolate-staging-production) describes environment and branch configuration.

Applicant uploads and SMS/email notifications are not implemented. Live rides, dispatch, payments, and food ordering remain disabled. No live deployment, financing offer, employment guarantee, or regulatory approval is implied by this repository.
