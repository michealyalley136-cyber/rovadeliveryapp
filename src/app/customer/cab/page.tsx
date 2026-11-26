import { CustomerBooking } from "@/components/customer-booking";
import { Portal } from "@/components/portal";
import { getSession } from "@/server/auth";
import { getVerifiedCustomerAccount } from "@/server/customer-account";
import { isCustomerRidesEnabled } from "@/server/feature-flags";
import "../customer-dashboard.css";

export default async function CabPage() {
  const demoSession = await getSession();
  const verifiedAccount = await getVerifiedCustomerAccount();
  if (demoSession?.role !== "CUSTOMER" && !verifiedAccount) return <Portal role="CUSTOMER" user={null} />;
  return <CustomerBooking
    service="TAXI"
    persistentBookingEnabled={Boolean(verifiedAccount && isCustomerRidesEnabled())}
  />;
}
