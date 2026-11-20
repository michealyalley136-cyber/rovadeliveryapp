import { Portal } from "@/components/portal";
import { CustomerDashboard } from "@/components/customer-dashboard";
import { getSession } from "@/server/auth";
import { getHeritageRotation } from "@/server/heritage-settings";
import { defaultIntervalMinutes } from "@/config/heritage-rotation";
import "./customer-dashboard.css";

export default async function CustomerPage() {
  const session = await getSession();
  if (session?.role !== "CUSTOMER") return <Portal role="CUSTOMER" user={null} />;
  let heritageError = false;
  let rotation;
  try {
    rotation = await getHeritageRotation();
  } catch (error) {
    console.error("ROVA heritage settings unavailable", error);
    rotation = { intervalMinutes: defaultIntervalMinutes, artworks: [] };
    heritageError = true;
  }
  return <CustomerDashboard user={session} rotation={rotation} heritageError={heritageError} />;
}
