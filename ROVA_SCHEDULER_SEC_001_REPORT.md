# ROVA SCHEDULER-SEC-001 — Scheduler Transport Remediation

## Recommendation: HOLD

This report records the state at completion of SCHEDULER-SEC-001, before the later DEV-SAVE-004 local checkpoint review.

The scheduler transport controls are implemented and covered by regression tests. The requested production build did not complete: after using a non-connecting local placeholder `DATABASE_URL`, Next.js was terminated with exit 143 during TypeScript checking. The termination source is unknown, so full validation is incomplete. No commit was created.

## 1. Root cause

The original [processor script](./scripts/process-identity-notifications.mjs) read `IDENTITY_NOTIFICATION_WORKER_URL` and `IDENTITY_NOTIFICATION_WORKER_SECRET`, constructed the internal worker route, and called `fetch` without URL policy or a `redirect` option. As a result:

- It accepted any URL scheme, including HTTP in production, regardless of `NODE_ENV` or `ROVA_AUTH_ENVIRONMENT`.
- Fetch's default redirect behavior followed both same-origin and cross-origin redirects. The bearer authorization header was sent with the redirected request in the same-origin case.
- Error handling hid network exceptions, but did not make transport secure; URL/configuration errors were not validated.

The worker endpoint and its bearer-secret contract were not changed.

## 2. Files changed

- Modified [scripts/process-identity-notifications.mjs](./scripts/process-identity-notifications.mjs)
- Added [scripts/identity-notification-transport.mjs](./scripts/identity-notification-transport.mjs)
- Added [scripts/identity-notification-transport.test.mjs](./scripts/identity-notification-transport.test.mjs)
- Modified [ENVIRONMENT.md](./ENVIRONMENT.md)
- Added this report: [ROVA_SCHEDULER_SEC_001_REPORT.md](./ROVA_SCHEDULER_SEC_001_REPORT.md)

No customer booking, database, migration, backup, dependency, or secret configuration was changed.

## 3. Security changes

- Production requires `ROVA_AUTH_ENVIRONMENT=staging` or `production`; `local` is rejected even when paired with production `NODE_ENV`.
- HTTPS is required unless the runtime is explicitly `development` or `test`, `ROVA_AUTH_ENVIRONMENT=local`, and the URL host is loopback (`localhost`, `::1`, or IPv4 `127/8`). Local labels cannot make production HTTP acceptable.
- Unsupported or missing runtime labels, unsafe URL schemes, embedded credentials (including empty user-info syntax), query strings, fragments, non-root base paths, and malformed URLs fail closed. HTTP to non-loopback hosts is rejected, including private-network hosts.
- The bearer remains in the Authorization header and is never placed in the URL. Configuration, network, redirect and response errors are generic and do not include the URL or secret. Only a numeric HTTP status is included for non-success responses.
- Requests use `redirect: "error"`. Every invocation validates the environment and URL before calling fetch; there is no internal retry loop. A repeated scheduler invocation re-applies the same validation and redirect policy.
- HTTPS relies on Node fetch's normal certificate and hostname verification. TLS verification is not disabled.
- The worker remains called with `POST /api/internal/identity-notifications/process` and the existing bearer header. A successful response emits only the processed count.

If Railway's intended private-network hostname only supports HTTP, do not add an exception. Use a private HTTPS endpoint with a certificate trusted by the scheduler runtime, or a private TLS-terminating gateway/reverse proxy whose certificate chain is trusted and whose hostname verification/SNI remain enabled. An authenticated TLS design such as mTLS is another option if supported by both sides. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` or send the bearer over HTTP.

## 4. Regression test results

New tests in [identity-notification-transport.test.mjs](./scripts/identity-notification-transport.test.mjs) cover:

- Production HTTP rejection, including `NODE_ENV=production` mislabeled `ROVA_AUTH_ENVIRONMENT=local`, and verification that fetch is never called.
- HTTP authorization only for explicitly labeled development/test loopback; missing authorization and non-loopback targets fail.
- Malformed URLs, unsupported protocols, embedded credentials, query strings and non-root base paths.
- Safe HTTPS request URL, POST method, correct bearer header and redirect-error mode.
- Real disposable loopback HTTP same-origin and cross-origin redirect attempts. The source receives the request, but the redirected path/server is not contacted and no bearer is forwarded.
- A failed attempt followed by a fresh invocation, confirming validation and redirect-error options apply on each invocation and network errors do not expose the synthetic secret.

Results: **11 focused tests passed, 0 failed, 0 skipped**. The tests use synthetic credentials and local servers/mocks only; no Railway endpoint was contacted.

## 5. Full validation

| Check | Result |
|---|---|
| Focused scheduler tests | **PASS** — 1 file, 11 passed |
| `npm run lint` | **PASS** — first concurrent attempt received exit 143; isolated rerun passed |
| `npm run typecheck` | **PASS** — exit 0 |
| `npm test` | **PASS** — 32 files passed, 2 skipped; 243 tests passed, 0 failed, 23 skipped |
| `npm run build` | **HOLD / NOT PASSED** — first invocation stopped before build because `DATABASE_URL` was unset. A second isolated invocation with `postgresql://localhost:5432/rova_build_no_connect` generated Prisma Client, compiled successfully, then was terminated with exit 143 during Next.js TypeScript checking. No database connection was made. |
| `npm audit` | **PASS** — 0 vulnerabilities |
| `npm audit --omit=dev` | **PASS** — 0 vulnerabilities |
| `git diff --check` | **PASS** |
| PostgreSQL integration tests | **Not rerun** — this transport-only change does not affect database behavior. The full standard suite reported 23 skipped PostgreSQL tests; they are not counted as passed here. |

After the build termination, the visible environment had about 1.5 GiB available memory, 8.0 GiB free workspace disk, and no cgroup memory maximum. Cgroup counters showed zero OOM and OOM-kill events. VS Code/TypeScript language-server processes were present. These observations do not establish why SIGTERM was sent; the sender and whether resource pressure or external process management was responsible remain unknown. No further build was launched.

The build changed `next-env.d.ts`; it was clean before this task and its generated change was restored. Tracked and staged whitespace checks passed afterward.

## 6. Remaining risks and preservation

- The Railway private endpoint's TLS support, certificate chain and production URL configuration were not inspected. If the endpoint is HTTP-only, scheduler delivery will now fail closed until the architecture is changed as described above.
- The production build must complete successfully before checkpoint approval; investigate the unexplained exit 143 rather than disabling checks or retrying blindly.
- The identity processor has no automatic retry loop. Scheduling/reinvocation and operational monitoring remain separately configured responsibilities.
- The existing process-local authentication rate limiter and proxy-header trust noted by earlier reports remain unrelated deployment-readiness concerns.
- The 23 standard-suite PostgreSQL skips remain unverified in this task.

At the end of SCHEDULER-SEC-001, the three existing local commits were unchanged and the branch was three commits ahead of its locally recorded origin. Existing uncommitted changes and `stash@{0}` (`faa676654a6f5c7a82cbe5541c58dfc4c8dfd249`) were preserved. The scheduler changes and this report were unstaged then. DEV-SAVE-004 reviews and stages only the scheduler fix, its tests, environment guidance, and this report for one additional local commit. No push, deployment, migration, database access, backup execution, or secret change occurred.

**HOLD — production build terminated during TypeScript checking with exit 143; cause unresolved.**
