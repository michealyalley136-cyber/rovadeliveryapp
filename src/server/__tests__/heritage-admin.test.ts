import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ getAuthorizedAdmin: mocks.authorize }));
vi.mock("@/server/db", () => ({ getDatabase: () => ({ heritageSettings: { findUnique: mocks.findUnique, upsert: mocks.upsert } }) }));
vi.mock("@/config/heritage-rotation", async () => import("../../config/heritage-rotation"));
import { GET, PUT } from "../../app/api/admin/heritage/route";

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/admin/heritage", { method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("heritage admin authorization", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("denies unauthenticated and non-admin roles", async () => {
    for (const role of [null, { role: "VIEW_ONLY" }, { role: "RECRUITMENT_AGENT" }]) {
      mocks.authorize.mockResolvedValue(role);
      expect((await GET()).status).toBe(403);
      expect((await PUT(request({ intervalMinutes: 180, disabledIds: [] }))).status).toBe(403);
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("accepts authorized updates and rejects invalid settings and cross-origin requests", async () => {
    mocks.authorize.mockResolvedValue({ role: "OPERATIONS_ADMIN" });
    expect((await PUT(request({ intervalMinutes: 0, disabledIds: [] }))).status).toBe(400);
    expect((await PUT(request({ intervalMinutes: 180, disabledIds: ["unknown"] }))).status).toBe(400);
    expect((await PUT(request({ intervalMinutes: 180, disabledIds: [] }, "https://other.example"))).status).toBe(403);
    expect((await PUT(request({ intervalMinutes: 60, disabledIds: ["arch"] }))).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { intervalMinutes: 60, disabledIds: ["arch"] } }));
  });
});
