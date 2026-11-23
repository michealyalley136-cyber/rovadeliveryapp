import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  route: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/maps/auth", () => ({ requireCustomerMapAccess: vi.fn() }));
vi.mock("@/server/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/server/maps/geoapify", () => ({
  GeoapifyRoutingProvider: class {
    route = mocks.route;
  },
}));

import { POST } from "@/app/api/maps/route/[service]/route";

const body = JSON.stringify({
  pickup: { longitude: -0.187, latitude: 5.6037 },
  destination: { longitude: -0.0167, latitude: 5.6698 },
});

describe("service-specific map routing", () => {
  beforeEach(() => {
    mocks.route.mockReset();
    mocks.route.mockResolvedValue({
      geometry: { type: "LineString", coordinates: [[-0.187, 5.6037], [-0.0167, 5.6698]] },
      distanceMeters: 23000,
      durationSeconds: 1800,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["RIDE", "MOTORCYCLE"],
    ["TAXI", "DRIVING"],
  ] as const)("derives the %s profile on the server", async (service, expectedProfile) => {
    const response = await POST(new Request(`http://localhost/api/maps/route/${service}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }), { params: Promise.resolve({ service }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ service });
    expect(mocks.route).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expectedProfile,
      expect.anything(),
    );
  });

  it("rejects unsupported service paths before requesting a route", async () => {
    const response = await POST(new Request("http://localhost/api/maps/route/UNKNOWN", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }), { params: Promise.resolve({ service: "UNKNOWN" }) });
    expect(response.status).toBe(400);
    expect(mocks.route).not.toHaveBeenCalled();
  });
});
