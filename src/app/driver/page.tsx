import { Portal } from "@/components/portal";
import { getSession } from "@/server/auth";

export default async function DriverPage() {
  const session = await getSession();
  return <Portal role="OPERATOR" user={session?.role === "OPERATOR" ? session : null} />;
}
