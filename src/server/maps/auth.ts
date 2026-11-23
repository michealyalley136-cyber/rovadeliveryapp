import "server-only";
import { getSession } from "@/server/auth";
import { MapProviderError } from "./errors";

export async function requireCustomerMapAccess() {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") {
    throw new MapProviderError("Sign in to a customer workspace before using maps.", 401);
  }
  return session;
}
