import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { isWithinGhana } from "@/lib/maps/ghana";
import { BookingError } from "@/server/booking-errors";
import type { BookingDto, BookingHistoryItem, BookingInput } from "@/server/booking-types";
import { getDatabase } from "@/server/db";
import { GeoapifyRoutingProvider } from "@/server/maps/geoapify";
import type { RouteProfile } from "@/lib/maps/types";

const bookingSelect = {
  id: true,
  reference: true,
  customerId: true,
  service: true,
  status: true,
  pickupName: true,
  pickupLatitude: true,
  pickupLongitude: true,
  pickupInstructions: true,
  destinationName: true,
  destinationLatitude: true,
  destinationLongitude: true,
  routeDistanceMeters: true,
  routeDurationSeconds: true,
  routingProvider: true,
  routingProfile: true,
  routeCalculatedAt: true,
  cancellationReason: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type BookingRecord = Prisma.BookingRequestGetPayload<{ select: typeof bookingSelect }>;

function profileFor(service: BookingInput["service"]): RouteProfile {
  return service === "RIDE" ? "MOTORCYCLE" : "DRIVING";
}

function requestFingerprint(input: BookingInput) {
  return createHash("sha256").update(JSON.stringify([
    input.service,
    input.pickupName,
    input.pickupLatitude,
    input.pickupLongitude,
    input.pickupInstructions ?? "",
    input.destinationName,
    input.destinationLatitude,
    input.destinationLongitude,
  ])).digest("hex");
}

function reference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `ROVA-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function dto(booking: BookingRecord): BookingDto {
  return {
    ...booking,
    service: booking.service as BookingInput["service"],
    status: booking.status,
    pickupLatitude: Number(booking.pickupLatitude),
    pickupLongitude: Number(booking.pickupLongitude),
    destinationLatitude: Number(booking.destinationLatitude),
    destinationLongitude: Number(booking.destinationLongitude),
    routingProfile: booking.routingProfile as "MOTORCYCLE" | "DRIVING",
    routeCalculatedAt: booking.routeCalculatedAt.toISOString(),
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

export async function requireBookingCustomer(sessionId: string) {
  const user = await getDatabase().user.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      roles: { where: { role: { key: "CUSTOMER" } }, select: { roleId: true }, take: 1 },
    },
  });
  if (!user) throw new BookingError("The customer account is not available.", 401, "ACCOUNT_UNAVAILABLE");
  if (user.status !== "ACTIVE") {
    throw new BookingError("This customer account is not active.", 403, "ACCOUNT_INACTIVE");
  }
  if (!user.roles.length) {
    throw new BookingError("This account is not authorized to make customer bookings.", 403, "CUSTOMER_ROLE_REQUIRED");
  }
  return { id: user.id };
}

export async function createBookingRequest(customerId: string, input: BookingInput, signal?: AbortSignal) {
  const pickup = { latitude: input.pickupLatitude, longitude: input.pickupLongitude };
  const destination = { latitude: input.destinationLatitude, longitude: input.destinationLongitude };
  if (!isWithinGhana(pickup) || !isWithinGhana(destination)) {
    throw new BookingError("Both locations must be within the ROVA Ghana service area.", 400, "OUTSIDE_SERVICE_AREA");
  }

  const fingerprint = requestFingerprint(input);
  const database = getDatabase();
  const existing = await database.bookingRequest.findUnique({
    where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } },
    select: bookingSelect,
  });
  if (existing) {
    if (await database.bookingRequest.findUnique({
      where: { id: existing.id },
      select: { requestFingerprint: true },
    }).then((record) => record?.requestFingerprint) !== fingerprint) {
      throw new BookingError("That idempotency key was already used for a different journey.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { booking: dto(existing), created: false };
  }

  const route = await new GeoapifyRoutingProvider().route(pickup, destination, profileFor(input.service), signal);
  if (
    route.profile !== profileFor(input.service) ||
    route.start.latitude !== pickup.latitude || route.start.longitude !== pickup.longitude ||
    route.end.latitude !== destination.latitude || route.end.longitude !== destination.longitude
  ) {
    throw new BookingError("The route did not match the selected locations and service.", 502, "ROUTE_MISMATCH");
  }
  const routeCalculatedAt = new Date();
  const metadata = {
    provider: route.provider,
    profile: route.profile,
    routePointCount: route.geometry.coordinates.length,
  };

  try {
    const booking = await database.$transaction(async (transaction) => {
      const created = await transaction.bookingRequest.create({
        data: {
          reference: reference(),
          customerId,
          service: input.service,
          pickupName: input.pickupName,
          pickupLatitude: input.pickupLatitude,
          pickupLongitude: input.pickupLongitude,
          pickupInstructions: input.pickupInstructions,
          destinationName: input.destinationName,
          destinationLatitude: input.destinationLatitude,
          destinationLongitude: input.destinationLongitude,
          routeDistanceMeters: Math.round(route.distanceMeters),
          routeDurationSeconds: Math.round(route.durationSeconds),
          routingProvider: route.provider,
          routingProfile: route.profile,
          routeCalculatedAt,
          routeMetadata: metadata,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
          statusHistory: {
            create: {
              previousStatus: null,
              newStatus: "REQUESTED",
              changedByUserId: customerId,
              reason: "Customer submitted a pilot booking request.",
            },
          },
        },
        select: bookingSelect,
      });
      return created;
    });
    return { booking: dto(booking), created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await database.bookingRequest.findUnique({
        where: { customerId_idempotencyKey: { customerId, idempotencyKey: input.idempotencyKey } },
        select: { ...bookingSelect, requestFingerprint: true },
      });
      if (!concurrent || concurrent.requestFingerprint !== fingerprint) {
        throw new BookingError("That idempotency key is already in use for another journey.", 409, "IDEMPOTENCY_CONFLICT");
      }
      return { booking: dto(concurrent), created: false };
    }
    throw error;
  }
}

export async function listBookingRequests(customerId: string, cursor?: string, limit = 12) {
  const database = getDatabase();
  let cursorWhere = {};
  if (cursor) {
    const anchor = await database.bookingRequest.findFirst({
      where: { id: cursor, customerId },
      select: { createdAt: true, id: true },
    });
    if (!anchor) throw new BookingError("The history cursor is invalid for this account.", 400, "INVALID_CURSOR");
    cursorWhere = {
      OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ],
    };
  }
  const bookings = await database.bookingRequest.findMany({
    where: { customerId, ...cursorWhere },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: bookingSelect,
  });
  const page = bookings.slice(0, limit);
  return {
    bookings: page.map(dto),
    nextCursor: bookings.length > limit ? page.at(-1)?.id ?? null : null,
  };
}

export async function getBookingRequest(customerId: string, id: string) {
  const booking = await getDatabase().bookingRequest.findFirst({
    where: { id, customerId },
    select: bookingSelect,
  });
  if (!booking) throw new BookingError("Booking not found.", 404, "BOOKING_NOT_FOUND");
  return dto(booking);
}

export async function getBookingHistory(customerId: string, id: string) {
  await getBookingRequest(customerId, id);
  const history = await getDatabase().bookingRequestStatusHistory.findMany({
    where: { bookingRequestId: id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, previousStatus: true, newStatus: true, reason: true, createdAt: true },
  });
  return history.map((entry): BookingHistoryItem => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
  }));
}

export async function cancelBookingRequest(customerId: string, id: string, reason?: string) {
  const database = getDatabase();
  const booking = await database.$transaction(async (transaction) => {
    const updated = await transaction.bookingRequest.updateMany({
      where: { id, customerId, status: "REQUESTED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason ?? null },
    });
    if (updated.count === 0) {
      const exists = await transaction.bookingRequest.findFirst({
        where: { id, customerId },
        select: { status: true },
      });
      if (!exists) throw new BookingError("Booking not found.", 404, "BOOKING_NOT_FOUND");
      throw new BookingError("This booking can no longer be cancelled.", 409, "BOOKING_NOT_CANCELLABLE");
    }
    await transaction.bookingRequestStatusHistory.create({
      data: {
        bookingRequestId: id,
        previousStatus: "REQUESTED",
        newStatus: "CANCELLED",
        changedByUserId: customerId,
        reason: reason ?? "Customer cancelled the pending booking request.",
      },
    });
    return transaction.bookingRequest.findUniqueOrThrow({ where: { id }, select: bookingSelect });
  });
  return dto(booking);
}
