import "server-only";
import { getAdminSession } from "@/server/auth";
import { getDatabase } from "@/server/db";

export async function getAuthorizedAdmin() {
  const session = await getAdminSession();
  if (!session) return null;
  const admin = await getDatabase().adminUser.findUnique({
    where: { id: session.id },
    select: { id: true, fullName: true, role: true, active: true },
  });
  if (!admin?.active || admin.role !== session.role) return null;
  return { id: admin.id, name: admin.fullName, role: admin.role };
}
