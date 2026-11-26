export class BookingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export function bookingErrorResponse(error: unknown) {
  if (error instanceof BookingError) {
    return { message: error.message, status: error.status, code: error.code };
  }
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error("ROVA customer booking operation failed", { error: name });
  return {
    message: "The booking service is temporarily unavailable. Your request was not confirmed.",
    status: 503,
    code: "BOOKING_UNAVAILABLE",
  };
}
