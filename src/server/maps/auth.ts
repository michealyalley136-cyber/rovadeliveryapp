import "server-only";
import { getCustomerSession, getSession } from "@/server/auth";
import { requireBookingCustomer } from "@/server/booking-service";
import { MapProviderError } from "./errors";

export async function requireCustomerMapAccess() {
  const session = await getSession();
  if (session?.role === "CUSTOMER") return session;
  const realSession = await getCustomerSession();
  if (realSession) {
    try {
      const customer = await requireBookingCustomer(realSession.id);
      return { id: customer.id, role: "CUSTOMER" as const };
    } catch {
      throw new MapProviderError("A verified active customer account is required.", 403);
    }
  }
  throw new MapProviderError("Sign in to a customer workspace before using maps.", 401);
}
