# ROVA GHANA — CUSTOMER-004D Durable Identity Delivery Report

## Executive summary

CUSTOMER-004D replaces synchronous and `after()` activation/reset provider delivery with a PostgreSQL-backed encrypted outbox. Eligible security-token issuance and pending delivery are now committed atomically. A claim/lease worker recovers pending work, retries transient failures, prevents concurrent processing and records terminal outcomes.

No Railway service, migration, secret, cron, worker or deployment was changed.

## 1. Root cause of best-effort loss

CUSTOMER-004C proved that a reset request could leave a PENDING token if the Next.js process stopped before its `after()` callback completed. Account/provider work was outside the durable response/transaction boundary, so a process crash could lose the provider call while the cooldown suppressed replacement.

CUSTOMER-004D removes provider delivery from `after()`. The public reset route now enqueues an encrypted RESET_REQUEST into PostgreSQL. The worker separately resolves account eligibility and creates/queues a reset token. Activation token and notification creation occur in the same transaction.

## 2. Outbox architecture

`IdentityNotificationOutbox` stores:

- unique job ID;
- optional security-token relation;
- `RESET_REQUEST`, `CUSTOMER_ACTIVATION` or `PASSWORD_RESET` type;
- dedupe key;
- AES-256-GCM encrypted payload and key ID;
- PENDING/PROCESSING/DELIVERED/FAILED/EXPIRED/DEAD state;
- next attempt timestamp;
- expiry;
- attempt count and maximum attempts;
- lease owner/expiry;
- delivery/cleanup timestamps;
- safe outcome code.

The dedupe index is partial and applies only to PENDING, PROCESSING and FAILED records. This blocks concurrent duplicate admission while permitting a later request after a permanent terminal result.

### Secure payload

The outbox never stores plaintext:

- activation/reset bearer URL;
- raw activation/reset token;
- password;
- provider secret.

The temporary encrypted delivery payload contains only:

- email/SMS channel;
- recipient;
- notification kind;
- public bearer URL;
- expiry.

It is encrypted with AES-256-GCM. The nonce, authentication tag and ciphertext are stored as one envelope. Tampering causes authenticated decryption failure. Payloads are nulled after delivery, no-op completion, expiry or permanent dead-letter handling.

Existing `AccountSecurityToken.tokenHash` remains the verification source. The raw token continues to exist only in the encrypted link payload and provider delivery memory.

## 3. Transactional boundaries

### Activation

One PostgreSQL transaction:

1. Invalidates previous activation tokens.
2. Creates the hashed activation token.
3. Encrypts and inserts the activation outbox job.
4. Writes the administrator audit event.

If any step fails, token, job and audit state roll back together. A real isolated test forced the audit insert to fail and verified that neither token nor outbox row remained.

### Password reset

The public request path inserts the same-shaped encrypted RESET_REQUEST for existing, unknown, suspended or syntactically valid identifiers. The identifier itself is encrypted. The route returns one generic 202 response without checking account existence.

The worker:

1. Decrypts the identifier.
2. Looks up normalized email/phone.
3. For unknown/suspended/roleless/contactless accounts, completes a no-op without disclosure.
4. Under a PostgreSQL advisory lock, checks the five-minute account cooldown.
5. Creates the hashed reset token and encrypted PASSWORD_RESET delivery job atomically.

## 4. Worker processing and crash recovery

`processIdentityNotifications()` claims work with PostgreSQL `FOR UPDATE SKIP LOCKED`.

Claim behavior:

- PENDING/FAILED jobs become PROCESSING.
- PROCESSING jobs with expired 30-second leases are reclaimable.
- Competing workers cannot claim the same live lease.
- Each claim increments `attemptCount`.
- Expired jobs are marked EXPIRED, invalidate PENDING tokens and clear encrypted payloads.

The internal processing endpoint requires a separate `IDENTITY_NOTIFICATION_WORKER_SECRET`. It returns only processed counts/outcome labels.

`npm run identity:notifications` calls that endpoint. Railway scheduling is not configured and must be separately approved.

### Retry policy

- Maximum attempts: 6.
- Transient provider/network/timeout/408/429 failures: exponential backoff.
- Backoff is bounded at ten minutes.
- Unsafe webhook/configuration and non-retryable 4xx failures: permanent DEAD outcome.
- Exhausted attempts: DEAD outcome and token invalidation.
- Notification/provider delivery cannot continue after token expiry, consumption, invalidation or account lifecycle failure.

### At-least-once semantics

The system intentionally provides at-least-once processing, not exactly-once delivery. The outbox ID is sent to the provider as `idempotency-key`. A crash after provider acceptance but before the PostgreSQL SENT update may cause another provider attempt. The provider must honor the stable job ID to suppress duplicate messages.

## 5. Key management and cleanup

Configuration:

- `IDENTITY_NOTIFICATION_ENCRYPTION_KEY_ID`
- `IDENTITY_NOTIFICATION_ENCRYPTION_KEY` (`v1` fallback)
- rotation-specific `IDENTITY_NOTIFICATION_ENCRYPTION_KEY_<KEY_ID>` variables

Keys must be 32-byte base64url values.

Rotation procedure:

1. Create a new server-only 32-byte key.
2. Configure it under its new key ID.
3. Set the active key ID.
4. Retain previous key variables for all PENDING/PROCESSING/FAILED jobs that reference them.
5. Remove an old key only after no unexpired/active outbox row references that key.
6. Recover keys through the approved secret manager/backup procedure; a lost key makes the affected encrypted job unreadable and permanently fail closed.

