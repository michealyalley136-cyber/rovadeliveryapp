import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

vi.mock("server-only", () => ({}));

import { createApplicationRecognition, isApplicationRecognized, recognitionMaxAge } from "../application-recognition";

describe("application recognition", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "test-only-recognition-secret-at-least-32-characters");
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "staging");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("accepts a valid marker and rejects tampering and other environments", async () => {
    const token = await createApplicationRecognition();
    expect(await isApplicationRecognized(token)).toBe(true);
    expect(await isApplicationRecognized(`${token}x`)).toBe(false);
    expect(await isApplicationRecognized(undefined)).toBe(false);
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "production");
    expect(await isApplicationRecognized(token)).toBe(false);
  });

  it("expires after the defined period", async () => {
    vi.useFakeTimers();
    const token = await createApplicationRecognition();
    vi.advanceTimersByTime((recognitionMaxAge + 1) * 1000);
    expect(await isApplicationRecognized(token)).toBe(false);
  });

  it("does not accept an authentication token as a recognition marker", async () => {
    const token = await new SignJWT({ kind: "admin", role: "SUPER_ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("urn:rova:auth:staging")
      .setAudience("urn:rova:auth:staging/admin")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    expect(await isApplicationRecognized(token)).toBe(false);
  });
});
