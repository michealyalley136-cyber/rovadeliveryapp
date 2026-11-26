const WORKER_PATH = "/api/internal/identity-notifications/process";
const WORKER_SECRET_LENGTH = 32;

function isLoopbackHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized === "::1") return true;
  const ipv4 = normalized.split(".").map(Number);
  return ipv4.length === 4 &&
    ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    ipv4[0] === 127;
}

export function getIdentityNotificationWorkerRequest(env = process.env) {
  const runtime = env.NODE_ENV;
  const authEnvironment = env.ROVA_AUTH_ENVIRONMENT;
  if (!["development", "test", "production"].includes(runtime)) {
    throw new Error("Identity notification worker runtime is not configured.");
  }
  if (
    authEnvironment !== undefined &&
    !["local", "staging", "production"].includes(authEnvironment)
  ) {
    throw new Error("Identity notification worker environment is not configured.");
  }
  if (
    runtime === "production" &&
    authEnvironment !== "staging" &&
    authEnvironment !== "production"
  ) {
    throw new Error("Identity notification worker environment is not configured.");
  }

  const baseUrl = env.IDENTITY_NOTIFICATION_WORKER_URL;
  const secret = env.IDENTITY_NOTIFICATION_WORKER_SECRET;
  if (!baseUrl || !secret || secret.length < WORKER_SECRET_LENGTH) {
    throw new Error("Identity notification worker is not configured.");
  }

  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("Identity notification worker URL is invalid.");
  }

  if (
    base.username ||
    base.password ||
    /^https?:\/\/[^/]*@/i.test(base.href) ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  ) {
    throw new Error("Identity notification worker URL is invalid.");
  }

  const localHttpAuthorized =
    (runtime === "development" || runtime === "test") &&
    authEnvironment === "local" &&
    isLoopbackHostname(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && localHttpAuthorized)) {
    throw new Error("Identity notification worker URL must use HTTPS.");
  }

  return {
    endpoint: new URL(WORKER_PATH, base),
    secret,
  };
}

export async function runIdentityNotificationProcessor({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const { endpoint, secret } = getIdentityNotificationWorkerRequest(env);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
  } catch {
    throw new Error("Identity notification processing request failed.");
  }

  if (!response.ok) {
    throw new Error(`Identity notification processing failed with status ${response.status}.`);
  }

  try {
    const result = await response.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("processed" in result) ||
      !Number.isSafeInteger(result.processed) ||
      result.processed < 0
    ) {
      throw new Error("Invalid worker response.");
    }
    return { processed: result.processed };
  } catch {
    throw new Error("Identity notification worker response was invalid.");
  }
}
