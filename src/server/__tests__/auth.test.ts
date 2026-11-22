import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminSession,
  createDemoSession,
  getAdminSession,
  getSession,
  requireRole,
} from "../auth";

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
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore.store,
}));

const testSecret = "isolated-jwt-authentication-test-secret-01";

type TestEnvironment = "staging" | "production";
type TestTokenKind = "demo" | "admin";

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
  vi.unstubAllEnvs();
  configureEnvironment("staging");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment-bound JWT sessions", () => {
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
