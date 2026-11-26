CREATE TYPE "AccountSecurityTokenPurpose" AS ENUM ('CUSTOMER_ACTIVATION', 'PASSWORD_RESET');
CREATE TYPE "AccountSecurityTokenDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "Application"
  ADD COLUMN "accountUserId" TEXT;

CREATE TABLE "AccountSecurityToken" (
    "id" TEXT NOT NULL,
    "purpose" "AccountSecurityTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "applicationId" INTEGER,
    "userId" TEXT,
    "recipientDigest" TEXT NOT NULL,
    "deliveryStatus" "AccountSecurityTokenDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSecurityToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountSecurityToken_subject_check" CHECK (
      ("purpose" = 'CUSTOMER_ACTIVATION' AND "applicationId" IS NOT NULL AND "userId" IS NULL)
      OR ("purpose" = 'PASSWORD_RESET' AND "userId" IS NOT NULL)
    ),
    CONSTRAINT "AccountSecurityToken_lifecycle_check" CHECK (
      "expiresAt" > "createdAt"
      AND ("deliveredAt" IS NULL OR "deliveryStatus" = 'SENT')
      AND ("deliveryStatus" <> 'FAILED' OR "invalidatedAt" IS NOT NULL)
    )
);

CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "userAgentHash" TEXT,
    "ipAddressHash" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerSession_expiry_check" CHECK ("expiresAt" > "createdAt"),
    CONSTRAINT "CustomerSession_revocation_check" CHECK (
      ("revokedAt" IS NULL AND "revocationReason" IS NULL)
      OR ("revokedAt" IS NOT NULL AND "revocationReason" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "Application_accountUserId_key" ON "Application"("accountUserId");
CREATE UNIQUE INDEX "AccountSecurityToken_tokenHash_key" ON "AccountSecurityToken"("tokenHash");
CREATE INDEX "AccountSecurityToken_applicationId_purpose_createdAt_idx"
  ON "AccountSecurityToken"("applicationId", "purpose", "createdAt");
CREATE INDEX "AccountSecurityToken_userId_purpose_createdAt_idx"
  ON "AccountSecurityToken"("userId", "purpose", "createdAt");
CREATE INDEX "AccountSecurityToken_expiresAt_consumedAt_invalidatedAt_idx"
  ON "AccountSecurityToken"("expiresAt", "consumedAt", "invalidatedAt");
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_userId_expiresAt_idx" ON "CustomerSession"("userId", "expiresAt");
CREATE INDEX "CustomerSession_expiresAt_revokedAt_idx" ON "CustomerSession"("expiresAt", "revokedAt");

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_accountUserId_fkey"
  FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountSecurityToken"
  ADD CONSTRAINT "AccountSecurityToken_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountSecurityToken"
  ADD CONSTRAINT "AccountSecurityToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSession"
  ADD CONSTRAINT "CustomerSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
