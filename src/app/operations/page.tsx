import { Portal } from "@/components/portal";
import { getSession } from "@/server/auth";

export default async function OperationsPage() {
  const session = await getSession();
  return <Portal role="OPERATIONS" user={session?.role === "OPERATIONS" ? session : null} />;
}
