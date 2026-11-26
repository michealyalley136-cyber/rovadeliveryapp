import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getIdentityNotificationWorkerRequest,
  runIdentityNotificationProcessor,
} from "./identity-notification-transport.mjs";

const secret = "synthetic-identity-worker-secret-for-tests";
const openServers = new Set();

function workerEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    ROVA_AUTH_ENVIRONMENT: "staging",
    IDENTITY_NOTIFICATION_WORKER_URL: "https://worker.example",
    IDENTITY_NOTIFICATION_WORKER_SECRET: secret,
    ...overrides,
  };
}

async function listen(handler) {
  const server = createServer(handler);
  openServers.add(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    [...openServers].map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => {
            openServers.delete(server);
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

describe("identity notification scheduler transport", () => {
  it("rejects production HTTP, including a local environment label", async () => {
    const fetchImpl = vi.fn();
    expect(() =>
      getIdentityNotificationWorkerRequest(
        workerEnv({
          ROVA_AUTH_ENVIRONMENT: "local",
          IDENTITY_NOTIFICATION_WORKER_URL: "http://127.0.0.1:8080",
        }),
      ),
    ).toThrow("environment is not configured");
    expect(() =>
      getIdentityNotificationWorkerRequest(
        workerEnv({ IDENTITY_NOTIFICATION_WORKER_URL: "http://worker.example" }),
      ),
    ).toThrow("must use HTTPS");
    await expect(
      runIdentityNotificationProcessor({
        env: workerEnv({
          ROVA_AUTH_ENVIRONMENT: "local",
          IDENTITY_NOTIFICATION_WORKER_URL: "http://127.0.0.1:8080",
        }),
        fetchImpl,
      }),
    ).rejects.toThrow("environment is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows HTTP only for explicitly labeled development/test loopback", () => {
    for (const runtime of ["development", "test"]) {
      expect(() =>
        getIdentityNotificationWorkerRequest(
          workerEnv({
            NODE_ENV: runtime,
            ROVA_AUTH_ENVIRONMENT: "local",
            IDENTITY_NOTIFICATION_WORKER_URL: "http://localhost:8080",
          }),
        ),
      ).not.toThrow();
    }

    expect(() =>
      getIdentityNotificationWorkerRequest(
        workerEnv({
          NODE_ENV: "development",
          IDENTITY_NOTIFICATION_WORKER_URL: "http://localhost:8080",
        }),
      ),
    ).toThrow("must use HTTPS");
    expect(() =>
      getIdentityNotificationWorkerRequest(
        workerEnv({
          NODE_ENV: "test",
          ROVA_AUTH_ENVIRONMENT: "local",
          IDENTITY_NOTIFICATION_WORKER_URL: "http://192.168.1.10:8080",
        }),
      ),
    ).toThrow("must use HTTPS");
  });

  it.each([
    ["invalid URL", "not a URL"],
    ["unsafe protocol", "ftp://worker.example"],
    ["embedded credentials", "https://user:password@worker.example"],
    ["query string", "https://worker.example/?token=synthetic"],
    ["base path", "https://worker.example/internal"],
  ])("rejects %s without exposing configured credentials", (_case, url) => {
    const configuredSecret = `${secret}-not-for-errors`;
    expect(() =>
      getIdentityNotificationWorkerRequest(
        workerEnv({
          IDENTITY_NOTIFICATION_WORKER_URL: url,
          IDENTITY_NOTIFICATION_WORKER_SECRET: configuredSecret,
        }),
      ),
    ).toThrow();
    try {
      getIdentityNotificationWorkerRequest(
        workerEnv({
          IDENTITY_NOTIFICATION_WORKER_URL: url,
          IDENTITY_NOTIFICATION_WORKER_SECRET: configuredSecret,
        }),
      );
    } catch (error) {
      expect(error.message).not.toContain(configuredSecret);
      expect(error.message).not.toContain("password");
    }
  });

  it("sends the bearer only to the configured HTTPS endpoint with redirects disabled", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ processed: 3 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await runIdentityNotificationProcessor({
      env: workerEnv(),
      fetchImpl,
    });

    expect(result).toEqual({ processed: 3 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0].href).toBe(
      "https://worker.example/api/internal/identity-notifications/process",
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
    });
  });

  it("rejects same-origin redirects without making the redirected request", async () => {
    const paths = [];
    const { url } = await listen((request, response) => {
      paths.push(request.url);
      response.writeHead(302, { location: "/redirected" }).end();
    });

    await expect(
      runIdentityNotificationProcessor({
        env: workerEnv({
          NODE_ENV: "test",
          ROVA_AUTH_ENVIRONMENT: "local",
          IDENTITY_NOTIFICATION_WORKER_URL: url,
        }),
      }),
    ).rejects.toThrow("request failed");
    expect(paths).toEqual(["/api/internal/identity-notifications/process"]);
  });

  it("rejects cross-origin redirects without forwarding the bearer", async () => {
    let redirectedAuthorization;
    const target = await listen((request, response) => {
      redirectedAuthorization = request.headers.authorization;
      response.writeHead(200).end('{"processed":0}');
    });
    const source = await listen((_request, response) => {
      response.writeHead(302, { location: target.url }).end();
    });

    await expect(
      runIdentityNotificationProcessor({
        env: workerEnv({
          NODE_ENV: "test",
          ROVA_AUTH_ENVIRONMENT: "local",
          IDENTITY_NOTIFICATION_WORKER_URL: source.url,
        }),
      }),
    ).rejects.toThrow("request failed");
    expect(redirectedAuthorization).toBeUndefined();
  });

  it("revalidates every invocation and keeps redirect protection after a failed attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error(`failure included ${secret}`))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ processed: 1 }), { status: 200 }),
      );
    const options = {
      env: workerEnv(),
      fetchImpl,
    };

    await expect(runIdentityNotificationProcessor(options)).rejects.toThrow(
      "request failed",
    );
    await expect(runIdentityNotificationProcessor(options)).resolves.toEqual({
      processed: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, requestOptions] of fetchImpl.mock.calls) {
      expect(requestOptions.redirect).toBe("error");
      expect(requestOptions.headers.authorization).toBe(`Bearer ${secret}`);
    }
  });
});
