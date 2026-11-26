import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transports = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
}));
const dnsLookup = vi.hoisted(() => vi.fn(async () => [
  { address: "8.8.8.8", family: 4 },
]));

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({
  lookup: dnsLookup,
}));
vi.mock("node:http", () => ({ request: transports.httpRequest }));
vi.mock("node:https", () => ({ request: transports.httpsRequest }));

import {
  deliverCustomerIdentityMessage,
  validateCustomerIdentityDeliveryEndpoint,
} from "@/server/customer-identity-delivery";
import { lookup } from "node:dns/promises";

const secret = "identity-delivery-secret-for-isolated-tests-01";
const activationUrl = "https://customer.example/activate?token=raw-activation-token";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "staging");
  vi.stubEnv("CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL", "https://delivery.example/hooks/customer");
  vi.stubEnv("CUSTOMER_IDENTITY_DELIVERY_SECRET", secret);
  dnsLookup.mockReset().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  transports.httpRequest.mockReset();
  transports.httpsRequest.mockReset();
  mockHttpsResponse(204);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function deliver(idempotencyKey?: string) {
  return deliverCustomerIdentityMessage({
    channel: "email",
    recipient: "customer@example.invalid",
    kind: "activation",
    url: activationUrl,
    expiresAt: new Date(Date.now() + 60_000),
    idempotencyKey,
  });
}

function mockHttpsResponse(statusCode: number, lookupHostname = "delivery.example") {
  transports.httpsRequest.mockImplementation((url, options, callback) => {
    let errorHandler: ((error: Error) => void) | undefined;
    const request = {
      on: vi.fn((event: string, handler: (error: Error) => void) => {
        if (event === "error") errorHandler = handler;
        return request;
      }),
      end: vi.fn(() => {
        options.lookup(
          lookupHostname,
          { all: false },
          (
            error: NodeJS.ErrnoException | null,
            address: string | Array<{ address: string; family: number }>,
          ) => {
            if (error) {
              errorHandler?.(error);
              return;
            }
            expect(address).toBe("8.8.8.8");
            callback({ statusCode, resume: vi.fn() });
          },
        );
      }),
    };
    return request;
  });
}

