import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingInput } from "@/server/booking-types";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  route: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDatabase: mocks.database }));
vi.mock("@/server/maps/geoapify", () => ({
  GeoapifyRoutingProvider: class {
    route = mocks.route;
  },
}));

import {
  cancelBookingRequest,
  createBookingRequest,
  getBookingRequest,
  listBookingRequests,
  requireBookingCustomer,
} from "@/server/booking-service";

const input: BookingInput = {
  service: "RIDE",
  pickupName: "Kotoka Airport",
  pickupLatitude: 5.6037,
  pickupLongitude: -0.187,
  pickupInstructions: "Meet at Terminal 3",
  destinationName: "Accra Mall",
  destinationLatitude: 5.617,
  destinationLongitude: -0.174,
  idempotencyKey: "isolated-booking-key-001",
};

const route = {
  geometry: { type: "LineString", coordinates: [[-0.187, 5.6037], [-0.174, 5.617]] },
  distanceMeters: 4100.4,
  durationSeconds: 713.2,
  start: { latitude: input.pickupLatitude, longitude: input.pickupLongitude },
  end: { latitude: input.destinationLatitude, longitude: input.destinationLongitude },
  profile: "MOTORCYCLE",
  provider: "Geoapify",
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    reference: "ROVA-20261123-AB12CD34",
    customerId: "customer-1",
    service: "RIDE",
    status: "REQUESTED",
    pickupName: input.pickupName,
    pickupLatitude: input.pickupLatitude,
    pickupLongitude: input.pickupLongitude,
    pickupInstructions: input.pickupInstructions,
    destinationName: input.destinationName,
    destinationLatitude: input.destinationLatitude,
    destinationLongitude: input.destinationLongitude,
    routeDistanceMeters: 4100,
    routeDurationSeconds: 713,
    routingProvider: "Geoapify",
    routingProfile: "MOTORCYCLE",
    routeCalculatedAt: new Date("2026-11-23T00:00:00.000Z"),
    cancellationReason: null,
    cancelledAt: null,
    createdAt: new Date("2026-11-23T00:00:00.000Z"),
    updatedAt: new Date("2026-11-23T00:00:00.000Z"),
    requestFingerprint: "fingerprint",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.database.mockReset();
  mocks.route.mockReset();
  mocks.route.mockResolvedValue(route);
});

describe("verified customer booking policy", () => {
  it("requires an ACTIVE database user with the CUSTOMER role", async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce({ id: "customer-1", status: "ACTIVE", roles: [{ roleId: "customer-role" }] })
      .mockResolvedValueOnce({ id: "customer-1", status: "SUSPENDED", roles: [{ roleId: "customer-role" }] })
      .mockResolvedValueOnce({ id: "customer-1", status: "ACTIVE", roles: [] });
    mocks.database.mockReturnValue({ user: { findUnique } });

    await expect(requireBookingCustomer("customer-1")).resolves.toEqual({ id: "customer-1" });
    await expect(requireBookingCustomer("customer-1")).rejects.toMatchObject({ status: 403, code: "ACCOUNT_INACTIVE" });
    await expect(requireBookingCustomer("customer-1")).rejects.toMatchObject({ status: 403, code: "CUSTOMER_ROLE_REQUIRED" });
  });

  it("returns 404-style not found for another customer's booking", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    mocks.database.mockReturnValue({ bookingRequest: { findFirst } });

    await expect(getBookingRequest("customer-2", "booking-1")).rejects.toMatchObject({
      status: 404,
      code: "BOOKING_NOT_FOUND",
    });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "booking-1", customerId: "customer-2" },
    }));
  });
});

