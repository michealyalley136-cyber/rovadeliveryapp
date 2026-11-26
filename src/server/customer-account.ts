import "server-only";
import { getCustomerSession } from "@/server/auth";
import { BookingError } from "@/server/booking-errors";
import { requireBookingCustomer } from "@/server/booking-service";
import { getDatabase } from "@/server/db";

export async function getVerifiedCustomerAccount() {
  const session = await getCustomerSession();
  if (!session) return null;
  try {
    const customer = await requireBookingCustomer(session.id);
    const user = await getDatabase().user.findUnique({
      where: { id: customer.id },
      select: { id: true, fullName: true },
    });
    return user ? { id: user.id, name: user.fullName } : null;
  } catch (error) {
    if (error instanceof BookingError) return null;
    console.error("ROVA verified customer account lookup failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}
