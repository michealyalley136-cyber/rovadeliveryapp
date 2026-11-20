import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn().mockResolvedValue([]),
  count: vi.fn().mockResolvedValue(0),
  groupBy: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/admin-auth", () => ({ getAuthorizedAdmin: async () => ({ role: "SUPER_ADMIN" }) }));
vi.mock("@/server/db", () => ({ getDatabase: () => ({ application: mocks }) }));
vi.mock("@/config/application-types", async () => import("../../config/application-types"));

import { GET } from "../../app/api/admin/applications/route";

describe("customer registration administration", () => {
  it("accepts CUSTOMER as a distinct application filter", async () => {
    const response = await GET(new Request("http://localhost/api/admin/applications?type=CUSTOMER"));

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: "CUSTOMER" }),
    }));
  });
});
