# ROVA Ghana — TASK 01B-006A: JWT Environment Fix

**Status:** Validated in a clean checkout of `feature/customer-dashboard`; pushed change remains for review. Not deployed; live environment behavior is unverified.

## Root-cause investigation

`src/server/auth.ts` signed demo and administrator JWTs with the same `AUTH_SECRET` and verified tokens using signature validation alone. Issued JWTs had no environment-specific issuer or audience. The demo and administrator cookies have distinct names, but a copied token placed in the corresponding cookie was not bound to its issuing environment or authentication purpose. Non-production processes also shared a literal fallback signing key when `AUTH_SECRET` was absent or too short.

Consequently, rotating `AUTH_SECRET` alone did not guarantee isolation: any environments still using the same key could accept each other's tokens, and the code had no claim-based environment boundary. The local regression tests reproduce the acceptance risk with a deliberately identical test signing secret and now demonstrate rejection based on issuer/audience.

**Not independently verified:** I had no access to Railway configuration or the historical test transcript. I cannot confirm whether staging and production actually shared `AUTH_SECRET`, whether a reported rotation reached both environments, or whether the earlier test methodology was flawed. No secret values or live credentials were inspected or logged.

## Files changed

- `src/server/auth.ts`
- `src/server/__tests__/auth.test.ts`
- `src/server/__tests__/slideshow.test.ts`
- `vitest.config.mjs` — maps the existing `@/` source alias for Vitest.
- `.env.example`
- `ENVIRONMENT.md`
- `DEPLOYMENT.md`
- `ROVA_TASK_01B_006A_JWT_ENVIRONMENT_FIX.md` (this report)

No route handlers, Prisma schema, migrations, `AUTH_SECRET` values, or deployment settings were changed.

## Repository and lockfile reconciliation

The supplied source archive is **not a Git repository**: it has no `.git` directory, and the adjacent ZIP omitted Git metadata and `package-lock.json`. The remote `feature/customer-dashboard` branch was checked out separately at commit `6f85ead3f24e0760e3d7e179b7d66e9b7fb3cf79`; the validated changes were applied there while preserving tracked branch files and all existing commits.

The branch's tracked `package-lock.json` (blob `97709fb5601512fdf48f89de4286c096b2315669`) and `package.json` were kept unchanged. The archive had omitted that lockfile, the MapLibre worker lifecycle scripts, and some existing deployment/environment documentation; the clean branch checkout preserved those files and included:

- `maplibre-gl: ^6.19.0`
- Scoped override `@prisma/config@7.10.1` → `effect: 3.22.1`

The exact branch lockfile was used for `npm ci`; no lockfile was regenerated and no `npm audit fix` was run.

## Authentication changes

- Added the server-only `ROVA_AUTH_ENVIRONMENT` setting. Runtime modes other than `development` and `test` must explicitly set it to `staging` or `production`; absent, `local`, or invalid deployed values fail closed.
- The issuer is now the validated fixed identity `urn:rova:auth:<environment>`, so correctly configured staging and production issuers differ without depending on a build-time `NEXT_PUBLIC_*` value or request data.
- Demo and administrator JWTs now include explicit issuer, environment-and-purpose-specific audience, and required `kind` claims (`demo` or `admin`).
- Every verification explicitly restricts algorithms to `HS256` and requires the expected issuer, audience, `iat`, `exp`, `sub`, and `kind`. Expiration remains enforced by jose.
- Demo verification requires `kind=demo`; administrator verification requires `kind=admin` and an existing administrator role. Existing role checks are preserved.
- `AUTH_SECRET` handling and cookie names/settings were not changed.

## Validation results

| Check | Result |
|---|---|
| `npm ci` | **Passed** in the branch checkout using the tracked lockfile; 540 packages installed, automatic audit reported 0 vulnerabilities. |
| `npm audit --json` | **Passed: 0 info, 0 low, 0 moderate, 0 high, 0 critical.** No vulnerable dependency paths remain in this lockfile. |
| `npm audit --omit=dev --json` | **Passed: 0 findings** across production dependencies. |
| `npm ls maplibre-gl effect prisma @prisma/config` | **Passed:** MapLibre 6.19.0; Prisma and `@prisma/config` 7.10.1; Effect 3.22.1 overridden under `@prisma/config@7.10.1`. |
| Focused JWT and slideshow tests | **Passed: 24/24** (22 auth, 2 slideshow). Cross-environment, issuer, audience, required-claim, expired-token, and signature cases cover both demo and admin JWTs. |
| Full automated test suite | **Passed: 97/97 tests across 16 files.** |
| TypeScript typecheck | **Passed** |
| ESLint | **Passed** |
| Prisma generate | **Passed** |
| Prisma validate | **Passed** |
| Production build | **Passed**; dashboard, driver, admin, session, slideshow, and public recruitment routes compiled. |
| Local production-route smoke test | Customer and driver pages **200**; customer and driver demo sign-in **200**; dashboards with their demo JWTs **200**; admin session with a demo JWT **401**; invalid public application submission and status lookup **400**. No applicant records or admin credentials were used. |
| `git diff --check` | **Passed** in the clean target-branch checkout. |

The slideshow test now validates the ten configured campaign slide IDs and image files, uniqueness, PNG metadata/dimensions, enabled slides, and navigation; it no longer assumes every image in a directory is a carousel slide. The supplied archive had 30 files under `src/images`; the branch checkout contains the ten configured campaign images. The 20 archive-only assets were not copied, modified, or deleted. Source references identify the campaign images and the social image import.

## Compatibility, session impact, and deployment safety

The customer dashboard, driver demo, administrator boundary, public recruitment endpoints, and ten-slide campaign configuration passed local build/test/smoke checks. Prisma schema and migrations remain unchanged. The dependency remediation in the tracked lockfile is validated locally; this does not verify deployment configuration or live service behavior.

JWTs issued before this change lack the new issuer, audience, and session-kind claims. Once the new version is deployed, those sessions will be rejected and users must sign in again. This is an expected session invalidation; no durable logout/revocation mechanism was added.

**Staging-first plan (not executed):**

1. Review the change on `feature/customer-dashboard`; do not merge PR #10 or deploy as part of this task.
2. In staging only, set `ROVA_AUTH_ENVIRONMENT=staging`. Keep the existing `AUTH_SECRET` unchanged.
3. Deploy without database migrations. Use isolated demo/synthetic test accounts and verify staging-issued tokens work only in staging, including wrong-issuer, wrong-audience, demo/admin separation, and role-boundary checks. Do not log or retain JWTs.
4. Before production promotion, independently set `ROVA_AUTH_ENVIRONMENT=production` and confirm both cross-environment rejection directions using controlled test fixtures, without changing either environment's `AUTH_SECRET`.
5. Promote only after review and successful staging checks. If rollback is needed, roll back the application artifact without changing secrets or schema; the prior verifier ignores the new claims and remains compatible with tokens signed by the unchanged key.

## Remaining security findings and verification status

- **Finding #1 — cross-environment JWT acceptance:** **Fixed in local tests** (including tests where both environments share the same test signing secret). The **live vulnerability is not claimed resolved** until staging and production independently confirm cross-environment rejection.
- The actual Railway environment labels and signing-key configuration were not inspected.
- The target branch lockfile now audits cleanly: full and production-only audits report zero vulnerabilities. The earlier three-high manifest-only result came from installing without that lockfile and is superseded by the successful lockfile-based install and audits.
- The source archive itself still has no Git branch/worktree metadata; the pushed change was validated and whitespace-checked in the clean branch checkout.
- Durable logout revocation and unrelated authentication findings were not addressed, per scope.
