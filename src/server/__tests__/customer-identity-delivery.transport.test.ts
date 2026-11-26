import { execFile } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TLSSocket } from "node:tls";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolver = vi.hoisted(() => vi.fn(async () => [
  { address: "127.0.0.1", family: 4 },
]));
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: resolver }));

import { deliverCustomerIdentityMessage } from "@/server/customer-identity-delivery";

const execFileAsync = promisify(execFile);
const secret = "isolated-transport-test-secret-not-for-production";
const message = {
  channel: "email" as const,
  recipient: "recipient@example.invalid",
  kind: "activation" as const,
  url: "https://customer.example.invalid/activate?token=synthetic-token",
  expiresAt: new Date("2099-01-01T00:00:00Z"),
  idempotencyKey: "isolated-job",
};

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  return address.port;
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

const childProgram = `
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = (await readFile("src/server/customer-identity-delivery.ts", "utf8"))
  .replace('import "server-only";', "")
  .replace('import { lookup } from "node:dns/promises";',
    'const lookup = async () => [{ address: "127.0.0.1", family: 4 }];');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { deliverCustomerIdentityMessage } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
try {
  for (let i = 0; i < Number(process.env.TEST_DELIVERY_COUNT || "1"); i++) {
    await deliverCustomerIdentityMessage({
      channel: "email", recipient: "recipient@example.invalid", kind: "activation",
      url: "https://customer.example.invalid/activate?token=synthetic-token",
      expiresAt: new Date("2099-01-01T00:00:00Z"), idempotencyKey: "isolated-job"
    });
  }
  console.log("delivered");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
`;

function runChild(endpoint: string, extraEnv: Record<string, string> = {}) {
  return execFileAsync(process.execPath, ["--no-warnings", "--input-type=module", "-e", childProgram], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      ROVA_AUTH_ENVIRONMENT: "local",
      CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL: endpoint,
      CUSTOMER_IDENTITY_DELIVERY_SECRET: secret,
      ...extraEnv,
    },
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "local");
  vi.stubEnv("CUSTOMER_IDENTITY_DELIVERY_SECRET", secret);
  resolver.mockReset().mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("customer identity webhook real transport", () => {
  it("uses a fresh pinned connection for each request and revalidates DNS on retry", async () => {
    const sockets: number[] = [];
    const headers: Array<string | string[] | undefined> = [];
    const server = createHttpServer((request, response) => {
      sockets.push(request.socket.remotePort!);
      headers.push(request.headers["idempotency-key"]);
      request.resume();
      response.writeHead(204).end();
    });
    const port = await listen(server);
    try {
      vi.stubEnv("CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL", `http://localhost:${port}/hook`);
      await deliverCustomerIdentityMessage(message);
      await deliverCustomerIdentityMessage(message);
      expect(sockets).toHaveLength(2);
      expect(new Set(sockets).size).toBe(2);
      expect(headers).toEqual(["isolated-job", "isolated-job"]);
      expect(resolver).toHaveBeenCalledTimes(2);

      resolver.mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
      await expect(deliverCustomerIdentityMessage(message)).rejects.toThrow(/public network/);
      expect(sockets).toHaveLength(2);
    } finally {
      await close(server);
    }
  });

  it("does not follow a real redirect or forward the request to its destination", async () => {
    let redirectedRequests = 0;
    const destination = createHttpServer((_request, response) => {
      redirectedRequests += 1;
      response.writeHead(204).end();
    });
    const destinationPort = await listen(destination);
    const server = createHttpServer((request, response) => {
      request.resume();
      response.writeHead(302, { location: `http://127.0.0.1:${destinationPort}/steal` }).end();
    });
    const port = await listen(server);
    try {
      vi.stubEnv("CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL", `http://localhost:${port}/hook`);
      await expect(deliverCustomerIdentityMessage(message)).rejects.toThrow(/redirects are not permitted/);
      expect(redirectedRequests).toBe(0);
    } finally {
      await close(server);
      await close(destination);
    }
  });

  it("does not use an environment-configured global proxy", async () => {
    let proxyRequests = 0;
    let destinationRequests = 0;
    const proxy = createHttpServer((_request, response) => {
      proxyRequests += 1;
      response.writeHead(502).end();
    });
    const proxyPort = await listen(proxy);
    const server = createHttpServer((request, response) => {
      destinationRequests += 1;
      request.resume();
      response.writeHead(204).end();
    });
    const port = await listen(server);
    try {
      const { stdout } = await runChild(`http://localhost:${port}/hook`, {
        NODE_USE_ENV_PROXY: "1",
        HTTP_PROXY: `http://127.0.0.1:${proxyPort}`,
        http_proxy: `http://127.0.0.1:${proxyPort}`,
        NO_PROXY: "",
        no_proxy: "",
      });
      expect(stdout.trim()).toBe("delivered");
      expect(destinationRequests).toBe(1);
      expect(proxyRequests).toBe(0);
    } finally {
      await close(server);
      await close(proxy);
    }
  });

  it("verifies TLS certificates and hostname while preserving SNI", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rova-webhook-tls-test-"));
    let server: Server | undefined;
    try {
      const keyPath = path.join(directory, "key.pem");
      const certPath = path.join(directory, "cert.pem");
      await execFileAsync("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-keyout", keyPath, "-out", certPath, "-subj", "/CN=localhost",
        "-addext", "subjectAltName=DNS:localhost",
      ]);
      const names: Array<string | false | null | undefined> = [];
      const sockets: number[] = [];
      server = createHttpsServer({
        key: await readFile(keyPath),
        cert: await readFile(certPath),
      }, (request, response) => {
        names.push(request.socket instanceof TLSSocket ? request.socket.servername : undefined);
        sockets.push(request.socket.remotePort!);
        request.resume();
        response.writeHead(204).end();
      });
      const port = await listen(server);
      const url = `https://localhost:${port}/hook`;
      const { stdout } = await runChild(url, {
        NODE_EXTRA_CA_CERTS: certPath,
        NODE_USE_ENV_PROXY: "1",
        HTTPS_PROXY: "http://127.0.0.1:1",
        https_proxy: "http://127.0.0.1:1",
        NO_PROXY: "",
        no_proxy: "",
        TEST_DELIVERY_COUNT: "2",
      });
      expect(stdout.trim()).toBe("delivered");
      expect(names).toEqual(["localhost", "localhost"]);
      expect(new Set(sockets).size).toBe(2);

      await expect(runChild(url, {
        NODE_EXTRA_CA_CERTS: "",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      })).rejects.toMatchObject({ stderr: expect.stringContaining("Customer identity delivery request failed.") });
      await expect(runChild(`https://127.0.0.1:${port}/hook`, {
        NODE_EXTRA_CA_CERTS: certPath,
      })).rejects.toMatchObject({ stderr: expect.stringContaining("Customer identity delivery request failed.") });
      expect(names).toEqual(["localhost", "localhost"]);
    } finally {
      if (server) await close(server);
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
