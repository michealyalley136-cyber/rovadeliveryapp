CREATE TYPE "IdentityNotificationType" AS ENUM (
    'RESET_REQUEST',
    'CUSTOMER_ACTIVATION',
    'PASSWORD_RESET'
);

CREATE TYPE "IdentityNotificationStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'DELIVERED',
    'FAILED',
    'EXPIRED',
    'DEAD'
);

CREATE TABLE "IdentityNotificationOutbox" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT,
    "notificationType" "IdentityNotificationType" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "encryptedPayload" TEXT,
    "encryptionKeyId" TEXT NOT NULL,
    "status" "IdentityNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cleanupAt" TIMESTAMP(3),
    "lastOutcomeCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityNotificationOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdentityNotificationOutbox_attempt_check" CHECK (
      "attemptCount" >= 0 AND "maxAttempts" > 0 AND "attemptCount" <= "maxAttempts"
    ),
    CONSTRAINT "IdentityNotificationOutbox_lifecycle_check" CHECK (
      "expiresAt" > "createdAt"
      AND (
        ("status" = 'PROCESSING' AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
        OR ("status" <> 'PROCESSING' AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
      )
    ),
    CONSTRAINT "IdentityNotificationOutbox_delivery_check" CHECK (
      ("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND "encryptedPayload" IS NULL)
      OR ("status" <> 'DELIVERED')
    ),
    CONSTRAINT "IdentityNotificationOutbox_type_check" CHECK (
      ("notificationType" = 'RESET_REQUEST' AND "tokenId" IS NULL)
      OR ("notificationType" IN ('CUSTOMER_ACTIVATION', 'PASSWORD_RESET') AND "tokenId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "IdentityNotificationOutbox_active_dedupeKey_key"
  ON "IdentityNotificationOutbox"("dedupeKey")
  WHERE "status" IN ('PENDING', 'PROCESSING', 'FAILED');
CREATE INDEX "IdentityNotificationOutbox_status_nextAttemptAt_idx"
  ON "IdentityNotificationOutbox"("status", "nextAttemptAt");
CREATE INDEX "IdentityNotificationOutbox_tokenId_status_idx"
  ON "IdentityNotificationOutbox"("tokenId", "status");
CREATE INDEX "IdentityNotificationOutbox_leaseExpiresAt_status_idx"
  ON "IdentityNotificationOutbox"("leaseExpiresAt", "status");
CREATE INDEX "IdentityNotificationOutbox_expiresAt_status_idx"
  ON "IdentityNotificationOutbox"("expiresAt", "status");

ALTER TABLE "IdentityNotificationOutbox"
  ADD CONSTRAINT "IdentityNotificationOutbox_tokenId_fkey"
  FOREIGN KEY ("tokenId") REFERENCES "AccountSecurityToken"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
