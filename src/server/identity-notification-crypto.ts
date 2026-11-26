import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const activeKeyId = () => process.env.IDENTITY_NOTIFICATION_ENCRYPTION_KEY_ID ?? "v1";

function encryptionKey(keyId: string) {
  const encoded = process.env[`IDENTITY_NOTIFICATION_ENCRYPTION_KEY_${keyId}`]
    ?? (keyId === "v1" ? process.env.IDENTITY_NOTIFICATION_ENCRYPTION_KEY : undefined);
  if (!encoded) throw new Error("Identity notification encryption key is not configured.");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("Identity notification encryption key must be 32 bytes.");
  return key;
}

export function encryptIdentityNotificationPayload(value: unknown) {
  const keyId = activeKeyId();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyId), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    encryptionKeyId: keyId,
    encryptedPayload: `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`,
  };
}

export function decryptIdentityNotificationPayload<T>(
  keyId: string,
  encryptedPayload: string,
) {
  const parts = encryptedPayload.split(".");
  if (parts.length !== 3) throw new Error("Encrypted notification payload is invalid.");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyId), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
