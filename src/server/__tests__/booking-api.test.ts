import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingError } from "@/server/booking-errors";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  history: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/booking-api", async (original) => {
  const actual = await original<typeof import("@/server/booking-api")>();
  return {
    ...actual,
    authorizeBookingRequest: mocks.authorize,
  };
});
vi.mock("@/server/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) }));
vi.mock("@/server/booking-service", () => ({
  createBookingRequest: mocks.create,
  listBookingRequests: mocks.list,
  getBookingRequest: mocks.get,
  cancelBookingRequest: mocks.cancel,
  getBookingHistory: mocks.history,
}));

import { GET, POST } from "@/app/api/v1/bookings/route";
import { GET as getOne } from "@/app/api/v1/bookings/[bookingId]/route";
import { POST as cancelOne } from "@/app/api/v1/bookings/[bookingId]/cancel/route";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.authorize.mockResolvedValue({ id: "customer-1" });
});

describe("persistent booking API boundaries", () => {
  it("returns 401 for an anonymous request without querying booking data", async () => {
    mocks.authorize.mockRejectedValue(new BookingError("A verified customer session is required.", 401, "CUSTOMER_SESSION_REQUIRED"));
    const response = await GET(new Request("http://localhost/api/v1/bookings"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns 403 while the public booking gate is disabled", async () => {
    mocks.authorize.mockRejectedValue(new BookingError("Persistent customer bookings are not enabled.", 403, "BOOKING_GATE_DISABLED"));
    const response = await POST(new Request("http://localhost/api/v1/bookings", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("validates location and service input before creating anything", async () => {
    const response = await POST(new Request("http://localhost/api/v1/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: "FOOD",
        pickupName: "x",
        pickupLatitude: 120,
        pickupLongitude: 200,
        destinationName: "y",
        destinationLatitude: 120,
        destinationLongitude: 200,
        idempotencyKey: "short",
      }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 404 for an unowned identifier without revealing a reference", async () => {
    mocks.get.mockRejectedValue(new BookingError("Booking not found.", 404, "BOOKING_NOT_FOUND"));
    const response = await getOne(
      new Request("http://localhost/api/v1/bookings/private-booking"),
      { params: Promise.resolve({ bookingId: "private-booking" }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.get).toHaveBeenCalledWith("customer-1", "private-booking");
    expect(await response.json()).toEqual({
      error: "Booking not found.",
      code: "BOOKING_NOT_FOUND",
    });
  });

  it("surfaces cancellation conflicts without returning changed private data", async () => {
    mocks.cancel.mockRejectedValue(new BookingError("This booking can no longer be cancelled.", 409, "BOOKING_NOT_CANCELLABLE"));
    const response = await cancelOne(
      new Request("http://localhost/api/v1/bookings/booking-1/cancel", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ bookingId: "booking-1" }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "BOOKING_NOT_CANCELLABLE" });
  });
});
