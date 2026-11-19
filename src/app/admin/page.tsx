import { AdminPortal } from "@/components/admin-portal";
import { getAdminSession } from "@/server/auth";

export const metadata = { title: "ROVA Recruitment Portal" };

export default async function AdminPage() {
  const session = await getAdminSession();
  return <AdminPortal user={session ? { name: session.name, role: session.role } : null} />;
}
