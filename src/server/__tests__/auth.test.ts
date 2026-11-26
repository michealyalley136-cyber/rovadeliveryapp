import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminSession,
  createCustomerSession,
  createDemoSession,
  clearCustomerSession,
  getAdminSession,
  getCustomerSession,
  getSession,
  requireRole,
} from "../auth";
import { createApplicationRecognition } from "../application-recognition";

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

const databaseMock = vi.hoisted(() => {
  const sessions = new Map<string, {
    id: string;
    userId: string;
    tokenHash: string;
    lastSeenAt: Date;
    revokedAt: Date | null;
  }>();
  return {
    sessions,
    database: {
      user: {
        findUnique: vi.fn(async () => ({
          id: "isolated-customer",
          status: "ACTIVE",
          roles: [{ roleId: "customer-role" }],
        })),
      },
      customerSession: {
        create: vi.fn(async ({ data }: { data: {
          id: string; userId: string; tokenHash: string; expiresAt: Date;
        } }) => {
          sessions.set(data.tokenHash, {
            id: data.id,
            userId: data.userId,
            tokenHash: data.tokenHash,
            lastSeenAt: new Date(),
            revokedAt: null,
          });
          return data;
        }),
        findFirst: vi.fn(async ({ where }: { where: { id: string; tokenHash: string; userId: string } }) => {
          const record = sessions.get(where.tokenHash);
          return record && record.id === where.id && record.userId === where.userId && !record.revokedAt
            ? {
              ...record,
              user: { status: "ACTIVE", roles: [{ roleId: "customer-role" }] },
            }
            : null;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { lastSeenAt: Date } }) => {
          for (const record of sessions.values()) {
            if (record.id === where.id) record.lastSeenAt = data.lastSeenAt;
          }
        }),
        updateMany: vi.fn(async ({ where, data }: {
          where: { id: string; userId: string; tokenHash: string; revokedAt: null };
          data: { revokedAt: Date; revocationReason: string };
        }) => {
          const record = sessions.get(where.tokenHash);
          if (
            record &&
            record.id === where.id &&
            record.userId === where.userId &&
            !record.revokedAt
          ) {
            record.revokedAt = data.revokedAt;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore.store,
}));
vi.mock("@/server/db", () => ({ getDatabase: () => databaseMock.database }));

const testSecret = "isolated-jwt-authentication-test-secret-01";

type TestEnvironment = "staging" | "production";
type TestTokenKind = "demo" | "admin" | "customer";

function configureEnvironment(environment: TestEnvironment) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ROVA_AUTH_ENVIRONMENT", environment);
  vi.stubEnv("AUTH_SECRET", testSecret);
  vi.stubEnv("ROVA_DEMO_MODE", "true");
}

function setCookie(name: string, token: string) {
  cookieStore.values.set(name, token);
}

function getCookie(name: string) {
  const token = cookieStore.values.get(name);
  expect(token).toBeDefined();
  return token!;
}

async function signTestToken(options: {
  environment?: TestEnvironment;
  kind?: TestTokenKind;
  role?: string;
  issuer?: string;
  audience?: string;
  secret?: string;
  omitIssuer?: boolean;
  omitAudience?: boolean;
  omitKind?: boolean;
  omitIssuedAt?: boolean;
  omitExpiration?: boolean;
  omitSubject?: boolean;
  expiresAt?: number;
}) {
  const environment = options.environment ?? "staging";
  const kind = options.kind ?? "demo";
  const issuer = `urn:rova:auth:${environment}`;
  let token = new SignJWT({
    role: options.role ?? (kind === "demo" ? "CUSTOMER" : "VIEW_ONLY"),
    name: "Isolated Test User",
    ...(kind === "customer" ? { sid: "isolated-session" } : {}),
    ...(options.omitKind ? {} : { kind }),
  }).setProtectedHeader({ alg: "HS256" });

  if (!options.omitIssuer) token = token.setIssuer(options.issuer ?? issuer);
  if (!options.omitAudience) token = token.setAudience(options.audience ?? `${issuer}/${kind}`);
  if (!options.omitSubject) token = token.setSubject("isolated-test-user");
  if (!options.omitIssuedAt) token = token.setIssuedAt();
  if (!options.omitExpiration) {
    token = token.setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1000) + 3600);
  }
  return token.sign(new TextEncoder().encode(options.secret ?? testSecret));
}

beforeEach(() => {
  cookieStore.values.clear();
  databaseMock.sessions.clear();
  vi.unstubAllEnvs();
  configureEnvironment("staging");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment-bound JWT sessions", () => {
  it("does not accept an application recognition marker as an authenticated session", async () => {
    const marker = await createApplicationRecognition();
    setCookie("rova_demo_session", marker);
    setCookie("rova_admin_session", marker);
    expect(await getSession()).toBeNull();
    expect(await getAdminSession()).toBeNull();
  });

  it("accepts a valid staging demo token in staging", async () => {
    await createDemoSession("CUSTOMER");

    expect(await getSession()).toEqual({
      id: "cus_demo_001",
      role: "CUSTOMER",
      name: "Ama Mensah",
    });
  });

  it("accepts a valid production demo token in production", async () => {
    configureEnvironment("production");
    await createDemoSession("CUSTOMER");

    expect(await getSession()).toEqual({
      id: "cus_demo_001",
      role: "CUSTOMER",
      name: "Ama Mensah",
    });
  });

  it.each(["staging", "production"] as const)("accepts a valid %s administrator token", async (environment) => {
    configureEnvironment(environment);
    await createAdminSession({ id: "isolated-admin", role: "VIEW_ONLY", name: "Test Administrator" });

    expect(await getAdminSession()).toEqual({
      id: "isolated-admin",
      role: "VIEW_ONLY",
      name: "Test Administrator",
    });
  });

  it.each(["staging", "production"] as const)("accepts a valid %s verified customer token", async (environment) => {
    configureEnvironment(environment);
    await createCustomerSession("isolated-customer");
    expect(await getCustomerSession()).toEqual({ id: "isolated-customer" });
  });

  it.each([
    ["staging", "production"],
    ["production", "staging"],
  ] as const)("rejects a %s customer JWT in %s", async (source, target) => {
    configureEnvironment(source);
    await createCustomerSession("isolated-customer");
    const customerToken = getCookie("rova_customer_session");
    configureEnvironment(target);
    setCookie("rova_customer_session", customerToken);
    expect(await getCustomerSession()).toBeNull();
  });

  it.each([
    ["staging", "production", "demo"],
    ["production", "staging", "demo"],
    ["staging", "production", "admin"],
    ["production", "staging", "admin"],
  ] as const)("rejects a %s-to-%s %s token even with the same signing secret", async (source, target, kind) => {
    configureEnvironment(source);
    if (kind === "demo") {
      await createDemoSession("CUSTOMER");
    } else {
      await createAdminSession({ id: "isolated-admin", role: "VIEW_ONLY", name: "Test Administrator" });
    }
    const sharedSecret = process.env.AUTH_SECRET;
    const cookieName = kind === "demo" ? "rova_demo_session" : "rova_admin_session";
    const token = getCookie(cookieName);

    configureEnvironment(target);
    expect(process.env.AUTH_SECRET).toBe(sharedSecret);
    setCookie(cookieName, token);
    expect(kind === "demo" ? await getSession() : await getAdminSession()).toBeNull();
  });

  it.each(["demo", "admin"] as const)("rejects a %s token with an incorrect issuer", async (kind) => {
    const cookieName = kind === "demo" ? "rova_demo_session" : "rova_admin_session";
    setCookie(
      cookieName,
      await signTestToken({ kind, issuer: "urn:rova:auth:attacker" }),
    );

    expect(kind === "demo" ? await getSession() : await getAdminSession()).toBeNull();
  });

  it.each(["demo", "admin"] as const)("rejects a %s token with an incorrect audience", async (kind) => {
    const cookieName = kind === "demo" ? "rova_demo_session" : "rova_admin_session";
    setCookie(cookieName, await signTestToken({ kind, audience: "rova:unrelated" }));

    expect(kind === "demo" ? await getSession() : await getAdminSession()).toBeNull();
  });

  it.each(["demo", "admin"] as const)("rejects %s tokens missing any required claim", async (kind) => {
    const cookieName = kind === "demo" ? "rova_demo_session" : "rova_admin_session";
    for (const claim of ["issuer", "audience", "kind", "issued-at", "expiration", "subject"] as const) {
      setCookie(
        cookieName,
        await signTestToken({
          kind,
          omitIssuer: claim === "issuer",
          omitAudience: claim === "audience",
          omitKind: claim === "kind",
          omitIssuedAt: claim === "issued-at",
          omitExpiration: claim === "expiration",
          omitSubject: claim === "subject",
        }),
      );

      expect(kind === "demo" ? await getSession() : await getAdminSession()).toBeNull();
    }
  });

  it.each(["demo", "admin"] as const)("rejects an expired %s token", async (kind) => {
    const cookieName = kind === "demo" ? "rova_demo_session" : "rova_admin_session";
    setCookie(
      cookieName,
      await signTestToken({ kind, expiresAt: Math.floor(Date.now() / 1000) - 60 }),
    );

    expect(kind === "demo" ? await getSession() : await getAdminSession()).toBeNull();
  });

  it.each(["demo", "admin"] as const)("rejects a %s token with an invalid signature", async (kind) => {
    const cookieName = kind === "demo" ? "rova_demo_session" : "rova_admin_session";
    setCookie(
      cookieName,
      await signTestToken({ kind, secret: "different-isolated-test-signing-secret" }),
    );

    expect(kind === "demo" ? await getSession() : await getAdminSession()).toBeNull();
  });

  it("does not accept demo tokens as administrator sessions", async () => {
    await createDemoSession("CUSTOMER");
    setCookie("rova_admin_session", getCookie("rova_demo_session"));

    expect(await getAdminSession()).toBeNull();
  });

  it("does not accept administrator tokens as demo sessions", async () => {
    await createAdminSession({ id: "isolated-admin", role: "VIEW_ONLY", name: "Test Administrator" });
    setCookie("rova_demo_session", getCookie("rova_admin_session"));

    expect(await getSession()).toBeNull();
  });

  it("does not accept shared demo or administrator tokens as verified customer sessions", async () => {
    await createDemoSession("CUSTOMER");
    setCookie("rova_customer_session", getCookie("rova_demo_session"));
    expect(await getCustomerSession()).toBeNull();

    await createAdminSession({ id: "isolated-admin", role: "VIEW_ONLY", name: "Test Administrator" });
    setCookie("rova_customer_session", getCookie("rova_admin_session"));
    expect(await getCustomerSession()).toBeNull();
  });

  it("clears verified customer and demo sessions from the shared logout endpoint", async () => {
    await createDemoSession("CUSTOMER");
    await createCustomerSession("isolated-customer");
    expect(cookieStore.values.has("rova_demo_session")).toBe(true);
    expect(cookieStore.values.has("rova_customer_session")).toBe(true);

    const { DELETE } = await import("@/app/api/session/route");
    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(cookieStore.values.has("rova_demo_session")).toBe(false);
    expect(cookieStore.values.has("rova_customer_session")).toBe(false);
    expect(await getSession()).toBeNull();
    expect(await getCustomerSession()).toBeNull();
  });

  it("keeps the cookie after a revocation database failure and allows a safe retry", async () => {
    await createCustomerSession("isolated-customer");
    const token = getCookie("rova_customer_session");
    databaseMock.database.customerSession.updateMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(clearCustomerSession()).rejects.toThrow("database unavailable");
    expect(getCookie("rova_customer_session")).toBe(token);

    await clearCustomerSession();
    expect(cookieStore.values.has("rova_customer_session")).toBe(false);
    setCookie("rova_customer_session", token);
    expect(await getCustomerSession()).toBeNull();
  });

  it("returns retryable logout failure without clearing the customer cookie", async () => {
    await createCustomerSession("isolated-customer");
    const token = getCookie("rova_customer_session");
    databaseMock.database.customerSession.updateMany.mockRejectedValueOnce(new Error("database unavailable"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { DELETE } = await import("@/app/api/customer/session/route");
      const response = await DELETE();

      expect(response.status).toBe(503);
      expect(getCookie("rova_customer_session")).toBe(token);
      expect(await response.json()).toMatchObject({
        error: "Sign-out could not be fully confirmed. Retry after connectivity returns.",
      });
    } finally {
      logError.mockRestore();
    }
  });

  it("revokes only the matching session and safely handles concurrent repeated logout", async () => {
    await createCustomerSession("isolated-customer");
    const firstToken = getCookie("rova_customer_session");
    await createCustomerSession("isolated-customer");
    const secondToken = getCookie("rova_customer_session");

    await Promise.all([clearCustomerSession(), clearCustomerSession()]);
    expect(cookieStore.values.has("rova_customer_session")).toBe(false);
    setCookie("rova_customer_session", secondToken);
    expect(await getCustomerSession()).toBeNull();
    setCookie("rova_customer_session", firstToken);
    expect(await getCustomerSession()).toEqual({ id: "isolated-customer" });
    expect(databaseMock.database.customerSession.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        tokenHash: expect.any(String),
        revokedAt: null,
        userId: "isolated-customer",
      }),
      data: { revokedAt: expect.any(Date), revocationReason: "LOGOUT" },
    });
  });

  it("preserves demo role restrictions and administrator role validation", async () => {
    await createDemoSession("CUSTOMER");
    expect(await requireRole("CUSTOMER")).not.toBeNull();
    expect(await requireRole("OPERATOR")).toBeNull();

    setCookie(
      "rova_admin_session",
      await signTestToken({ kind: "admin", role: "CUSTOMER" }),
    );
    expect(await getAdminSession()).toBeNull();
  });

  it("fails closed when the deployed environment identity is missing or invalid", async () => {
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "");
    await expect(createAdminSession({ id: "isolated-admin", role: "VIEW_ONLY", name: "Test Administrator" }))
      .rejects.toThrow("ROVA_AUTH_ENVIRONMENT");

    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "preview");
    await expect(createAdminSession({ id: "isolated-admin", role: "VIEW_ONLY", name: "Test Administrator" }))
      .rejects.toThrow("ROVA_AUTH_ENVIRONMENT");

    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "");
    await expect(createAdminSession({ id: "isolated-admin", role: "VIEW_ONLY", name: "Test Administrator" }))
      .rejects.toThrow("ROVA_AUTH_ENVIRONMENT");
  });
});
