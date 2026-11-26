import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestReset: vi.fn(),
  resetPassword: vi.fn(),
  rateAllowed: true,
  logger: vi.fn(),
}));

vi.mock("@/server/customer-identity-service", () => ({
  requestCustomerPasswordReset: mocks.requestReset,
  resetCustomerPassword: mocks.resetPassword,
}));
vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: () => mocks.rateAllowed
    ? { allowed: true, retryAfterSeconds: 0 }
    : { allowed: false, retryAfterSeconds: 600 },
}));

import { POST, PATCH } from "@/app/api/customer/password-reset/route";

const publicMessage = "If an eligible account exists, password-reset instructions will be sent.";

beforeEach(() => {
  mocks.requestReset.mockReset();
  mocks.resetPassword.mockReset();
  mocks.rateAllowed = true;
  mocks.logger.mockReset();
});

function resetRequest(identifier: unknown) {
  return POST(new Request("http://localhost/api/customer/password-reset", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.20",
    },
    body: JSON.stringify({ identifier }),
  }));
}

describe("password reset public response hardening", () => {
  it.each([
    ["existing eligible account", "customer@example.invalid"],
    ["unknown account", "unknown@example.invalid"],
    ["suspended account", "+233245001999"],
    ["malformed identifier", "x"],
  ])("returns the same status, shape and message for an %s", async (_label, identifier) => {
    const response = await resetRequest(identifier);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ message: publicMessage });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not await account lookup or provider delivery before sending the response", async () => {
    mocks.requestReset.mockResolvedValue(undefined);
    const started = performance.now();
    const response = await resetRequest("customer@example.invalid");
    const elapsed = performance.now() - started;

    expect(response.status).toBe(202);
    expect(elapsed).toBeLessThan(250);
    expect(mocks.requestReset).toHaveBeenCalledWith("customer@example.invalid");
  });

  it("keeps provider failures and sensitive exception text out of the public response and logs", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(mocks.logger);
    mocks.requestReset.mockRejectedValue(new Error("raw-reset-token provider-secret customer@example.invalid"));
    await resetRequest("customer@example.invalid");

    expect(consoleError).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(consoleError.mock.calls);
    expect(serialized).not.toContain("raw-reset-token");
    expect(serialized).not.toContain("provider-secret");
    expect(serialized).not.toContain("customer@example.invalid");
    consoleError.mockRestore();
  });

  it("uses the same public response when rate limited without dispatching reset work", async () => {
    mocks.rateAllowed = false;
    const response = await resetRequest("customer@example.invalid");
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ message: publicMessage });
    expect(response.headers.get("Retry-After")).toBe("600");
    expect(mocks.requestReset).not.toHaveBeenCalled();
  });

  it("preserves strict token replay behavior on password reset consumption", async () => {
    mocks.resetPassword.mockResolvedValue(true);
    const response = await PATCH(new Request("http://localhost/api/customer/password-reset", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "x".repeat(32),
        password: "SecureReset2026!",
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.resetPassword).toHaveBeenCalledWith("x".repeat(32), "SecureReset2026!");
  });
});
