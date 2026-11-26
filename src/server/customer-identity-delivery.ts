import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

type DeliveryMessage = {
  channel: "email" | "sms";
  recipient: string;
  kind: "activation" | "password-reset";
  url: string;
  expiresAt: Date;
  idempotencyKey?: string;
};

type ResolvedAddress = { address: string; family: number };

export class CustomerIdentityDeliveryError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
  }
}

function ipv4Parts(address: string) {
  return address.split(".").map(Number);
}

function ipv6Bytes(address: string) {
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const ipv4 = ipv4Parts(normalized.slice(separator + 1));
    normalized = `${normalized.slice(0, separator)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const [left, right = ""] = normalized.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const missingGroups = 8 - leftGroups.length - rightGroups.length;
  const groups = normalized.includes("::")
    ? [...leftGroups, ...Array(Math.max(missingGroups, 0)).fill("0"), ...rightGroups]
    : leftGroups;
  if (groups.length !== 8) return [];
  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

function isPrivateOrReservedAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [first, second, third] = ipv4Parts(address);
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 2) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 192 && second === 168) ||
      (first === 198 && (
        second === 18 ||
        second === 19 ||
        (second === 51 && third === 100)
      )) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224;
  }
  if (family === 6) {
    const bytes = ipv6Bytes(address);
    if (bytes.length !== 16) return true;
    const mappedIpv4 = bytes.slice(0, 10).every((byte) => byte === 0) &&
      bytes[10] === 0xff && bytes[11] === 0xff;
    if (mappedIpv4) return isPrivateOrReservedAddress(bytes.slice(12).join("."));

    const globalUnicast = (bytes[0] & 0xe0) === 0x20;
    const documentation = bytes[0] === 0x3f && bytes[1] === 0xff &&
      (bytes[2] & 0xf0) === 0;
    const special2001 = bytes[0] === 0x20 && bytes[1] === 0x01 && (
      (bytes[2] === 0 && bytes[3] <= 1) ||
      (bytes[2] === 0 && bytes[3] === 2 && bytes[4] === 0 && bytes[5] === 0) ||
      (bytes[2] === 0 && bytes[3] >= 0x10 && bytes[3] <= 0x2f) ||
      (bytes[2] === 0x0d && bytes[3] === 0xb8)
    );
    return !globalUnicast || documentation || special2001 ||
      (bytes[0] === 0x20 && bytes[1] === 0x02);
  }
  return true;
}

function isLoopbackAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return ipv4Parts(address)[0] === 127;
  if (family !== 6) return false;
  const bytes = ipv6Bytes(address);
  return bytes.length === 16 && (
    (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) ||
    (bytes.slice(0, 10).every((byte) => byte === 0) &&
      bytes[10] === 0xff && bytes[11] === 0xff && bytes[12] === 127)
  );
}

function deploymentEnvironment() {
  const runtime = process.env.NODE_ENV;
  const isLocalRuntime = runtime === "development" || runtime === "test";
  const environment = process.env.ROVA_AUTH_ENVIRONMENT ?? (isLocalRuntime ? "local" : undefined);
  if (
    (runtime !== "development" && runtime !== "test" && runtime !== "production") ||
    (environment !== "local" && environment !== "staging" && environment !== "production") ||
    (environment === "local" && !isLocalRuntime) ||
    (runtime === "development" && environment !== "local")
  ) {
    throw new Error("Customer identity delivery environment is not configured.");
  }
  return { environment, isLocalRuntime };
}

async function resolveCustomerIdentityDeliveryEndpoint(
  rawEndpoint: string,
  resolve: typeof lookup,
) {
  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new Error("Customer identity delivery webhook URL is invalid.");
  }
  const { environment, isLocalRuntime } = deploymentEnvironment();
  const local = environment === "local" && isLocalRuntime &&
    process.env.ROVA_AUTH_ENVIRONMENT === "local";
  const localHttp = local && endpoint.protocol === "http:";

  if (endpoint.username || endpoint.password) {
    throw new Error("Customer identity delivery webhook must not contain credentials.");
  }
  if (endpoint.protocol !== "https:" && !localHttp) {
    throw new Error("Customer identity delivery webhook must use HTTPS.");
  }
  if (endpoint.hash) {
    throw new Error("Customer identity delivery webhook URL must not contain a fragment.");
  }
  if (!local && (endpoint.hostname === "localhost" || endpoint.hostname.endsWith(".localhost"))) {
    throw new Error("Customer identity delivery webhook cannot use localhost.");
  }

  const hostname = endpoint.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  let addresses: ResolvedAddress[];
  try {
    addresses = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await resolve(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Customer identity delivery webhook destination could not be resolved.");
  }

  const localLoopback = local &&
    (hostname === "localhost" || (Boolean(literalFamily) && isLoopbackAddress(hostname))) &&
    addresses.every(({ address }) => isLoopbackAddress(address));

  if (addresses.length === 0 ||
      addresses.some(({ address, family }) => isIP(address) !== family) ||
      (!localLoopback && addresses.some(({ address }) => isPrivateOrReservedAddress(address))) ||
      (localHttp && !localLoopback)) {
    throw new Error("Customer identity delivery webhook must resolve only to public network addresses.");
  }

  return { endpoint, address: addresses[0] };
}

export async function validateCustomerIdentityDeliveryEndpoint(
  rawEndpoint: string,
  resolve: typeof lookup = lookup,
) {
  return (await resolveCustomerIdentityDeliveryEndpoint(rawEndpoint, resolve)).endpoint;
}

export async function deliverCustomerIdentityMessage(message: DeliveryMessage) {
  const endpoint = process.env.CUSTOMER_IDENTITY_DELIVERY_WEBHOOK_URL;
  const secret = process.env.CUSTOMER_IDENTITY_DELIVERY_SECRET;
  if (!endpoint || !secret || secret.length < 32) {
    throw new CustomerIdentityDeliveryError("Customer identity delivery provider is not configured.", true);
  }

  const { endpoint: validatedEndpoint, address } = await resolveCustomerIdentityDeliveryEndpoint(endpoint, lookup);
  const transport = validatedEndpoint.protocol === "https:" ? httpsRequest : httpRequest;
  const body = JSON.stringify({
    channel: message.channel,
    recipient: message.recipient,
    kind: message.kind,
    url: message.url,
    expiresAt: message.expiresAt.toISOString(),
  });

  let status: number;
  try {
    status = await new Promise<number>((resolve, reject) => {
      const request = transport(validatedEndpoint, {
        method: "POST",
        agent: false,
        family: address.family,
        ...(validatedEndpoint.protocol === "https:" ? { rejectUnauthorized: true } : {}),
        signal: AbortSignal.timeout(8_000),
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
        },
        lookup: (hostname, options, callback) => {
          if (hostname !== validatedEndpoint.hostname.replace(/^\[|\]$/g, "") ||
              (options.family && options.family !== address.family)) {
            callback(new Error("Customer identity delivery destination changed."), "", 0);
            return;
          }
          callback(
            null,
            options.all ? [{ address: address.address, family: address.family }] : address.address,
            address.family,
          );
        },
      }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      request.on("error", reject);
      request.end(body);
    });
  } catch {
    throw new CustomerIdentityDeliveryError("Customer identity delivery request failed.", false);
  }

  if (status >= 300 && status < 400) {
    throw new CustomerIdentityDeliveryError("Customer identity delivery redirects are not permitted.", true);
  }
  if (status < 200 || status >= 300) {
    throw new CustomerIdentityDeliveryError(
      "Customer identity provider rejected delivery.",
      status >= 400 && status < 500 && status !== 408 && status !== 429,
    );
  }
}