describe("customer identity delivery webhook security", () => {
  it.each([
    "http://delivery.example/hooks/customer",
    "file:///tmp/customer-hook",
    "ftp://delivery.example/hooks/customer",
    "https://user:password@delivery.example/hooks/customer",
  ])("rejects unsafe deployed endpoint %s before opening a connection", async (endpoint) => {
    vi.stubEnv("CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL", endpoint);
    await expect(deliver()).rejects.toThrow(/HTTPS|must not contain credentials/);
    expect(transports.httpsRequest).not.toHaveBeenCalled();
    expect(transports.httpRequest).not.toHaveBeenCalled();
  });

  it("rejects localhost and private-network destinations in staging", async () => {
    const resolver = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
    await expect(validateCustomerIdentityDeliveryEndpoint(
      "https://127.0.0.1/hooks/customer",
      resolver as never,
    )).rejects.toThrow(/public network/);

    await expect(validateCustomerIdentityDeliveryEndpoint(
      "https://localhost/hooks/customer",
      resolver as never,
    )).rejects.toThrow(/localhost/);

    const privateResolver = vi.fn(async () => [{ address: "10.2.3.4", family: 4 }]);
    await expect(validateCustomerIdentityDeliveryEndpoint(
      "https://delivery.example/hooks/customer",
      privateResolver as never,
    )).rejects.toThrow(/public network/);

    for (const address of [
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:a00:1",
      "ff02::1",
      "2001:db8::1",
      "3fff::1",
    ]) {
      await expect(validateCustomerIdentityDeliveryEndpoint(
        "https://delivery.example/hooks/customer",
        vi.fn(async () => [{ address, family: 6 }]) as never,
      )).rejects.toThrow(/public network/);
    }
  });

  it("allows a public IPv6 address", async () => {
    await expect(validateCustomerIdentityDeliveryEndpoint("https://[2001:4860::1]/hook"))
      .resolves.toMatchObject({ protocol: "https:" });
  });

  it("permits localhost HTTP only in explicitly local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "local");
    await expect(validateCustomerIdentityDeliveryEndpoint(
      "http://127.0.0.1:4010/hooks/customer",
      vi.fn(),
    )).resolves.toMatchObject({ protocol: "http:", hostname: "127.0.0.1" });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "local");
    await expect(validateCustomerIdentityDeliveryEndpoint(
      "http://127.0.0.1:4010/hooks/customer",
      vi.fn(),
    )).rejects.toThrow(/environment/);
    await expect(validateCustomerIdentityDeliveryEndpoint(
      "https://127.0.0.1/hooks/customer",
      vi.fn(),
    )).rejects.toThrow(/environment/);
  });

  it("fails closed for missing, unknown or conflicting runtime configurations", async () => {
    for (const [runtime, environment] of [
      ["production", ""],
      ["production", "local"],
      ["development", "staging"],
      ["unknown", "production"],
    ]) {
      vi.stubEnv("NODE_ENV", runtime);
      vi.stubEnv("ROVA_AUTH_ENVIRONMENT", environment);
      await expect(deliver()).rejects.toThrow(/environment/);
    }
    expect(transports.httpsRequest).not.toHaveBeenCalled();
  });

  it("restricts local HTTP and local private destinations to explicit loopback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "local");
    for (const endpoint of [
      "http://10.1.2.3/hook",
      "https://169.254.169.254/hook",
      "http://8.8.8.8/hook",
    ]) {
      await expect(validateCustomerIdentityDeliveryEndpoint(endpoint)).rejects.toThrow(/public network/);
    }
  });

  it("requires an explicit local environment for loopback exceptions", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", undefined);
    await expect(validateCustomerIdentityDeliveryEndpoint("https://127.0.0.1/hook"))
      .rejects.toThrow(/public network/);
    await expect(validateCustomerIdentityDeliveryEndpoint("http://127.0.0.1/hook"))
      .rejects.toThrow(/HTTPS/);
  });

  it("pins the validated address and preserves HTTPS, bearer and idempotency headers", async () => {
    await deliver("outbox-job-01");
    expect(lookup).toHaveBeenCalledWith("delivery.example", { all: true, verbatim: true });
    expect(transports.httpsRequest).toHaveBeenCalledTimes(1);
    const [url, options] = transports.httpsRequest.mock.calls[0];
    expect(String(url)).toBe("https://delivery.example/hooks/customer");
    expect(options).toMatchObject({
      method: "POST",
      agent: false,
      family: 4,
      rejectUnauthorized: true,
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "idempotency-key": "outbox-job-01",
      },
    });
    expect(options.lookup).toBeTypeOf("function");
  });

  it("rejects mixed public and private DNS answers before connecting", async () => {
    dnsLookup.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(deliver()).rejects.toThrow(/public network/);
    expect(transports.httpsRequest).not.toHaveBeenCalled();
  });

  it("resolves and checks DNS again on each retry", async () => {
    dnsLookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await deliver("same-job");
    await expect(deliver("same-job")).rejects.toThrow(/public network/);
    expect(dnsLookup).toHaveBeenCalledTimes(2);
    expect(transports.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("does not follow redirects and genericizes provider errors", async () => {
    mockHttpsResponse(302);
    await expect(deliver()).rejects.toThrow("Customer identity delivery redirects are not permitted.");
    expect(transports.httpsRequest).toHaveBeenCalledTimes(1);

    transports.httpsRequest.mockImplementationOnce(() => {
      let errorHandler: ((error: Error) => void) | undefined;
      const request = {
        on: vi.fn((_event: string, handler: (error: Error) => void) => {
          errorHandler = handler;
          return request;
        }),
        end: vi.fn(() => errorHandler?.(new Error(`${secret} ${activationUrl}`))),
      };
      return request;
    });
    const failure = await deliver().catch((error) => error);
    expect(String(failure)).toBe("Error: Customer identity delivery request failed.");
    expect(String(failure)).not.toContain(secret);
    expect(String(failure)).not.toContain("raw-activation-token");
  });

  it("rejects an outbound lookup request for a different hostname", async () => {
    mockHttpsResponse(204, "redirect.attacker");
    const failure = await deliver().catch((error) => error);
    expect(String(failure)).toBe("Error: Customer identity delivery request failed.");
  });
});
