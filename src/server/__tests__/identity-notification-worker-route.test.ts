import { beforeEach, describe, expect, it, vi } from "vitest";

const process = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/server/identity-notification-worker", () => ({
  processIdentityNotifications: process,
}));

import { POST } from "@/app/api/internal/identity-notifications/process/route";

const secret = "identity-worker-secret-for-isolated-tests";

beforeEach(() => {
  vi.stubEnv("IDENTITY_NOTIFICATION_WORKER_SECRET", secret);
  process.mockReset();
  process.mockResolvedValue([]);
});

describe("identity notification worker endpoint", () => {
  it("requires the configured worker bearer secret", async () => {
    const anonymous = await POST(new Request("http://localhost/api/internal/identity-notifications/process", {
      method: "POST",
    }));
    expect(anonymous.status).toBe(401);
    expect(process).not.toHaveBeenCalled();
  });

  it("bounds processing and returns only safe outcome counts", async () => {
    process.mockResolvedValue([
      { id: "job-private", status: "DELIVERED" },
      { id: "job-private-2", status: "FAILED" },
    ]);
    const response = await POST(new Request("http://localhost/api/internal/identity-notifications/process", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: 2,
      outcomes: ["DELIVERED", "FAILED"],
    });
    expect(process).toHaveBeenCalledWith({ limit: 25 });
  });
});
