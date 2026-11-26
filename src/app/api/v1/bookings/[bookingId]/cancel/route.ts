import { z } from "zod";
import { authorizeBookingRequest, privateJson, readJsonBody } from "@/server/booking-api";
import { bookingErrorResponse } from "@/server/booking-errors";
import { cancelBookingRequest } from "@/server/booking-service";
import { checkRateLimit } from "@/server/rate-limit";

const bookingIdSchema = z.string().trim().min(1).max(128);
const bodySchema = z.strictObject({
  reason: z.string().trim().max(240).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  try {
    const customer = await authorizeBookingRequest();
    const rate = checkRateLimit(request, `booking-cancel:${customer.id}`, 20, 10 * 60 * 1000);
    if (!rate.allowed) return privateJson(
      { error: "Too many cancellation requests. Please wait before trying again." },
      429,
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
    const id = bookingIdSchema.safeParse((await context.params).bookingId);
    const body = bodySchema.safeParse(await readJsonBody(request, 2_000));
    if (!id.success || !body.success) return privateJson({ error: "The cancellation request is invalid." }, 400);
    return privateJson({
      booking: await cancelBookingRequest(customer.id, id.data, body.data.reason),
    });
  } catch (error) {
    const detail = bookingErrorResponse(error);
    return privateJson({ error: detail.message, code: detail.code }, detail.status);
  }
}
