import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptIdentityNotificationPayload,
  encryptIdentityNotificationPayload,
} from "@/server/identity-notification-crypto";

beforeEach(() => {
  vi.stubEnv("IDENTITY_NOTIFICATION_ENCRYPTION_KEY_ID", "v1");
  vi.stubEnv("IDENTITY_NOTIFICATION_ENCRYPTION_KEY_v1", Buffer.alloc(32, 9).toString("base64url"));
  vi.stubEnv("IDENTITY_NOTIFICATION_ENCRYPTION_KEY_v2", Buffer.alloc(32, 4).toString("base64url"));
});

describe("identity outbox encryption", () => {
  it("encrypts recipient and bearer links with authenticated AES-GCM", () => {
    const payload = {
      recipient: "private@example.invalid",
      url: "https://rova.example/reset-password?token=plaintext-bearer",
    };
    const encrypted = encryptIdentityNotificationPayload(payload);
    expect(encrypted.encryptionKeyId).toBe("v1");
    expect(encrypted.encryptedPayload).not.toContain("private@example.invalid");
    expect(encrypted.encryptedPayload).not.toContain("plaintext-bearer");
    expect(decryptIdentityNotificationPayload("v1", encrypted.encryptedPayload!)).toEqual(payload);
  });

  it("rejects tampering and supports a retained previous key identifier", () => {
    vi.stubEnv("IDENTITY_NOTIFICATION_ENCRYPTION_KEY_ID", "v2");
    const encrypted = encryptIdentityNotificationPayload({ url: "bearer-test" });
    vi.stubEnv("IDENTITY_NOTIFICATION_ENCRYPTION_KEY_ID", "v1");
    expect(decryptIdentityNotificationPayload("v2", encrypted.encryptedPayload!)).toEqual({ url: "bearer-test" });

    const tampered = encrypted.encryptedPayload!.replace(/[A-Za-z0-9_-](?=[^.]*$)/, "0");
    expect(() => decryptIdentityNotificationPayload("v2", tampered)).toThrow();
  });
});
