import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const enabled = process.env.RUN_BOOKING_DATABASE_TESTS === "true" && Boolean(connectionString);
const describeDatabase = enabled ? describe : describe.skip;
const run = randomUUID();
const phoneSuffix = String(Number.parseInt(run.replaceAll("-", "").slice(0, 8), 16) % 10_000_000).padStart(7, "0");
const eligibleApplicantId = `eligible-applicant-${run}`;
const ineligibleApplicantId = `ineligible-applicant-${run}`;
const secondApplicantId = `second-applicant-${run}`;
const adminId = `identity-admin-${run}`;
let database: PrismaClient | undefined;
let eligibleApplicationId = 0;
let secondApplicationId = 0;
let ineligibleApplicationId = 0;
let activatedUserId = "";

const delivery = vi.hoisted(() => ({
  messages: [] as Array<{ channel: string; recipient: string; kind: string; url: string; idempotencyKey?: string }>,
  failNext: false,
  failTransientNext: false,
  delayMs: 0,
}));
const cookieStore = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      get(name: string) {
        const value = values.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set(name: string, value: string) {
        values.set(name, value);
      },
      delete(name: string) {
        values.delete(name);
      },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore.store }));
vi.mock("@/server/customer-identity-delivery", () => ({
  CustomerIdentityDeliveryError: class extends Error {
    constructor(message: string, readonly permanent: boolean) {
      super(message);
    }
  },
  deliverCustomerIdentityMessage: vi.fn(async (message: {
    channel: string;
    recipient: string;
    kind: string;
    url: string;
    idempotencyKey?: string;
  }) => {
    if (delivery.failNext) {
      delivery.failNext = false;
      const { CustomerIdentityDeliveryError } = await import("@/server/customer-identity-delivery");
      throw new CustomerIdentityDeliveryError("delivery provider rejected request", true);
    }
    if (delivery.failTransientNext) {
      delivery.failTransientNext = false;
      const { CustomerIdentityDeliveryError } = await import("@/server/customer-identity-delivery");
      throw new CustomerIdentityDeliveryError("temporary provider failure", false);
    }
    if (delivery.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delivery.delayMs));
    }
    delivery.messages.push(message);
  }),
}));

import {
  activateCustomerApplication,
  issueCustomerActivation,
  requestCustomerPasswordReset,
  resetCustomerPassword,
} from "@/server/customer-identity-service";
import { POST as login } from "@/app/api/customer/session/route";
import { GET as sessionStatus, DELETE as logout } from "@/app/api/customer/session/route";
import { PATCH as changeStatus } from "@/app/api/admin/customers/[userId]/status/route";
import { POST as createBooking } from "@/app/api/v1/bookings/route";
import { createAdminSession } from "@/server/auth";
import { processIdentityNotifications } from "@/server/identity-notification-worker";

const strongPassword = "GhanaCustomer2026!";
const resetPassword = "GhanaResetSecure2026!";
const encryptionKey = Buffer.alloc(32, 7).toString("base64url");

function client() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
}

function latestToken(kind: string) {
  const message = [...delivery.messages].reverse().find((item) => item.kind === kind);
  if (!message) throw new Error(`No ${kind} delivery was captured.`);
  return new URL(message.url).searchParams.get("token")!;
}

async function customerLogin(password = strongPassword) {
  cookieStore.values.clear();
  return login(new Request("http://localhost/api/customer/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "127.0.0.2",
    },
    body: JSON.stringify({ identifier: `+23324${phoneSuffix}`, password }),
  }));
}

beforeEach(() => {
  vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "local");
  vi.stubEnv("AUTH_SECRET", "customer-004a-isolated-test-secret-2026");
  vi.stubEnv("ROVA_PUBLIC_URL", "http://localhost");
  vi.stubEnv("CUSTOMER_RIDES_ENABLED", "false");
  vi.stubEnv("IDENTITY_NOTIFICATION_ENCRYPTION_KEY_ID", "test-v1");
  vi.stubEnv("IDENTITY_NOTIFICATION_ENCRYPTION_KEY_test-v1", encryptionKey);
});