Delivered/expired/dead jobs retain no encrypted payload. Expired terminal records may be purged after the cleanup window.

## 6. Isolated PostgreSQL results

A disposable PostgreSQL 16 loopback-only database was migrated with all eight repository migrations. A repeat `prisma migrate deploy` reported no pending migrations.

Migration 8:

- Adds two enums.
- Adds one outbox table.
- Adds a partial active-dedupe unique index.
- Adds processing, token, lease and expiry indexes.
- Adds foreign key to `AccountSecurityToken`.
- Adds lifecycle/attempt/delivery/type checks.

No existing table was destructively changed.

### Integration coverage

Real PostgreSQL cases passed:

1. Eligible/ineligible activation.
2. Transaction rollback: failed audit insertion created neither token nor job.
3. Activation token hash/job atomicity.
4. Successful provider delivery and payload cleanup.
5. Permanent provider failure.
6. Transient provider failure with retry.
7. Expired lease recovery after simulated worker crash.
8. Concurrent worker processing/claims.
9. Concurrent reset requests.
10. Five-minute cooldown.
11. Duplicate request deduplication.
12. Expired activation/reset token rejection.
13. Unknown/suspended/contactless reset request no-op.
14. Account suspension.
15. Session revocation.
16. Existing/unknown reset booking and session isolation.
17. Customer A/Customer B booking ownership.
18. Persistent records across fresh clients.
19. Outbox-sensitive payload not present in ordinary fields.

The complete suite reported:

- **31 test files passed**
- **200 tests passed**
- **0 skipped**
- Real PostgreSQL tests: 23

## 7. Production-build browser verification

Chromium at `390x844` used a real `next start` production build and isolated customer:

1. Opened the mobile password-reset page.
2. Submitted an eligible customer phone.
3. Received the generic success response without account existence.
4. Confirmed no mobile horizontal overflow.
5. Stopped the Next.js process while the reset notification remained PENDING in PostgreSQL.
6. Restarted/resumed a separate worker process with a controlled provider fixture.
7. Worker recovered the persisted RESET_REQUEST, created one reset token, delivered one job with stable idempotency key and removed the encrypted payload.

This proves the notification is no longer lost solely because the web process stops.

Prior CUSTOMER-004C browser coverage remains: activation, login, old-JWT rejection, logout, password reset, expired/replayed reset rejection, session revocation and gate-disabled booking behavior.

## 8. Security preservation

Maintained:

- HTTPS-only deployed webhook.
- Private/local SSRF rejection.
- No redirect following.
- Generic reset body and status.
- Five-minute reset cooldown.
- Rate limiting.
- SHA-256 token hashes.
- Single-use/expiring tokens.
- Durable logout/reset/suspension session revocation.
- Staging/production JWT audience isolation.
- No dispatch, payment or booking enablement.
- No provider secret, raw token, bearer URL or sensitive error in logs.
- Internal worker route bearer authorization.

## 9. Infrastructure and worker deployment requirements

For an approved staging rollout, the existing platform must run a recurring job with:

```text
npm run identity:notifications
```

Required:

- a separate long-lived worker or approved scheduled process;
- recommended interval: 10–30 seconds for interactive recovery;
- `IDENTITY_NOTIFICATION_WORKER_URL`;
- `IDENTITY_NOTIFICATION_WORKER_SECRET`;
- active and retained AES-GCM key variables;
- graceful shutdown;
- metrics for PENDING/FAILED/DEAD/expired jobs;
- provider idempotency support/monitoring;
- dead-letter alerts;
- database connection pool and command timeout limits.

No Railway worker, cron, secret or paid service was created.

## 10. Security findings and remaining risks

- The provider is still capable of at-least-once duplicate delivery after an ambiguous timeout; stable job idempotency is required.
- DNS validation is not DNS-pin enforced, so approved provider DNS rebinding remains an operational hardening concern.
- A worker must run; the outbox is durable but delivery is delayed when no processor is scheduled.
- Distributed reset rate limiting remains outside this outbox task.
- Dead-letter recovery requires operational review.
- Key-loss behavior is fail-closed but permanently prevents delivery of affected jobs.
- Physical Ghana handset/Safari/provider acceptance remains unverified.
- Backup/PITR and Railway staging isolation remain unverified.

## 11. Final validation

Passed:

- `npm ci`
- `npm audit` — 0 vulnerabilities
- `npm audit --omit=dev` — 0 vulnerabilities
- `npm run lint`
- `npm run typecheck`
- `npm test` with isolated PostgreSQL — 200/200
- `npx prisma generate`
- `npx prisma validate`
- isolated `prisma migrate deploy` plus repeat no-op
- `npm run build`
- `git diff --check`

## 12. Migration and deployment approvals required

Do not deploy until:

1. Database owner reviews migration 20261123030000.
2. Backup and point-in-time recovery are verified.
3. Staging key-management and old-key-retention are approved.
4. Provider idempotency behavior is confirmed.
5. A worker/scheduler architecture and command interval are approved.
6. Worker secret, encryption key, provider endpoint and provider secret are prepared separately.
7. Dead-letter/age monitoring and support runbook are accepted.
8. The migration is applied only to an approved isolated/staging PostgreSQL environment.
9. `CUSTOMER_RIDES_ENABLED`, dispatch and payments remain disabled.

**Recommendation: local implementation verified; deployment HOLD pending worker/provider/key migration approvals.**

No commit, push, merge, Railway migration, secret change or deployment was performed. The saved Git stash and unrelated work were preserved.
