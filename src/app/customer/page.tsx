import { Portal } from "@/components/portal";
import { CustomerDashboard } from "@/components/customer-dashboard";
import { getSession } from "@/server/auth";
import { getHeritageRotation } from "@/server/heritage-settings";
import { defaultIntervalSeconds, heritageArtwork } from "@/config/heritage-rotation";
import "./customer-dashboard.css";

export default async function CustomerPage() {
  const session = await getSession();
  if (session?.role !== "CUSTOMER") return <Portal role="CUSTOMER" user={null} />;
  let rotation;
  try {
    rotation = await getHeritageRotation();
  } catch (error) {
    console.error("ROVA heritage settings unavailable", error);
    rotation = { intervalSeconds: defaultIntervalSeconds, artworks: heritageArtwork };
  }
  return <CustomerDashboard user={session} rotation={rotation} />;
}
