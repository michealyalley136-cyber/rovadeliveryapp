import { z } from "zod";
import { authorizeBookingRequest, privateJson } from "@/server/booking-api";
import { bookingErrorResponse } from "@/server/booking-errors";
import { getBookingHistory } from "@/server/booking-service";
import { checkRateLimit } from "@/server/rate-limit";

const bookingIdSchema = z.string().trim().min(1).max(128);

export async function GET(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  try {
    const customer = await authorizeBookingRequest();
    const rate = checkRateLimit(request, `booking-history:${customer.id}`, 120, 10 * 60 * 1000);
    if (!rate.allowed) return privateJson(
      { error: "Too many booking history requests. Please wait before trying again." },
      429,
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
    const parsed = bookingIdSchema.safeParse((await context.params).bookingId);
    if (!parsed.success) return privateJson({ error: "The booking identifier is invalid." }, 400);
    return privateJson({ history: await getBookingHistory(customer.id, parsed.data) });
  } catch (error) {
    const detail = bookingErrorResponse(error);
    return privateJson({ error: detail.message, code: detail.code }, detail.status);
  }
}
