import { BookingError } from "@/server/booking-errors";

export function customerIdentityError(error: unknown) {
  if (error instanceof BookingError) {
    return { message: error.message, status: error.status, code: error.code };
  }
  console.error("ROVA customer identity operation failed", {
    error: error instanceof Error ? error.name : "UnknownError",
  });
  return {
    message: "Customer account security is temporarily unavailable. Please try again later.",
    status: 503,
    code: "CUSTOMER_IDENTITY_UNAVAILABLE",
  };
}
