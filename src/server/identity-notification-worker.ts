import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeGhanaPhone } from "@/server/phone";
import { getDatabase } from "@/server/db";
import {
  createSecurityToken,
  recipientDigest,
  securityTokenHash,
} from "@/server/account-security";
import {
  CustomerIdentityDeliveryError,
  deliverCustomerIdentityMessage,
} from "@/server/customer-identity-delivery";
import {
  decryptIdentityNotificationPayload,
  encryptIdentityNotificationPayload,
} from "@/server/identity-notification-crypto";

const leaseMs = 30_000;
const resetLifetimeMs = 20 * 60 * 1000;
const cooldownMs = 5 * 60 * 1000;
const permanentFailureWindowMs = 24 * 60 * 60 * 1000;

type ClaimedJob = Prisma.IdentityNotificationOutboxGetPayload<{
  select: {
    id: true;
    tokenId: true;
    notificationType: true;
    encryptedPayload: true;
    encryptionKeyId: true;
    expiresAt: true;
    attemptCount: true;
    maxAttempts: true;
  };
}>;

type DeliveryPayload = {
  channel: "email" | "sms";
  recipient: string;
  kind: "activation" | "password-reset";
  url: string;
  expiresAt: string;
};

function lookupWhere(identifier: string) {
  const phone = normalizeGhanaPhone(identifier);
  const email = identifier.includes("@") ? identifier.trim().toLocaleLowerCase("en") : null;
  if (phone) return { phone };
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email };
  return null;
}

function publicResetUrl(token: string) {
  const raw = process.env.ROVA_PUBLIC_URL;
  if (!raw) throw new Error("ROVA_PUBLIC_URL is required.");
  const url = new URL(raw);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("ROVA_PUBLIC_URL must use HTTPS in production.");
  }
  url.pathname = "/reset-password";
  url.searchParams.set("token", token);
  return url.toString();
}

async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  const now = new Date();
  return getDatabase().$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "IdentityNotificationOutbox"
      WHERE
        "expiresAt" > ${now}
        AND (
          ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now})
          OR ("status" = 'PROCESSING' AND "leaseExpiresAt" <= ${now})
        )
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (!rows.length) return null;
    return transaction.identityNotificationOutbox.update({
      where: { id: rows[0].id },
      data: {
        status: "PROCESSING",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        attemptCount: { increment: 1 },
      },
      select: {
        id: true,
        tokenId: true,
        notificationType: true,
        encryptedPayload: true,
        encryptionKeyId: true,
        expiresAt: true,
        attemptCount: true,
        maxAttempts: true,
      },
    });
  });
}

async function expireDueJobs() {
  const now = new Date();
  const expired = await getDatabase().identityNotificationOutbox.findMany({
    where: {
      expiresAt: { lte: now },
      status: { in: ["PENDING", "PROCESSING", "FAILED"] },
    },
    select: { id: true, tokenId: true },
    take: 50,
  });
  for (const job of expired) {
    await getDatabase().$transaction(async (transaction) => {
      await transaction.identityNotificationOutbox.update({
        where: { id: job.id },
        data: {
          status: "EXPIRED",
          encryptedPayload: null,
          cleanupAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastOutcomeCode: "JOB_EXPIRED",
        },
      });
      if (job.tokenId) {
        await transaction.accountSecurityToken.updateMany({
          where: { id: job.tokenId, deliveryStatus: "PENDING" },
          data: {
            deliveryStatus: "FAILED",
            deliveryError: "DELIVERY_EXPIRED",
            invalidatedAt: now,
          },
        });
      }
    });
  }
  return expired.length;
}

async function completeNoop(jobId: string, code: string) {
  await getDatabase().identityNotificationOutbox.update({
    where: { id: jobId },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      cleanupAt: new Date(),
      encryptedPayload: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastOutcomeCode: code,
    },
  });
}

