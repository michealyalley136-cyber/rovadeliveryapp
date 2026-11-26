import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const enabled = process.env.RUN_BOOKING_DATABASE_TESTS === "true" && Boolean(connectionString);
const describeDatabase = enabled ? describe : describe.skip;
const testRun = randomUUID();
const customerAId = `booking-customer-a-${testRun}`;
const customerBId = `booking-customer-b-${testRun}`;
const suspendedId = `booking-suspended-${testRun}`;
const noRoleId = `booking-no-role-${testRun}`;
const userIds = [customerAId, customerBId, suspendedId, noRoleId];
let customerRoleId = "";
let createdCustomerRole = false;
let database: PrismaClient | undefined;
let bookingAId = "";
let bookingBId = "";

const cookieStore = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      get(name: string) {
        const value = values.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set(name: string, value: string) {
        values.set(name, value);
      },
      delete(name: string) {
        values.delete(name);
      },
    },
  };
});

const route = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore.store }));
vi.mock("@/server/maps/geoapify", () => ({
  GeoapifyRoutingProvider: class {
    route = route;
  },
}));

import { POST as createBookings } from "@/app/api/v1/bookings/route";
import { GET as listBookings } from "@/app/api/v1/bookings/route";
import { GET as getBooking } from "@/app/api/v1/bookings/[bookingId]/route";
import { GET as getBookingHistory } from "@/app/api/v1/bookings/[bookingId]/history/route";
import { POST as cancelBooking } from "@/app/api/v1/bookings/[bookingId]/cancel/route";
import {
  clearCustomerSession,
  createCustomerSession,
  createDemoSession,
} from "@/server/auth";
import { getDatabase } from "@/server/db";

function client() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
}

async function signInCustomer(id: string) {
  cookieStore.values.clear();
  const account = await getDatabase().user.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  });
  const role = await getDatabase().role.upsert({
    where: { key: "CUSTOMER" },
    create: { key: "CUSTOMER", name: "Customer" },
    update: {},
  });
  const hadRole = await getDatabase().userRole.findUnique({
    where: { userId_roleId: { userId: id, roleId: role.id } },
  });
  if (!hadRole) await getDatabase().userRole.create({ data: { userId: id, roleId: role.id } });
  if (account.status !== "ACTIVE") {
    await getDatabase().user.update({ where: { id }, data: { status: "ACTIVE" } });
  }
  await createCustomerSession(id);
  if (!hadRole) await getDatabase().userRole.delete({
    where: { userId_roleId: { userId: id, roleId: role.id } },
  });
  if (account.status !== "ACTIVE") {
    await getDatabase().user.update({ where: { id }, data: { status: account.status } });
  }
}

async function requestCreate(body: Record<string, unknown>) {
  return createBookings(new Request("http://localhost/api/v1/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "127.0.0.1",
    },
    body: JSON.stringify(body),
  }));
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function bookingInput(
  idempotencyKey: string,
  service: "RIDE" | "TAXI",
  overrides: Record<string, unknown> = {},
) {
  const motorcycle = service === "RIDE";
  return {
    service,
    pickupName: motorcycle ? "Kotoka Airport" : "Kumasi Central",
    pickupLatitude: motorcycle ? 5.6037 : 6.6885,
    pickupLongitude: motorcycle ? -0.187 : -1.6244,
    destinationName: motorcycle ? "Accra Mall" : "Kumasi Airport",
    destinationLatitude: motorcycle ? 5.617 : 6.713,
    destinationLongitude: motorcycle ? -0.174 : -1.5917,
    idempotencyKey,
    ...overrides,
  };
}

