import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function createSecurityToken() {
  return randomBytes(32).toString("base64url");
}

export function securityTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function recipientDigest(value: string) {
  return createHash("sha256").update(value.toLocaleLowerCase("en"), "utf8").digest("hex");
}

export function auditValueHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
