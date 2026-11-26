import "server-only";
import { compare, hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { normalizeGhanaPhone } from "@/server/phone";
import { getDatabase } from "@/server/db";
import { BookingError } from "@/server/booking-errors";
import {
  createSecurityToken,
  recipientDigest,
  securityTokenHash,
} from "@/server/account-security";
import { encryptIdentityNotificationPayload } from "@/server/identity-notification-crypto";

const passwordCost = 12;
const activationLifetimeMs = 30 * 60 * 1000;

function publicBaseUrl() {
  const value = process.env.ROVA_PUBLIC_URL;
  if (!value) throw new Error("ROVA_PUBLIC_URL is required to deliver identity links.");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("ROVA_PUBLIC_URL must use HTTPS in production.");
  }
  return url;
}

function identityError(message: string, status: number, code: string) {
  return new BookingError(message, status, code);
}

export async function issueCustomerActivation(applicationId: number, adminId: string) {
  const database = getDatabase();
  const application = await database.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      type: true,
      status: true,
      accountUserId: true,
      applicant: {
        select: {
          phone: true,
          normalizedPhone: true,
          email: true,
          normalizedEmail: true,
        },
      },
    },
  });
  if (!application) throw identityError("Application not found.", 404, "APPLICATION_NOT_FOUND");
  if (application.type !== "CUSTOMER" || application.status !== "APPROVED_FOR_NEXT_STAGE") {
    throw identityError("This application is not eligible for customer activation.", 409, "APPLICATION_NOT_ELIGIBLE");
  }
  if (application.accountUserId) {
    throw identityError("This application is already linked to a customer account.", 409, "APPLICATION_ALREADY_ACTIVATED");
  }
  const existingUser = await database.user.findFirst({
    where: {
      OR: [
        { phone: application.applicant.normalizedPhone },
        ...(application.applicant.normalizedEmail
          ? [{ email: application.applicant.normalizedEmail }]
          : []),
      ],
    },
    select: { id: true },
  });
  if (existingUser) throw identityError("The verified contacts are already linked to an account.", 409, "CUSTOMER_ALREADY_EXISTS");

  const expiresAt = new Date(Date.now() + activationLifetimeMs);
  const recipient = application.applicant.email ?? application.applicant.phone;
  const channel = application.applicant.email ? "email" : "sms";
  const token = createSecurityToken();
  const url = new URL("/activate", publicBaseUrl());
  url.searchParams.set("token", token);
  const encrypted = encryptIdentityNotificationPayload({
    channel,
    recipient,
    kind: "activation",
    url: url.toString(),
    expiresAt: expiresAt.toISOString(),
  });
  await database.$transaction(async (transaction) => {
    await transaction.accountSecurityToken.updateMany({
      where: {
        applicationId,
        purpose: "CUSTOMER_ACTIVATION",
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: new Date() },
    });
    const created = await transaction.accountSecurityToken.create({
      data: {
        purpose: "CUSTOMER_ACTIVATION",
        tokenHash: securityTokenHash(token),
        applicationId,
        recipientDigest: recipientDigest(recipient),
        expiresAt,
      },
      select: { id: true },
    });
    await transaction.identityNotificationOutbox.create({
      data: {
        tokenId: created.id,
        notificationType: "CUSTOMER_ACTIVATION",
        dedupeKey: `activation:${created.id}`,
        ...encrypted,
        expiresAt,
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        actorId: adminId,
        action: "CUSTOMER_ACTIVATION_INVITATION_CREATED",
        entityId: String(applicationId),
        newState: { purpose: "CUSTOMER_ACTIVATION", channel },
        reason: "Customer application approved for a secure activation invitation.",
      },
    });
    return created;
  });
  return { expiresAt: expiresAt.toISOString(), channel };
}