describeDatabase("isolated PostgreSQL booking integration", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "local");
    vi.stubEnv("AUTH_SECRET", "customer-003a-isolated-test-signing-secret");
    vi.stubEnv("ROVA_DEMO_MODE", "true");
    vi.stubEnv("CUSTOMER_RIDES_ENABLED", "true");

    route.mockImplementation(async (
      start: { latitude: number; longitude: number },
      end: { latitude: number; longitude: number },
      profile: "MOTORCYCLE" | "DRIVING",
    ) => ({
      geometry: {
        type: "LineString",
        coordinates: [
          [start.longitude, start.latitude],
          [end.longitude, end.latitude],
        ],
      },
      distanceMeters: profile === "MOTORCYCLE" ? 4100 : 8900,
      durationSeconds: profile === "MOTORCYCLE" ? 713 : 1210,
      start,
      end,
      profile,
      provider: "ControlledIntegrationFixture",
    }));

    database = client();
    const existingRole = await database.role.findUnique({ where: { key: "CUSTOMER" } });
    createdCustomerRole = !existingRole;
    const customerRole = await database.role.upsert({
      where: { key: "CUSTOMER" },
      create: { key: "CUSTOMER", name: "Customer" },
      update: {},
    });
    customerRoleId = customerRole.id;

    await database.$transaction(async (transaction) => {
      await transaction.user.createMany({
        data: [
          {
            id: customerAId,
            phone: `integration-a-${testRun}`,
            passwordHash: "not-used-in-integration-test",
            fullName: "Integration Customer A",
            status: "ACTIVE",
          },
          {
            id: customerBId,
            phone: `integration-b-${testRun}`,
            passwordHash: "not-used-in-integration-test",
            fullName: "Integration Customer B",
            status: "ACTIVE",
          },
          {
            id: suspendedId,
            phone: `integration-suspended-${testRun}`,
            passwordHash: "not-used-in-integration-test",
            fullName: "Suspended Integration Customer",
            status: "SUSPENDED",
          },
          {
            id: noRoleId,
            phone: `integration-no-role-${testRun}`,
            passwordHash: "not-used-in-integration-test",
            fullName: "No-role Integration Customer",
            status: "ACTIVE",
          },
        ],
      });
      await transaction.userRole.createMany({
        data: [
          { userId: customerAId, roleId: customerRoleId },
          { userId: customerBId, roleId: customerRoleId },
          { userId: suspendedId, roleId: customerRoleId },
        ],
      });
    });
  });

  afterAll(async () => {
    if (!database) return;
    const databaseClient = database;
    const bookings = await databaseClient.bookingRequest.findMany({
      where: { customerId: { in: userIds } },
      select: { id: true },
    });
    await databaseClient.bookingRequestStatusHistory.deleteMany({
      where: { bookingRequestId: { in: bookings.map((booking) => booking.id) } },
    });
    await databaseClient.bookingRequest.deleteMany({ where: { customerId: { in: userIds } } });
    await databaseClient.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await databaseClient.user.deleteMany({ where: { id: { in: userIds } } });
    if (createdCustomerRole) {
      await databaseClient.role.deleteMany({ where: { id: customerRoleId, users: { none: {} } } });
    }
    await databaseClient.$disconnect();
    vi.unstubAllEnvs();
  });

  it("enforces the disabled gate, separate sessions, ACTIVE status and CUSTOMER role", async () => {
    vi.stubEnv("CUSTOMER_RIDES_ENABLED", "false");
    await signInCustomer(customerAId);
    const gated = await requestCreate(bookingInput(`gate-${testRun}`, "RIDE"));
    expect(gated.status).toBe(403);
    expect(await json(gated)).toMatchObject({ code: "BOOKING_GATE_DISABLED" });

    vi.stubEnv("CUSTOMER_RIDES_ENABLED", "true");
    cookieStore.values.clear();
    const anonymous = await requestCreate(bookingInput(`anon-${testRun}`, "RIDE"));
    expect(anonymous.status).toBe(401);
    expect(await json(anonymous)).toMatchObject({ code: "CUSTOMER_SESSION_REQUIRED" });

    await createDemoSession("CUSTOMER");
    const demo = await requestCreate(bookingInput(`demo-${testRun}`, "RIDE"));
    expect(demo.status).toBe(401);
    expect(await json(demo)).toMatchObject({ code: "CUSTOMER_SESSION_REQUIRED" });

    await signInCustomer(noRoleId);
    const noRole = await requestCreate(bookingInput(`no-role-${testRun}`, "RIDE"));
    expect(noRole.status).toBe(403);
    expect(await json(noRole)).toMatchObject({ code: "CUSTOMER_ROLE_REQUIRED" });

    await signInCustomer(suspendedId);
    const suspended = await requestCreate(bookingInput(`suspended-${testRun}`, "RIDE"));
    expect(suspended.status).toBe(403);
    expect(await json(suspended)).toMatchObject({ code: "ACCOUNT_INACTIVE" });
  });

  it("creates independent motorcycle and taxi bookings with verified profiles", async () => {
    await signInCustomer(customerAId);
    const customerAKey = `customer-a-${testRun}`;
    const duplicates = await Promise.all([
      requestCreate(bookingInput(customerAKey, "RIDE")),
      requestCreate(bookingInput(customerAKey, "RIDE")),
    ]);
    expect(duplicates.map((response) => response.status).sort()).toEqual([200, 201]);
    const duplicateBodies = await Promise.all(duplicates.map(json));
    const motorcycle = duplicateBodies[0].booking as Record<string, unknown>;
    const motorcycle2 = duplicateBodies[1].booking as Record<string, unknown>;
    expect(motorcycle.id).toBe(motorcycle2.id);
    expect(motorcycle.reference).toMatch(/^ROVA-\d{8}-[A-F0-9]{8}$/);
    expect(motorcycle).toMatchObject({
      service: "RIDE",
      routingProfile: "MOTORCYCLE",
      status: "REQUESTED",
      routeDistanceMeters: 4100,
      routeDurationSeconds: 713,
    });
    bookingAId = String(motorcycle.id);

    await signInCustomer(customerBId);
    const taxiResponse = await requestCreate(bookingInput(`customer-b-${testRun}`, "TAXI"));
    expect(taxiResponse.status).toBe(201);
    const taxi = (await json(taxiResponse)).booking as Record<string, unknown>;
    expect(taxi).toMatchObject({
      service: "TAXI",
      routingProfile: "DRIVING",
      routeDistanceMeters: 8900,
      routeDurationSeconds: 1210,
    });
    expect(taxi.reference).not.toBe(motorcycle.reference);
    bookingBId = String(taxi.id);

    const firstReference = String(motorcycle.reference);
    await expect(database!.bookingRequest.count({
      where: { reference: firstReference },
    })).resolves.toBe(1);
  });

  it("rejects invalid services, invalid/out-of-zone coordinates and idempotency conflicts before persistence", async () => {
    await signInCustomer(customerAId);
    const invalidService = await requestCreate(bookingInput(`invalid-service-${testRun}`, "RIDE", {
      service: "FOOD",
    }));
    expect(invalidService.status).toBe(400);

    const invalidCoordinate = await requestCreate(bookingInput(`invalid-coordinate-${testRun}`, "RIDE", {
      pickupLatitude: 91,
    }));
    expect(invalidCoordinate.status).toBe(400);

    const outOfGhana = await requestCreate(bookingInput(`outside-${testRun}`, "RIDE", {
      pickupLatitude: 51.5072,
      pickupLongitude: -0.1276,
    }));
    expect(outOfGhana.status).toBe(400);
    expect(await json(outOfGhana)).toMatchObject({ code: "OUTSIDE_SERVICE_AREA" });

    const conflict = await requestCreate(bookingInput(`customer-a-${testRun}`, "RIDE", {
      destinationName: "A changed destination",
    }));
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const attempts = await database!.bookingRequest.count({
      where: { customerId: customerAId },
    });
    expect(attempts).toBe(1);
  });

  it("retrieves the same owned booking from a fresh authenticated session and fresh Prisma client", async () => {
    await clearCustomerSession();
    await createCustomerSession(customerAId);
    const response = await getBooking(
      new Request(`http://localhost/api/v1/bookings/${bookingAId}`),
      { params: Promise.resolve({ bookingId: bookingAId }) },
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      booking: { id: bookingAId, status: "REQUESTED" },
    });

    const freshDatabase = client();
    try {
      const persisted = await freshDatabase.bookingRequest.findFirst({
        where: { id: bookingAId, customerId: customerAId },
      });
      expect(persisted).toMatchObject({ id: bookingAId, service: "RIDE", status: "REQUESTED" });
    } finally {
      await freshDatabase.$disconnect();
    }
  });

  it("prevents Customer B from reading, cancelling or using Customer A's history cursor", async () => {
    await signInCustomer(customerBId);
    const ownedList = await listBookings(new Request("http://localhost/api/v1/bookings?limit=30"));
    expect(ownedList.status).toBe(200);
    const page = await json(ownedList);
    expect((page.bookings as Array<Record<string, unknown>>).map((booking) => booking.id)).toEqual([bookingBId]);

    const detail = await getBooking(
      new Request(`http://localhost/api/v1/bookings/${bookingAId}`),
      { params: Promise.resolve({ bookingId: bookingAId }) },
    );
    expect(detail.status).toBe(404);

    const cancellation = await cancelBooking(
      new Request(`http://localhost/api/v1/bookings/${bookingAId}/cancel`, {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ bookingId: bookingAId }) },
    );
    expect(cancellation.status).toBe(404);

    const foreignCursor = await listBookings(new Request(
      `http://localhost/api/v1/bookings?limit=1&cursor=${encodeURIComponent(bookingAId)}`,
    ));
    expect(foreignCursor.status).toBe(400);
    expect(await json(foreignCursor)).toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("supports stable account-scoped pagination", async () => {
    await signInCustomer(customerAId);
    for (let index = 0; index < 3; index += 1) {
      const response = await requestCreate(bookingInput(`pagination-${index}-${testRun}`, "RIDE", {
        destinationName: `Pagination destination ${index}`,
      }));
      expect(response.status).toBe(201);
    }

    const first = await listBookings(new Request("http://localhost/api/v1/bookings?limit=2"));
    const firstPage = await json(first);
    const firstIds = (firstPage.bookings as Array<Record<string, unknown>>).map((booking) => booking.id);
    expect(firstIds).toHaveLength(2);
    expect(firstPage.nextCursor).toBe(firstIds.at(-1));

    const second = await listBookings(new Request(
      `http://localhost/api/v1/bookings?limit=2&cursor=${encodeURIComponent(String(firstPage.nextCursor))}`,
    ));
    const secondPage = await json(second);
    const secondIds = (secondPage.bookings as Array<Record<string, unknown>>).map((booking) => booking.id);
    expect(secondIds).toHaveLength(2);
    expect(secondIds.every((id) => !firstIds.includes(id))).toBe(true);
    expect(secondIds).toContain(bookingAId);
    expect(secondIds.every((id) => id !== bookingBId)).toBe(true);
  });

  it("allows exactly one concurrent cancellation and persists one cancellation history entry", async () => {
    await signInCustomer(customerAId);
    const request = () => cancelBooking(
      new Request(`http://localhost/api/v1/bookings/${bookingAId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Customer changed plans." }),
      }),
      { params: Promise.resolve({ bookingId: bookingAId }) },
    );
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const history = await getBookingHistory(
      new Request(`http://localhost/api/v1/bookings/${bookingAId}/history`),
      { params: Promise.resolve({ bookingId: bookingAId }) },
    );
    expect(history.status).toBe(200);
    const historyEntries = (await json(history)).history as Array<Record<string, unknown>>;
    expect(historyEntries).toHaveLength(2);
    expect(historyEntries.map((entry) => entry.newStatus)).toEqual(["REQUESTED", "CANCELLED"]);
    expect(historyEntries[1]).toMatchObject({
      previousStatus: "REQUESTED",
      reason: "Customer changed plans.",
    });

    const persisted = await database!.bookingRequest.findUniqueOrThrow({
      where: { id: bookingAId },
      select: { status: true, cancelledAt: true, cancellationReason: true },
    });
    expect(persisted.status).toBe("CANCELLED");
    expect(persisted.cancelledAt).toBeInstanceOf(Date);
    expect(persisted.cancellationReason).toBe("Customer changed plans.");
  });

  it("proves PostgreSQL uniqueness, foreign-key and supported-service constraints", async () => {
    const original = await database!.bookingRequest.findUniqueOrThrow({ where: { id: bookingBId } });
    await expect(database!.bookingRequest.create({
      data: {
        reference: original.reference,
        customerId: customerAId,
        service: "RIDE",
        pickupName: "Duplicate reference test",
        pickupLatitude: 5.6037,
        pickupLongitude: -0.187,
        destinationName: "Constraint destination",
        destinationLatitude: 5.617,
        destinationLongitude: -0.174,
        routeDistanceMeters: 1,
        routeDurationSeconds: 1,
        routingProvider: "ConstraintTest",
        routingProfile: "MOTORCYCLE",
        routeCalculatedAt: new Date(),
        routeMetadata: {},
        idempotencyKey: `duplicate-ref-${testRun}`,
        requestFingerprint: `duplicate-ref-fingerprint-${testRun}`,
      },
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");

    await expect(database!.bookingRequest.create({
      data: {
        reference: `constraint-missing-user-${testRun}`,
        customerId: `missing-${testRun}`,
        service: "RIDE",
        pickupName: "Missing user test",
        pickupLatitude: 5.6037,
        pickupLongitude: -0.187,
        destinationName: "Constraint destination",
        destinationLatitude: 5.617,
        destinationLongitude: -0.174,
        routeDistanceMeters: 1,
        routeDurationSeconds: 1,
        routingProvider: "ConstraintTest",
        routingProfile: "MOTORCYCLE",
        routeCalculatedAt: new Date(),
        routeMetadata: {},
        idempotencyKey: `missing-user-${testRun}`,
        requestFingerprint: `missing-user-fingerprint-${testRun}`,
      },
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003");

    await expect(database!.$executeRawUnsafe(
      `INSERT INTO "BookingRequest"
        ("id","reference","customerId","service","status","pickupName","pickupLatitude","pickupLongitude",
         "destinationName","destinationLatitude","destinationLongitude","routeDistanceMeters","routeDurationSeconds",
         "routingProvider","routingProfile","routeCalculatedAt","routeMetadata","idempotencyKey","requestFingerprint",
         "createdAt","updatedAt")
       VALUES ($1,$2,$3,'FOOD'::"ServiceType",'REQUESTED'::"BookingRequestStatus",'x',5,-0.1,'y',5,-0.1,1,1,
         'ConstraintTest','MOTORCYCLE',NOW(),'{}'::jsonb,$4,$5,NOW(),NOW())`,
      `bad-service-${testRun}`,
      `bad-service-reference-${testRun}`,
      customerAId,
      `bad-service-key-${testRun}`,
      `bad-service-fingerprint-${testRun}`,
    )).rejects.toSatisfy((error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      JSON.stringify(error.meta).includes("23514"));

    await expect(database!.user.delete({ where: { id: customerBId } })).rejects.toSatisfy((error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003");
  });

  it("keeps demo and simulated-dispatch storage separate from persistent requests", async () => {
    const [bookingCount, tripCount, simulatedCount] = await Promise.all([
      database!.bookingRequest.count({ where: { customerId: { in: userIds } } }),
      database!.trip.count({ where: { customerId: { in: userIds } } }),
      database!.simulatedRide.count({ where: { customerId: { in: userIds } } }),
    ]);
    expect(bookingCount).toBe(5);
    expect(tripCount).toBe(0);
    expect(simulatedCount).toBe(0);
    expect(getDatabase()).toBeDefined();
  });
});