describe("booking creation", () => {
  it.each([
    ["RIDE", "MOTORCYCLE"],
    ["TAXI", "DRIVING"],
  ] as const)("verifies %s with the fixed %s provider profile", async (service, profile) => {
    const selectedRoute = { ...route, profile };
    mocks.route.mockResolvedValue(selectedRoute);
    const createdData: Array<Record<string, unknown>> = [];
    const transaction = {
      bookingRequest: {
        create: vi.fn(async ({ data }) => {
          createdData.push(data);
          return record({ ...data, service, routingProfile: profile });
        }),
      },
    };
    const database = {
      bookingRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    mocks.database.mockReturnValue(database);

    const result = await createBookingRequest("customer-1", { ...input, service });
    expect(result.created).toBe(true);
    expect(mocks.route).toHaveBeenCalledWith(expect.anything(), expect.anything(), profile, undefined);
    expect(createdData[0]).toMatchObject({
      service,
      routingProfile: profile,
      customerId: "customer-1",
      routeDistanceMeters: 4100,
      routeDurationSeconds: 713,
    });
    expect(createdData[0]).not.toHaveProperty("estimatedFarePesewas");
  });

  it("returns the original booking for duplicate idempotent submissions", async () => {
    let stored: ReturnType<typeof record> | null = null;
    const transaction = {
      bookingRequest: {
        create: vi.fn(async ({ data }) => {
          stored = record(data);
          return stored;
        }),
      },
    };
    const database = {
      bookingRequest: {
        findUnique: vi.fn(async ({ select }) => {
          if (!stored) return null;
          if ("requestFingerprint" in select && Object.keys(select).length === 1) return { requestFingerprint: stored.requestFingerprint };
          return stored;
        }),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    mocks.database.mockReturnValue(database);

    const first = await createBookingRequest("customer-1", input);
    const second = await createBookingRequest("customer-1", input);
    expect(first.booking.id).toBe(second.booking.id);
    expect(second.created).toBe(false);
    expect(transaction.bookingRequest.create).toHaveBeenCalledTimes(1);
    expect(mocks.route).toHaveBeenCalledTimes(1);
  });

  it("does not call routing or persistence for an out-of-zone point", async () => {
    const database = { bookingRequest: { findUnique: vi.fn() }, $transaction: vi.fn() };
    mocks.database.mockReturnValue(database);
    await expect(createBookingRequest("customer-1", {
      ...input,
      pickupLatitude: 51.5072,
      pickupLongitude: -0.1276,
    })).rejects.toMatchObject({ status: 400, code: "OUTSIDE_SERVICE_AREA" });
    expect(mocks.route).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("does not create a booking when the route provider fails", async () => {
    mocks.route.mockRejectedValue(new Error("provider unavailable"));
    const database = {
      bookingRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    mocks.database.mockReturnValue(database);

    await expect(createBookingRequest("customer-1", input)).rejects.toThrow("provider unavailable");
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

describe("booking lifecycle and history", () => {
  it("uses an ownership-scoped stable history cursor", async () => {
    const records = [record({ id: "b-2" }), record({ id: "b-1" })];
    const findFirst = vi.fn().mockResolvedValue({ id: "anchor", createdAt: records[0].createdAt });
    const findMany = vi.fn().mockResolvedValue(records);
    mocks.database.mockReturnValue({ bookingRequest: { findFirst, findMany } });

    const page = await listBookingRequests("customer-1", "anchor", 1);
    expect(page.bookings.map((booking) => booking.id)).toEqual(["b-2"]);
    expect(page.nextCursor).toBe("b-2");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "anchor", customerId: "customer-1" },
    }));
  });

  it("permits only one concurrent cancellation to transition REQUESTED", async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const transaction = {
      bookingRequest: {
        updateMany,
        findFirst: vi.fn().mockResolvedValue({ status: "CANCELLED" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(record({
          status: "CANCELLED",
          cancellationReason: null,
          cancelledAt: new Date("2026-11-23T00:01:00.000Z"),
        })),
      },
      bookingRequestStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    mocks.database.mockReturnValue({
      $transaction: vi.fn(async (callback) => callback(transaction)),
    });

    const [first, second] = await Promise.allSettled([
      cancelBookingRequest("customer-1", "booking-1"),
      cancelBookingRequest("customer-1", "booking-1"),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(second).toEqual(expect.objectContaining({
      status: "rejected",
      reason: expect.objectContaining({ status: 409, code: "BOOKING_NOT_CANCELLABLE" }),
    }));
    expect(transaction.bookingRequestStatusHistory.create).toHaveBeenCalledTimes(1);
  });
});
