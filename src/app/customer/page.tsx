import { Portal } from "@/components/portal";
import { getSession } from "@/server/auth";

export default async function CustomerPage() {
  const session = await getSession();
  return <Portal role="CUSTOMER" user={session?.role === "CUSTOMER" ? session : null} />;
}