describeDatabase("isolated PostgreSQL customer identity", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    database = client();
    await database.role.upsert({
      where: { key: "CUSTOMER" },
      create: { key: "CUSTOMER", name: "Customer" },
      update: {},
    });
    await database.adminUser.create({
      data: {
        id: adminId,
        email: `admin-${run}@example.invalid`,
        passwordHash: "not-used",
        fullName: "Identity Test Admin",
        role: "SUPER_ADMIN",
      },
    });
    const phoneDigits = phoneSuffix;
    const eligible = await database.applicant.create({
      data: {
        id: eligibleApplicantId,
        firstName: "Akosua",
        lastName: "Mensah",
        phone: `024${phoneDigits}`,
        normalizedPhone: `+23324${phoneDigits}`,
        email: `akosua-${run}@example.invalid`,
        normalizedEmail: `akosua-${run}@example.invalid`,
        city: "Accra",
      },
    });
    const ineligible = await database.applicant.create({
      data: {
        id: ineligibleApplicantId,
        firstName: "Pending",
        lastName: "Applicant",
        phone: `020${phoneSuffix}`,
        normalizedPhone: `+23320${phoneSuffix}`,
        city: "Tema",
      },
    });
    const second = await database.applicant.create({
      data: {
        id: secondApplicantId,
        firstName: "Kofi",
        lastName: "Owusu",
        phone: `055${phoneSuffix}`,
        normalizedPhone: `+23355${phoneSuffix}`,
        email: `kofi-${run}@example.invalid`,
        normalizedEmail: `kofi-${run}@example.invalid`,
        city: "Kumasi",
      },
    });
    const applications = await database.$transaction([
      database.application.create({
        data: {
          reference: `ROVA-CUS-${run.slice(0, 12)}`,
          applicantId: eligible.id,
          type: "CUSTOMER",
          status: "APPROVED_FOR_NEXT_STAGE",
          data: {},
          consentAt: new Date(),
        },
      }),
      database.application.create({
        data: {
          reference: `ROVA-INEL-${run.slice(0, 12)}`,
          applicantId: ineligible.id,
          type: "CUSTOMER",
          status: "RECEIVED",
          data: {},
          consentAt: new Date(),
        },
      }),
      database.application.create({
        data: {
          reference: `ROVA-CUS-B-${run.slice(0, 12)}`,
          applicantId: second.id,
          type: "CUSTOMER",
          status: "APPROVED_FOR_NEXT_STAGE",
          data: {},
          consentAt: new Date(),
        },
      }),
    ]);
    [eligibleApplicationId, ineligibleApplicationId, secondApplicationId] = applications.map((application) => application.id);
  });

  afterAll(async () => {
    if (!database) return;
    const userIds = [activatedUserId].filter(Boolean);
    const bookings = await database.bookingRequest.findMany({
      where: { customerId: { in: userIds } },
      select: { id: true },
    });
    await database.bookingRequestStatusHistory.deleteMany({
      where: { bookingRequestId: { in: bookings.map((booking) => booking.id) } },
    });
    await database.bookingRequest.deleteMany({ where: { customerId: { in: userIds } } });
    await database.customerSession.deleteMany({ where: { userId: { in: userIds } } });
    await database.accountSecurityToken.deleteMany({
      where: { OR: [
        { applicationId: { in: [eligibleApplicationId, ineligibleApplicationId, secondApplicationId] } },
        { userId: { in: userIds } },
      ] },
    });
    await database.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.application.deleteMany({
      where: { id: { in: [eligibleApplicationId, ineligibleApplicationId, secondApplicationId] } },
    });
    await database.applicant.deleteMany({
      where: { id: { in: [eligibleApplicantId, ineligibleApplicantId, secondApplicantId] } },
    });
    await database.adminAuditLog.deleteMany({ where: { actorId: adminId } });
    await database.adminUser.deleteMany({ where: { id: adminId } });
    await database.$disconnect();
    vi.unstubAllEnvs();
  });

  it("rejects ineligible applications and never auto-creates an account", async () => {
    await expect(issueCustomerActivation(ineligibleApplicationId, adminId)).rejects.toMatchObject({
      status: 409,
      code: "APPLICATION_NOT_ELIGIBLE",
    });
    const users = await database!.user.count({
      where: { phone: `+23320${phoneSuffix}` },
    });
    expect(users).toBe(0);
  });

  it("rolls back token and outbox creation when activation audit insertion fails", async () => {
    await expect(issueCustomerActivation(secondApplicationId, "missing-admin")).rejects.toThrow();
    expect(await database!.accountSecurityToken.count({
      where: { applicationId: secondApplicationId, purpose: "CUSTOMER_ACTIVATION" },
    })).toBe(0);
    expect(await database!.identityNotificationOutbox.count({
      where: { notificationType: "CUSTOMER_ACTIVATION" },
    })).toBe(0);
  });

  it("hashes and delivers a single-use activation token for an eligible applicant", async () => {
    const invitation = await issueCustomerActivation(eligibleApplicationId, adminId);
    expect(invitation.channel).toBe("email");
    await processIdentityNotifications({ limit: 10 });
    const rawToken = latestToken("activation");
    const stored = await database!.accountSecurityToken.findFirstOrThrow({
      where: { applicationId: eligibleApplicationId, purpose: "CUSTOMER_ACTIVATION" },
    });
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.deliveryStatus).toBe("SENT");
    expect(stored.consumedAt).toBeNull();
    const deliveredJob = await database!.identityNotificationOutbox.findFirstOrThrow({
      where: { tokenId: stored.id },
    });
    expect(deliveredJob.status).toBe("DELIVERED");
    expect(deliveredJob.encryptedPayload).toBeNull();
    expect(deliveredJob.lastOutcomeCode).toBe("DELIVERED");
    expect(delivery.messages.at(-1)?.idempotencyKey).toBe(deliveredJob.id);
  });

  it("activates exactly one unique ACTIVE customer and rejects replay/duplicates", async () => {
    const token = latestToken("activation");
    const activated = await activateCustomerApplication({ token, password: strongPassword });
    activatedUserId = activated.id;
    const user = await database!.user.findUniqueOrThrow({
      where: { id: activated.id },
      include: { roles: { include: { role: true } }, customerProfile: true, sourceApplication: true },
    });
    expect(user.status).toBe("ACTIVE");
    expect(user.roles.map((role) => role.role.key)).toContain("CUSTOMER");
    expect(user.customerProfile).not.toBeNull();
    expect(user.sourceApplication?.id).toBe(eligibleApplicationId);

    await expect(activateCustomerApplication({ token, password: "AnotherStrongPass2026!" })).rejects.toMatchObject({
      status: 400,
      code: "ACTIVATION_TOKEN_INVALID",
    });
    await expect(issueCustomerActivation(eligibleApplicationId, adminId)).rejects.toMatchObject({
      status: 409,
      code: "APPLICATION_ALREADY_ACTIVATED",
    });
  });

  it("rejects expired activation and reset tokens", async () => {
    const applicant = await database!.applicant.findUniqueOrThrow({ where: { id: secondApplicantId } });
    const expiredActivationToken = `expired-activation-${run}`;
    const expiredResetToken = `expired-reset-${run}`;
    await database!.accountSecurityToken.createMany({
      data: [
        {
          purpose: "CUSTOMER_ACTIVATION",
          tokenHash: (await import("@/server/account-security")).securityTokenHash(expiredActivationToken),
          applicationId: secondApplicationId,
          recipientDigest: applicant.email ?? applicant.phone,
          deliveryStatus: "SENT",
          deliveredAt: new Date(Date.now() - 120_000),
          expiresAt: new Date(Date.now() - 60_000),
          createdAt: new Date(Date.now() - 120_000),
        },
        {
          purpose: "PASSWORD_RESET",
          tokenHash: (await import("@/server/account-security")).securityTokenHash(expiredResetToken),
          userId: activatedUserId,
          recipientDigest: applicant.email ?? applicant.phone,
          deliveryStatus: "SENT",
          deliveredAt: new Date(Date.now() - 120_000),
          expiresAt: new Date(Date.now() - 60_000),
          createdAt: new Date(Date.now() - 120_000),
        },
      ],
    });
    await expect(activateCustomerApplication({
      token: expiredActivationToken,
      password: strongPassword,
    })).rejects.toMatchObject({ code: "ACTIVATION_TOKEN_INVALID" });
    await expect(resetCustomerPassword(
      expiredResetToken,
      resetPassword,
    )).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });
  });

  it("persists logout revocation and rejects a copied JWT after repeated logout", async () => {
    const first = await customerLogin();
    expect(first.status).toBe(200);
    const copied = cookieStore.values.get("rova_customer_session");
    expect(copied).toBeDefined();
    const current = await sessionStatus();
    expect(current.status).toBe(200);

    const signedOut = await logout();
    expect(signedOut.status).toBe(200);
    expect((await logout()).status).toBe(200);
    cookieStore.values.set("rova_customer_session", copied!);
    const reused = await sessionStatus();
    expect(reused.status).toBe(401);

    const fresh = client();
    try {
      const revoked = await fresh.customerSession.findFirst({
        where: { userId: activatedUserId, revokedAt: { not: null } },
        select: { revokedAt: true },
      });
      expect(revoked?.revokedAt).toBeInstanceOf(Date);
    } finally {
      await fresh.$disconnect();
    }
  });

  it("does not issue reset work for unknown, suspended or contactless accounts", async () => {
    const user = await database!.user.findUniqueOrThrow({
      where: { id: activatedUserId },
      select: { phone: true, email: true },
    });
    const deliveriesBefore = delivery.messages.filter((message) => message.kind === "password-reset").length;
    const tokensBefore = await database!.accountSecurityToken.count({
      where: { userId: activatedUserId, purpose: "PASSWORD_RESET" },
    });

    await requestCustomerPasswordReset("unknown-customer@example.invalid");
    await processIdentityNotifications({ limit: 10 });
    await database!.user.update({ where: { id: activatedUserId }, data: { status: "SUSPENDED" } });
    await requestCustomerPasswordReset(user.phone);
    await processIdentityNotifications({ limit: 10 });
    await database!.user.update({
      where: { id: activatedUserId },
      data: { status: "ACTIVE", email: null, phone: "" },
    });
    await requestCustomerPasswordReset("");
    await processIdentityNotifications({ limit: 10 });
    await database!.user.update({
      where: { id: activatedUserId },
      data: { phone: user.phone, email: user.email, status: "ACTIVE" },
    });

    expect(delivery.messages.filter((message) => message.kind === "password-reset").length).toBe(deliveriesBefore);
    expect(await database!.accountSecurityToken.count({
      where: { userId: activatedUserId, purpose: "PASSWORD_RESET" },
    })).toBe(tokensBefore);
  });

  it("uses one-time password reset tokens and revokes existing sessions", async () => {
    const loggedIn = await customerLogin();
    expect(loggedIn.status).toBe(200);
    const copied = cookieStore.values.get("rova_customer_session")!;

    await database!.accountSecurityToken.updateMany({
      where: { userId: activatedUserId, purpose: "PASSWORD_RESET" },
      data: { invalidatedAt: new Date() },
    });
    await database!.identityNotificationOutbox.deleteMany({
      where: { notificationType: "RESET_REQUEST" },
    });
    delivery.failNext = true;
    await requestCustomerPasswordReset(`+23324${phoneSuffix}`);
    await processIdentityNotifications({ limit: 10 });
    const failed = await database!.accountSecurityToken.findFirstOrThrow({
      where: { userId: activatedUserId, purpose: "PASSWORD_RESET", deliveryStatus: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(failed.invalidatedAt).toBeInstanceOf(Date);

    const beforeSuccessfulDeliveries = delivery.messages.filter((message) => message.kind === "password-reset").length;
    await requestCustomerPasswordReset(`+23324${phoneSuffix}`);
    await requestCustomerPasswordReset(`+23324${phoneSuffix}`);
    await processIdentityNotifications({ limit: 10 });
    const afterSuccessfulDeliveries = delivery.messages.filter((message) => message.kind === "password-reset").length;
    expect(afterSuccessfulDeliveries - beforeSuccessfulDeliveries).toBe(1);
    const token = latestToken("password-reset");
    await resetCustomerPassword(token, resetPassword);
    await expect(resetCustomerPassword(token, "AnotherResetPass2026!")).rejects.toMatchObject({
      code: "PASSWORD_RESET_TOKEN_INVALID",
    });

    cookieStore.values.set("rova_customer_session", copied);
    expect((await sessionStatus()).status).toBe(401);
    expect((await customerLogin(strongPassword)).status).toBe(401);
    expect((await customerLogin(resetPassword)).status).toBe(200);
  });

  it("prevents duplicate delivery under concurrent reset requests and cooldown", async () => {
    await database!.accountSecurityToken.updateMany({
      where: { userId: activatedUserId, purpose: "PASSWORD_RESET" },
      data: { invalidatedAt: new Date() },
    });
    await database!.identityNotificationOutbox.deleteMany({
      where: { notificationType: "RESET_REQUEST" },
    });
    delivery.delayMs = 100;
    const deliveriesBefore = delivery.messages.filter((message) => message.kind === "password-reset").length;
    await Promise.all([
      requestCustomerPasswordReset(`+23324${phoneSuffix}`),
      requestCustomerPasswordReset(`+23324${phoneSuffix}`),
      requestCustomerPasswordReset(`+23324${phoneSuffix}`),
    ]);
    await processIdentityNotifications({ limit: 20 });
    delivery.delayMs = 0;
    const deliveries = delivery.messages.filter((message) => message.kind === "password-reset");
    expect(deliveries.length - deliveriesBefore).toBe(1);
    const activeTokens = await database!.accountSecurityToken.count({
      where: {
        userId: activatedUserId,
        purpose: "PASSWORD_RESET",
        deliveryStatus: { in: ["PENDING", "SENT"] },
        consumedAt: null,
        invalidatedAt: null,
      },
    });
    expect(activeTokens).toBe(1);
  });

  it("recovers expired worker leases and retries transient provider failures safely", async () => {
    await database!.accountSecurityToken.updateMany({
      where: { userId: activatedUserId, purpose: "PASSWORD_RESET" },
      data: { invalidatedAt: new Date() },
    });
    await database!.identityNotificationOutbox.deleteMany({
      where: { notificationType: "RESET_REQUEST" },
    });
    await requestCustomerPasswordReset(`+23324${phoneSuffix}`);
    const resetRequest = await database!.identityNotificationOutbox.findFirstOrThrow({
      where: { notificationType: "RESET_REQUEST", status: "PENDING" },
    });
    await database!.identityNotificationOutbox.update({
      where: { id: resetRequest.id },
      data: {
        status: "PROCESSING",
        leaseOwner: "crashed-worker",
        leaseExpiresAt: new Date(Date.now() - 1_000),
        attemptCount: 1,
      },
    });
    delivery.failTransientNext = true;
    await processIdentityNotifications({ limit: 10 });
    const failedJob = await database!.identityNotificationOutbox.findFirstOrThrow({
      where: {
        notificationType: "PASSWORD_RESET",
        status: "FAILED",
        token: { userId: activatedUserId },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(failedJob.encryptedPayload).not.toBeNull();
    expect(failedJob.attemptCount).toBe(1);

    await database!.identityNotificationOutbox.update({
      where: { id: failedJob.id },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });
    await Promise.all([
      processIdentityNotifications({ limit: 2, workerId: "worker-a" }),
      processIdentityNotifications({ limit: 2, workerId: "worker-b" }),
    ]);
    const recovered = await database!.identityNotificationOutbox.findUniqueOrThrow({
      where: { id: failedJob.id },
    });
    expect(recovered.status).toBe("DELIVERED");
    expect(recovered.encryptedPayload).toBeNull();
    expect(recovered.leaseOwner).toBeNull();
    expect(recovered.attemptCount).toBe(2);
  });

  it("suspends a customer and revokes active sessions server-side", async () => {
    const signedIn = await customerLogin(resetPassword);
    expect(signedIn.status).toBe(200);
    const copied = cookieStore.values.get("rova_customer_session")!;
    cookieStore.values.clear();
    await createAdminSession({
      id: adminId,
      role: "SUPER_ADMIN",
      name: "Identity Test Admin",
    });
    const response = await changeStatus(
      new Request(`http://localhost/api/admin/customers/${activatedUserId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED", reason: "Isolated security verification." }),
      }),
      { params: Promise.resolve({ userId: activatedUserId }) },
    );
    expect(response.status).toBe(200);

    cookieStore.values.delete("rova_admin_session");
    cookieStore.values.set("rova_customer_session", copied);
    expect((await sessionStatus()).status).toBe(401);
    expect((await customerLogin(resetPassword)).status).toBe(401);
    const sessions = await database!.customerSession.count({
      where: { userId: activatedUserId, revokedAt: null },
    });
    expect(sessions).toBe(0);
  });

  it("persists sessions and account links across a fresh PostgreSQL client", async () => {
    const fresh = client();
    try {
      const application = await fresh.application.findUniqueOrThrow({
        where: { id: eligibleApplicationId },
        select: { accountUserId: true, type: true },
      });
      const user = await fresh.user.findUniqueOrThrow({
        where: { id: activatedUserId },
        select: { status: true, fullName: true },
      });
      expect(application).toEqual({ accountUserId: activatedUserId, type: "CUSTOMER" });
      expect(user).toMatchObject({ status: "SUSPENDED", fullName: "Akosua Mensah" });
    } finally {
      await fresh.$disconnect();
    }
  });

  it("enforces token and account constraints in PostgreSQL", async () => {
    const token = await database!.accountSecurityToken.findFirstOrThrow({
      where: { applicationId: eligibleApplicationId },
      select: { tokenHash: true },
    });
    await expect(database!.accountSecurityToken.create({
      data: {
        purpose: "PASSWORD_RESET",
        tokenHash: token.tokenHash,
        userId: activatedUserId,
        recipientDigest: "duplicate",
        expiresAt: new Date(Date.now() + 60_000),
      },
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");

    const tokenCount = await database!.accountSecurityToken.count({
      where: { applicationId: eligibleApplicationId },
    });
    expect(tokenCount).toBeGreaterThan(0);
  });

  it("keeps real booking creation gated off", async () => {
    const countBefore = await database!.bookingRequest.count({
      where: { customerId: activatedUserId },
    });
    cookieStore.values.clear();
    const response = await createBooking(new Request("http://localhost/api/v1/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "BOOKING_GATE_DISABLED" });
    expect(countBefore).toBe(0);
    expect(process.env.CUSTOMER_RIDES_ENABLED).toBe("false");
  });
});
