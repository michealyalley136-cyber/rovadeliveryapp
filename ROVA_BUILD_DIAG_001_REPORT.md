# ROVA BUILD-DIAG-001 — Build and Security Validation

**Recommendation: SAFE FOR LOCAL CHECKPOINT**, subject to normal staged-file and secret review. This is not approval to deploy. The earlier build terminations remain unexplained and should be investigated if they recur.

## Earlier exit 143

The [SECURITY-FIX-002 report](./ROVA_TASK_SECURITY_FIX_002_WEBHOOK_HARDENING_REPORT.md) records three attempts: two normal builds and one constrained to one CPU with a bounded Node heap. Each compiled successfully and stopped at Next.js's **Running TypeScript** stage with exit 143. The first ran alongside a separate typecheck; the other two were retried without that concurrent command. The existing Next build diagnostics also recorded `type-checking` and `useBuildWorker: true`.

Exit 143 is consistent with termination by SIGTERM, but the prior attempts did not capture the signal or its sender. A shell or process can also return that status explicitly. Therefore the exact cause, sender, and relationship to resource pressure or process management are **not established**. The successful traced attempt below does not prove the earlier cause or eliminate the possibility of intermittent recurrence.

## Resource and process findings

At inspection: 7.8 GiB total memory, approximately 1.9 GiB available, no swap, and 8.0 GiB free on the workspace filesystem. Two CPUs were available; load averages were 1.46, 3.13 and 2.61. Several editor extension hosts and TypeScript language servers were active; no active Next.js build or dev process was identified in the targeted process snapshot. Other processes were not stopped or modified.

The visible cgroup reported no memory maximum and zero `oom` or `oom_kill` events, both before and after the successful build. CPU time was unlimited and the visible process limit was not close to exhaustion. Kernel logs were inaccessible to the current user, so host-level or other cgroup events cannot be ruled out. Memory pressure and competing activity remain possible, but there is no evidence establishing an OOM kill or conflicting build as the cause.

A lightweight 40-second sleep completed normally. The npm fetch timeout concerns registry requests, not a demonstrated build deadline. Inspection of the installed Next typecheck worker setup found no timeout supplied for that worker. These observations do not exclude an external supervisor, shutdown or transient process-management signal.

## Controlled build

One production build was run under `strace` signal tracing, with a non-live loopback placeholder `DATABASE_URL`; security checks and build configuration were not disabled or changed. A preliminary wrapper command failed with exit 127 because `/usr/bin/time` was absent; it did **not** launch a build. Bash timing was used for the single actual build.

- **PASS, exit 0**, elapsed 38.534 seconds.
- Compilation succeeded in 16.1 seconds; TypeScript finished in 10.0 seconds.
- Page-data collection, static generation (38/38) and final optimization completed.
- The trace showed no SIGTERM in this successful run. No signal attribution for the three previous runs is available.
- The build-generated `next-env.d.ts` change was restored to its pre-task state.

## PostgreSQL integration

An empty task-created PostgreSQL 18 container was bound only to a dynamically selected `127.0.0.1` port. Its database identity and server version were checked before use. All **8/8** repository migrations were applied to that disposable database only.

The booking and customer identity integration suites then passed: **2 files passed; 23 tests passed, 0 failed, 0 skipped**. The specific container and its anonymous volume were removed afterward. No Railway or live database was contacted, and no Railway migration was run.

## Webhook security assessment

The focused regression suites were rerun: **2 files passed; 19 tests passed, 0 failed, 0 skipped**. They exercise actual loopback HTTP and HTTPS connections with controlled DNS and synthetic certificates, distinct sockets across consecutive HTTP and HTTPS requests, re-resolution on retry, rejection of a redirect without contacting its target, and direct connections despite environment-configured HTTP/HTTPS proxies. TLS tests cover trusted certificates, hostname/SNI and rejection of untrusted or mismatched certificates. Environment tests reject production mislabeled local and cover private IPv4, IPv6 and mapped IPv4 addresses.

The public HTTPS success path is tested with a mocked transport, not a real external public endpoint. The tests do not establish protection against transparent network-layer routing or proxies outside the process. The existing process-local authentication rate limiter and proxy-header trust remain deployment-readiness concerns.

## Files and safety

The only persistent task-created workspace file is this report; no application or backup code was changed. The build regenerated the Next declaration temporarily, then its pre-task content was restored. The index and saved stash were preserved. No commits, pushes, deployments, production changes, live backups or secret rotations were performed.
