import { Portal } from "@/components/portal";
import { CustomerDashboard } from "@/components/customer-dashboard";
import { getSession } from "@/server/auth";
import { getHeritageRotation } from "@/server/heritage-settings";
import { defaultIntervalSeconds, heritageArtwork } from "@/config/heritage-rotation";
import { getVerifiedCustomerAccount } from "@/server/customer-account";
import { isCustomerRidesEnabled } from "@/server/feature-flags";
import "./customer-dashboard.css";

export default async function CustomerPage() {
  const demoSession = await getSession();
  const verifiedAccount = await getVerifiedCustomerAccount();
  if (demoSession?.role !== "CUSTOMER" && !verifiedAccount) return <Portal role="CUSTOMER" user={null} />;
  const user = verifiedAccount ?? demoSession!;
  let rotation;
  try {
    rotation = await getHeritageRotation();
  } catch (error) {
    console.error("ROVA heritage settings unavailable", error);
    rotation = { intervalSeconds: defaultIntervalSeconds, artworks: heritageArtwork };
  }
  return <CustomerDashboard
    user={user}
    rotation={rotation}
    accountId={user.id}
    verifiedCustomer={Boolean(verifiedAccount)}
    persistentBookingEnabled={Boolean(verifiedAccount && isCustomerRidesEnabled())}
  />;
}
