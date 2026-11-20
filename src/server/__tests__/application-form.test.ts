import { beforeEach, describe, expect, it, vi } from "vitest";
import { applicationFields, applicationTypes } from "../../config/application-types";

const mocks = vi.hoisted(() => ({
  createApplication: vi.fn(),
}));

vi.mock("@/server/application-service", () => ({ createApplication: mocks.createApplication }));
vi.mock("@/server/feature-flags", () => ({ isApplicationEnabled: () => true }));
vi.mock("@/server/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/config/application-types", async () => import("../../config/application-types"));
vi.mock("@/server/phone", async () => import("../phone"));

import { POST } from "../../app/api/applications/route";

function request(body: unknown) {
  return new Request("http://localhost/api/applications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("application form API compatibility", () => {
  beforeEach(() => {
    mocks.createApplication.mockReset();
    mocks.createApplication.mockResolvedValue({ reference: "ROVA-TEST-000001" });
  });

  it.each(applicationTypes)("accepts existing required and optional questions for %s", async (type) => {
    const data = Object.fromEntries(applicationFields[type].map((field) => [
      field.name,
      field.kind === "select" ? field.options?.[0] : "Example",
    ]));
    const response = await POST(request({
      type, firstName: "Test", lastName: "Applicant", phone: "0241234567", city: "Accra", consent: true, data,
    }));

    expect(response.status).toBe(201);
    expect(mocks.createApplication).toHaveBeenCalledWith(expect.objectContaining({ type, data }));
  });

  it("still rejects unexpected fields and invalid options", async () => {
    const base = { type: "MOTORCYCLE_RIDER", firstName: "Test", lastName: "Applicant", phone: "0241234567", city: "Accra", consent: true };
    expect((await POST(request({ ...base, data: { unexpected: "value" } }))).status).toBe(400);
    expect((await POST(request({ ...base, data: { region: "not a region" } }))).status).toBe(400);
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });
});
