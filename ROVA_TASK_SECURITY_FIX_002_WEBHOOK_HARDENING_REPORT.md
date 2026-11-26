# ROVA SECURITY-FIX-002 — Webhook Hardening Report

**Recommendation: HOLD.** The targeted security regressions pass, but the requested production build did not complete and the isolated PostgreSQL suites were not rerun in this task.

## Root causes

1. The webhook accepted `ROVA_AUTH_ENVIRONMENT=local` in a production runtime, allowing HTTPS loopback or private destinations despite deployed-network restrictions.
2. The default Node HTTP(S) agents can reuse sockets. A reused connection can bypass a new request's pinned DNS lookup, so a preliminary DNS check alone did not guarantee the destination of every delivery. The earlier checkpoint demonstrated reuse for HTTP; HTTPS reuse had not been demonstrated.

## Changes and controls

- [customer-identity-delivery.ts](./src/server/customer-identity-delivery.ts): rejects unrecognized or conflicting runtime/environment combinations, including production labeled local. Local loopback exceptions require an explicit local label in development/test; deployed destinations require HTTPS and public addresses. URL credentials, fragments and unsafe schemes are rejected. All DNS answers are checked, including IPv4, IPv6 and mapped IPv4 addresses. Each request uses a fresh direct connection (`agent: false`), pinned to a validated address; retries resolve and check again. The original hostname is retained for TLS certificate verification and SNI, verification is explicitly enabled, and redirects are not followed. Errors do not include provider secrets or message payloads.
- [customer-identity-delivery.test.ts](./src/server/__tests__/customer-identity-delivery.test.ts): exercises environment conflicts, explicit local authorization, address classifications, mixed DNS answers, retry resolution, idempotency, redirects and redacted errors.
- [customer-identity-delivery.transport.test.ts](./src/server/__tests__/customer-identity-delivery.transport.test.ts): exercises real loopback HTTP/HTTPS connections using controlled DNS, synthetic certificates and local servers.
- [ENVIRONMENT.md](./ENVIRONMENT.md): documents the runtime, loopback, direct connection, proxy and TLS restrictions.

The encrypted outbox and worker retry/idempotency logic were not redesigned. Test runtime can simulate staging or production labels for tests; a development runtime cannot claim those labels.

## Connection and environment evidence

- The two focused test files passed **19 tests, 0 failed, 0 skipped**.
- Two successive requests used distinct HTTP sockets; two successive HTTPS requests in one process also used distinct sockets. The same idempotency key was retained in the HTTP test.
- A later DNS answer changing to a private address was rejected before a third connection. Mixed public/private answers were rejected. The pinned lookup prevents a subsequent DNS resolution from choosing a different address within a request.
- A real HTTP redirect was rejected without contacting the redirect destination.
- With environment proxy support enabled, HTTP and HTTPS test requests went directly to the controlled server rather than the configured proxy. This does not make claims about transparent network-level proxies or routing outside the process.
- A trusted synthetic localhost certificate succeeded with localhost SNI. An untrusted certificate failed even with `NODE_TLS_REJECT_UNAUTHORIZED=0`; a trusted certificate with the wrong hostname also failed.
- Production mislabeled local rejected both HTTP and HTTPS loopback endpoints; deployed private IPv4, private/link-local/multicast IPv6 and mapped IPv4 examples were rejected. Safe public HTTPS delivery was exercised through a mocked transport boundary, not an external network connection.

## Validation

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS: **31 files passed, 2 skipped; 232 tests passed, 0 failed, 23 skipped** |
| `npx prisma generate` | PASS, exit 0; local placeholder URL |
| `npx prisma validate` | PASS, exit 0; local placeholder URL |
| `npm run build` | NOT PASSED: two normal attempts compiled but terminated during Next.js TypeScript phase with exit 143; a third attempt with a bounded Node heap and one CPU also terminated there with exit 143. Cause not established. Separate `npm run typecheck` passed. |
| `npm audit` | PASS, 0 vulnerabilities |
| `npm audit --omit=dev` | PASS, 0 vulnerabilities |
| `git diff --check` | PASS, exit 0; Git does not include untracked files in this check |
| Isolated PostgreSQL integration | NOT RUN: no prepared isolated server was found, and this task prohibits applying migrations. The 23 integration tests are among the 23 skipped by the standard suite; they are not counted as passed here. Prior results are in [SECURITY-FIX-001](./ROVA_TASK_SECURITY_FIX_001_REMEDIATION_REPORT.md). |

Prisma generation, validation and build used a non-live loopback placeholder URL; no database connection or migration was required by those commands. The build-generated change to `next-env.d.ts` was restored to its pre-task state.

## Remaining concerns and safety

- Resolve the build termination and run the complete build successfully before recommending a local checkpoint. Run the PostgreSQL integration suites against an already prepared, independently verified disposable database when permitted; do not treat skipped tests as passes.
- Production uses the direct Node transport and does not support environment-configured outbound proxies. Network-layer routing controls and continued maintenance of address classifications remain deployment responsibilities.
- The previously identified process-local rate limiting and trusted proxy-header handling in [rate-limit.ts](./src/server/rate-limit.ts) remain deployment-readiness concerns.
- No files were staged or committed; no push, deployment, Railway access, variable change, migration, production database access, live backup, or secret rotation was performed. The saved stash reference and object ID remained unchanged. Railway's externally managed state was not independently inspected.

**HOLD**
