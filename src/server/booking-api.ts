import "server-only";
import { NextResponse } from "next/server";
import { getCustomerSessionContext } from "@/server/auth";
import { BookingError } from "@/server/booking-errors";
import { requireBookingCustomer } from "@/server/booking-service";
import { isCustomerRidesEnabled } from "@/server/feature-flags";

const privateHeaders = { "cache-control": "private, no-store" };

export async function authorizeBookingRequest() {
  if (!isCustomerRidesEnabled()) {
    throw new BookingError("Persistent customer bookings are not enabled in this environment.", 403, "BOOKING_GATE_DISABLED");
  }
  const session = await getCustomerSessionContext();
  if (!session) throw new BookingError("A verified customer session is required.", 401, "CUSTOMER_SESSION_REQUIRED");
  if (session.status !== "ACTIVE") {
    throw new BookingError("This customer account is not active.", 403, "ACCOUNT_INACTIVE");
  }
  if (!session.hasCustomerRole) {
    throw new BookingError("This account is not authorized to make customer bookings.", 403, "CUSTOMER_ROLE_REQUIRED");
  }
  return requireBookingCustomer(session.id);
}

export function privateJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...privateHeaders, ...extraHeaders } });
}

export async function readJsonBody(request: Request, maximumBytes = 12_000) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel("request body too large");
      throw new BookingError("The booking request is too large.", 413, "REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bodyBytes = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
    return JSON.parse(body);
  } catch {
    return null;
  }
}
