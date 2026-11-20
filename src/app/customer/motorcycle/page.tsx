import { CustomerBooking } from "@/components/customer-booking";
import { Portal } from "@/components/portal";
import { getSession } from "@/server/auth";
import "../customer-dashboard.css";

export default async function MotorcyclePage() {
  const session = await getSession();
  if (session?.role !== "CUSTOMER") return <Portal role="CUSTOMER" user={null} />;
  return <CustomerBooking service="RIDE" />;
}