export async function activateCustomerApplication(input: {
  token: string;
  password: string;
}) {
  const tokenHash = securityTokenHash(input.token);
  const passwordHash = await hash(input.password, passwordCost);
  const database = getDatabase();

  try {
    const user = await database.$transaction(async (transaction) => {
      const securityToken = await transaction.accountSecurityToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          purpose: true,
          applicationId: true,
          deliveryStatus: true,
          deliveredAt: true,
          expiresAt: true,
          consumedAt: true,
          invalidatedAt: true,
          application: {
            select: {
              id: true,
              type: true,
              status: true,
              accountUserId: true,
              applicant: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                  normalizedPhone: true,
                  email: true,
                  normalizedEmail: true,
                },
              },
            },
          },
        },
      });
      if (
        !securityToken ||
        securityToken.purpose !== "CUSTOMER_ACTIVATION" ||
        securityToken.deliveryStatus !== "SENT" ||
        !securityToken.deliveredAt ||
        securityToken.consumedAt ||
        securityToken.invalidatedAt ||
        securityToken.expiresAt <= new Date() ||
        !securityToken.application ||
        securityToken.application.type !== "CUSTOMER" ||
        securityToken.application.status !== "APPROVED_FOR_NEXT_STAGE" ||
        securityToken.application.accountUserId
      ) {
        throw identityError("This activation link is invalid or expired.", 400, "ACTIVATION_TOKEN_INVALID");
      }

      const consumed = await transaction.accountSecurityToken.updateMany({
        where: {
          id: securityToken.id,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw identityError("This activation link has already been used.", 409, "ACTIVATION_TOKEN_USED");
      }

      const role = await transaction.role.upsert({
        where: { key: "CUSTOMER" },
        create: { key: "CUSTOMER", name: "Customer" },
        update: {},
        select: { id: true },
      });
      const applicant = securityToken.application.applicant;
      const created = await transaction.user.create({
        data: {
          phone: applicant.normalizedPhone,
          email: applicant.normalizedEmail,
          passwordHash,
          fullName: `${applicant.firstName} ${applicant.lastName}`.trim(),
          status: "ACTIVE",
          roles: { create: { roleId: role.id } },
          customerProfile: { create: {} },
        },
        select: { id: true, fullName: true },
      });
      await transaction.application.update({
        where: { id: securityToken.application.id },
        data: { accountUserId: created.id },
      });
      await transaction.accountSecurityToken.updateMany({
        where: {
          applicationId: securityToken.application.id,
          purpose: "CUSTOMER_ACTIVATION",
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: new Date() },
      });
      return created;
    });
    return { id: user.id, name: user.fullName };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw identityError("The verified contacts are already linked to another account.", 409, "CUSTOMER_ALREADY_EXISTS");
    }
    throw error;
  }
}

function lookupCustomer(identifier: string) {
  const phone = normalizeGhanaPhone(identifier);
  const email = identifier.includes("@") ? identifier.trim().toLocaleLowerCase("en") : null;
  if (phone) return { phone };
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email };
  return null;
}

export async function authenticateCustomer(identifier: string, password: string) {
  const where = lookupCustomer(identifier);
  if (!where) return null;
  const user = await getDatabase().user.findUnique({
    where,
    select: {
      id: true,
      fullName: true,
      passwordHash: true,
      status: true,
      roles: { where: { role: { key: "CUSTOMER" } }, select: { roleId: true }, take: 1 },
    },
  });
  const passwordMatches = user
    ? await compare(password, user.passwordHash)
    : await compare(password, "$2b$12$C6UzMDM.H6dfI/f/IKcEe.8Nw2J8wqG7R6Jx7S5E8R5R4X8ZQ4K1W");
  if (!passwordMatches || !user || user.status !== "ACTIVE" || !user.roles.length) return null;
  return { id: user.id, name: user.fullName };
}

export async function requestCustomerPasswordReset(identifier: string) {
  const normalized = normalizeGhanaPhone(identifier)
    ?? (identifier.includes("@") ? identifier.trim().toLocaleLowerCase("en") : "invalid");
  const encrypted = encryptIdentityNotificationPayload({ identifier: normalized });
  const createdAt = new Date();
  const bucket = Math.floor(createdAt.getTime() / (5 * 60 * 1000));
  await getDatabase().identityNotificationOutbox.create({
    data: {
      notificationType: "RESET_REQUEST",
      dedupeKey: `reset-request:${recipientDigest(normalized)}:${bucket}`,
      ...encrypted,
      expiresAt: new Date(createdAt.getTime() + 20 * 60 * 1000),
    },
  }).catch((error: unknown) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
  });
}

export async function resetCustomerPassword(token: string, password: string) {
  const passwordHash = await hash(password, passwordCost);
  const database = getDatabase();
  const changed = await database.$transaction(async (transaction) => {
    const securityToken = await transaction.accountSecurityToken.findUnique({
      where: { tokenHash: securityTokenHash(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        deliveryStatus: true,
        deliveredAt: true,
        consumedAt: true,
        invalidatedAt: true,
        expiresAt: true,
      },
    });
    if (
      !securityToken ||
      securityToken.purpose !== "PASSWORD_RESET" ||
      !securityToken.userId ||
      securityToken.deliveryStatus !== "SENT" ||
      !securityToken.deliveredAt ||
      securityToken.consumedAt ||
      securityToken.invalidatedAt ||
      securityToken.expiresAt <= new Date()
    ) {
      throw identityError("This reset link is invalid or expired.", 400, "PASSWORD_RESET_TOKEN_INVALID");
    }
    const consumed = await transaction.accountSecurityToken.updateMany({
      where: {
        id: securityToken.id,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw identityError("This reset link has already been used.", 409, "PASSWORD_RESET_TOKEN_USED");
    }
    const user = await transaction.user.update({
      where: { id: securityToken.userId },
      data: { passwordHash },
      select: { id: true },
    });
    await transaction.customerSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: "PASSWORD_RESET" },
    });
    await transaction.accountSecurityToken.updateMany({
      where: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        consumedAt: null,
        invalidatedAt: null,
        id: { not: securityToken.id },
      },
      data: { invalidatedAt: new Date() },
    });
    return true;
  });
  return changed;
}