async function createResetNotification(jobId: string, identifier: string) {
  const where = lookupWhere(identifier);
  if (!where) {
    await completeNoop(jobId, "INVALID_CONTACT");
    return;
  }
  const database = getDatabase();
  const user = await database.user.findUnique({
    where,
    select: {
      id: true,
      email: true,
      phone: true,
      status: true,
      roles: { where: { role: { key: "CUSTOMER" } }, select: { roleId: true }, take: 1 },
    },
  });
  if (!user || user.status !== "ACTIVE" || !user.roles.length) {
    await completeNoop(jobId, "INELIGIBLE_ACCOUNT");
    return;
  }
  const email = user.email?.trim().toLocaleLowerCase("en");
  const emailIsUsable = Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const recipient = emailIsUsable ? email : normalizeGhanaPhone(user.phone);
  if (!recipient) {
    await completeNoop(jobId, "NO_VERIFIED_CONTACT");
    return;
  }
  const token = createSecurityToken();
  const expiresAt = new Date(Date.now() + resetLifetimeMs);
  const encrypted = encryptIdentityNotificationPayload({
    channel: emailIsUsable ? "email" : "sms",
    recipient,
    kind: "password-reset",
    url: publicResetUrl(token),
    expiresAt: expiresAt.toISOString(),
  } satisfies DeliveryPayload);

  const created = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`password-reset:${user.id}`}, 0))`;
    const recent = await transaction.accountSecurityToken.findFirst({
      where: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        createdAt: { gt: new Date(Date.now() - cooldownMs) },
        consumedAt: null,
        invalidatedAt: null,
        deliveryStatus: { in: ["PENDING", "SENT"] },
      },
      select: { id: true },
    });
    if (recent) return false;
    const securityToken = await transaction.accountSecurityToken.create({
      data: {
        purpose: "PASSWORD_RESET",
        tokenHash: securityTokenHash(token),
        userId: user.id,
        recipientDigest: recipientDigest(recipient),
        expiresAt,
      },
      select: { id: true },
    });
    await transaction.identityNotificationOutbox.create({
      data: {
        tokenId: securityToken.id,
        notificationType: "PASSWORD_RESET",
        dedupeKey: `password-reset:${securityToken.id}`,
        ...encrypted,
        expiresAt,
      },
    });
    return true;
  });
  await completeNoop(jobId, created ? "TOKEN_QUEUED" : "COOLDOWN_SUPPRESSED");
}

async function failJob(job: ClaimedJob, code: string, permanent: boolean) {
  const terminal = permanent || job.attemptCount >= job.maxAttempts;
  const backoffMs = Math.min(10 * 60_000, 2 ** job.attemptCount * 1_000);
  await getDatabase().$transaction(async (transaction) => {
    await transaction.identityNotificationOutbox.update({
      where: { id: job.id },
      data: {
        status: terminal ? (permanent ? "DEAD" : "DEAD") : "FAILED",
        nextAttemptAt: new Date(Date.now() + backoffMs),
        leaseOwner: null,
        leaseExpiresAt: null,
        encryptedPayload: terminal ? null : undefined,
        cleanupAt: terminal ? new Date() : null,
        lastOutcomeCode: code,
      },
    });
    if (terminal && job.tokenId) {
      await transaction.accountSecurityToken.updateMany({
        where: { id: job.tokenId, deliveryStatus: "PENDING" },
        data: {
          deliveryStatus: "FAILED",
          deliveryError: "DELIVERY_PERMANENT_FAILURE",
          invalidatedAt: new Date(),
        },
      });
    }
  });
}

async function expireJob(job: ClaimedJob) {
  await getDatabase().$transaction(async (transaction) => {
    await transaction.identityNotificationOutbox.update({
      where: { id: job.id },
      data: {
        status: "EXPIRED",
        encryptedPayload: null,
        cleanupAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastOutcomeCode: "JOB_EXPIRED",
      },
    });
    if (job.tokenId) {
      await transaction.accountSecurityToken.updateMany({
        where: { id: job.tokenId, deliveryStatus: "PENDING" },
        data: {
          deliveryStatus: "FAILED",
          deliveryError: "DELIVERY_EXPIRED",
          invalidatedAt: new Date(),
        },
      });
    }
  });
}

async function deliverJob(job: ClaimedJob) {
  if (!job.encryptedPayload || !job.tokenId) throw new Error("Notification payload is unavailable.");
  const token = await getDatabase().accountSecurityToken.findUnique({
    where: { id: job.tokenId },
    select: {
      deliveryStatus: true,
      consumedAt: true,
      invalidatedAt: true,
      expiresAt: true,
    },
  });
  if (
    !token ||
    token.deliveryStatus !== "PENDING" ||
    token.consumedAt ||
    token.invalidatedAt ||
    token.expiresAt <= new Date() ||
    job.expiresAt <= new Date()
  ) {
    await expireJob(job);
    return;
  }
  const payload = decryptIdentityNotificationPayload<DeliveryPayload>(
    job.encryptionKeyId,
    job.encryptedPayload,
  );
  await deliverCustomerIdentityMessage({
    ...payload,
    expiresAt: new Date(payload.expiresAt),
    idempotencyKey: job.id,
  });
  await getDatabase().$transaction(async (transaction) => {
    const sent = await transaction.accountSecurityToken.updateMany({
      where: {
        id: job.tokenId!,
        deliveryStatus: "PENDING",
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { deliveryStatus: "SENT", deliveredAt: new Date() },
    });
    if (sent.count !== 1) throw new Error("Security token changed during delivery.");
    await transaction.identityNotificationOutbox.update({
      where: { id: job.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        cleanupAt: new Date(),
        encryptedPayload: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastOutcomeCode: "DELIVERED",
      },
    });
  });
}

export async function processNextIdentityNotification(workerId = `identity-worker:${randomUUID()}`) {
  const job = await claimNextJob(workerId);
  if (!job) return null;
  try {
    if (job.expiresAt <= new Date()) {
      await expireJob(job);
      return { id: job.id, status: "EXPIRED" as const };
    }
    if (!job.encryptedPayload) {
      await expireJob(job);
      return { id: job.id, status: "EXPIRED" as const };
    }
    if (job.notificationType === "RESET_REQUEST") {
      const payload = decryptIdentityNotificationPayload<{ identifier: string }>(
        job.encryptionKeyId,
        job.encryptedPayload,
      );
      await createResetNotification(job.id, payload.identifier);
      return { id: job.id, status: "DELIVERED" as const };
    }
    await deliverJob(job);
    return { id: job.id, status: "DELIVERED" as const };
  } catch (error) {
    const permanent = error instanceof CustomerIdentityDeliveryError && error.permanent;
    const code = permanent ? "PERMANENT_DELIVERY_FAILURE" : "TRANSIENT_DELIVERY_FAILURE";
    await failJob(job, code, permanent);
    return { id: job.id, status: permanent ? "DEAD" as const : "FAILED" as const };
  }
}

export async function processIdentityNotifications(options: { limit?: number; workerId?: string } = {}) {
  const limit = Math.min(options.limit ?? 10, 100);
  const workerId = options.workerId ?? `identity-worker:${randomUUID()}`;
  const results = [];
  await expireDueJobs();
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextIdentityNotification(workerId);
    if (!result) break;
    results.push(result);
  }
  return results;
}

export async function purgeExpiredIdentityNotifications(limit = 100) {
  const cutoff = new Date(Date.now() - permanentFailureWindowMs);
  const expired = await getDatabase().identityNotificationOutbox.findMany({
    where: {
      status: { in: ["EXPIRED", "DEAD", "DELIVERED"] },
      cleanupAt: { not: null, lt: cutoff },
    },
    select: { id: true },
    take: limit,
  });
  const jobs = await getDatabase().identityNotificationOutbox.deleteMany({
    where: {
      id: { in: expired.map((job) => job.id) },
    },
  });
  return jobs.count;
}
