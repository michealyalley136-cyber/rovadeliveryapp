# ROVA Ghana

ROVA is building a Ghana-focused mobility and earning ecosystem connecting passenger transport, food and local delivery, vehicle access, and partner opportunities. This repository currently serves the **pre-launch recruitment website**: visitors can learn about the planned network and apply to join it. It does not book rides, accept food orders, or dispatch drivers.

The public campaign slideshow uses the original artwork under `src/images/`. The assets are statically imported and are not copied into `public/`.

The approved app artwork and browser icons are served from `public/icons/` and described by `public/manifest.webmanifest`. Use Install ROVA or the browser's install menu; on iOS, use Safari's Share menu and choose Add to Home Screen. Installation availability varies by browser, and installation does not provide offline support.

## Run locally

Requirements: Node.js 20.9+, npm, and PostgreSQL.

```sh
npm install
cp .env.example .env.local
# Set DATABASE_URL and AUTH_SECRET in .env.local
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Application submission and status lookup require the configured PostgreSQL database; the site returns an error rather than showing a false success if storage is unavailable. Application drafts are saved in the applicant's browser until submission.

Set `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (at least 14 characters), and optionally `ADMIN_ROLE` in the ignored `.env.local`, then create the first admin account:

```sh
npm run admin:create
```

The admin portal is at `/admin`. Public registration is disabled. Supported roles are `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `RECRUITMENT_AGENT`, and `VIEW_ONLY`.

## Main capabilities

- Mobile-first pre-launch site and campaign slideshow
- Separate application flows for riders, drivers, merchants, fleet/dealer applicants, and strategic partners
- Ghana phone validation, server-side request validation, database-backed submission and status lookup
- Protected recruitment portal with filters, CSV export, status history, internal notes, and audit records
- Retained mobility domain models and demo portals for future development; these are not the public product flow

The `/customer` dashboard is a demo workspace using the existing demo session, not a customer credential system. Motorcycle and cab requests create simulated rides; other services, live tracking and payments are unavailable. Saved destinations are stored only in the current browser and should not be treated as a customer account. The heritage banner rotates supplied AI-generated artistic interpretations in fixed UTC time windows; it is not documentary imagery. Super administrators and operations administrators can adjust the interval and enabled images in the recruitment portal. Apply the heritage database migration before using the feature; visible dashboards check for changes roughly once per minute and on return to the tab. If settings storage is unavailable, errors are logged and the banner uses its gradient fallback.

## Commands

```sh
npm run dev
npm run lint
npm run typecheck
npm test
npx prisma validate
npm run build
```

## Important production boundaries

- Apply database migrations before enabling applications.
- The current application rate limiter is process-local and is not sufficient for a multi-instance deployment. Replace it with a trusted edge or shared-store limiter before launch; trust only proxy headers set by the hosting platform.
- Configure a managed PostgreSQL database, backups, TLS, secure cookies, a strong `AUTH_SECRET`, error monitoring, and least-privilege access.
- Applicant document upload, SMS/email notifications, live ride dispatch, maps/GPS, payments, customer ride booking, and food ordering are not enabled in this pre-launch release.
- Do not describe pre-qualification as guaranteed work, financing, a vehicle, or regulatory approval.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [ENVIRONMENT.md](./ENVIRONMENT.md), and [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md).
