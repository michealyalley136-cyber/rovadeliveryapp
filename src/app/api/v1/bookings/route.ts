import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeBookingRequest, privateJson, readJsonBody } from "@/server/booking-api";
import { bookingErrorResponse } from "@/server/booking-errors";
import { createBookingRequest, listBookingRequests } from "@/server/booking-service";
import { checkRateLimit } from "@/server/rate-limit";

const createSchema = z.strictObject({
  service: z.enum(["RIDE", "TAXI"]),
  pickupName: z.string().trim().min(3).max(160),
  pickupLatitude: z.number().finite().min(-90).max(90),
  pickupLongitude: z.number().finite().min(-180).max(180),
  pickupInstructions: z.string().trim().max(240).optional(),
  destinationName: z.string().trim().min(3).max(160),
  destinationLatitude: z.number().finite().min(-90).max(90),
  destinationLongitude: z.number().finite().min(-180).max(180),
  idempotencyKey: z.string().trim().min(16).max(120),
});

const listSchema = z.object({
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export async function GET(request: Request) {
  try {
    const customer = await authorizeBookingRequest();
    const rate = checkRateLimit(request, `booking-list:${customer.id}`, 60, 10 * 60 * 1000);
    if (!rate.allowed) return privateJson(
      { error: "Too many booking history requests. Please wait before trying again." },
      429,
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return privateJson({ error: "The booking history request is invalid." }, 400);
    const page = await listBookingRequests(customer.id, parsed.data.cursor, parsed.data.limit);
    return privateJson(page);
  } catch (error) {
    const detail = bookingErrorResponse(error);
    return privateJson({ error: detail.message, code: detail.code }, detail.status);
  }
}

export async function POST(request: Request) {
  try {
    const customer = await authorizeBookingRequest();
    const rate = checkRateLimit(request, `booking-create:${customer.id}`, 10, 10 * 60 * 1000);
    if (!rate.allowed) return privateJson(
      { error: "Too many booking attempts. Please wait before trying again." },
      429,
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
    const parsed = createSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return privateJson({
      error: "Check the selected service, locations and request key before submitting.",
    }, 400);
    const result = await createBookingRequest(customer.id, parsed.data, request.signal);
    return privateJson(
      { booking: result.booking, message: "Your non-operational pilot booking request has been saved." },
      result.created ? 201 : 200,
    );
  } catch (error) {
    const detail = bookingErrorResponse(error);
    return NextResponse.json(
      { error: detail.message, code: detail.code },
      { status: detail.status, headers: { "cache-control": "private, no-store" } },
    );
  }
}
