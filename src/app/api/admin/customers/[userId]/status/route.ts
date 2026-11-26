import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedAdmin } from "@/server/admin-auth";
import { getDatabase } from "@/server/db";

const bodySchema = z.strictObject({
  status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]),
  reason: z.string().trim().min(3).max(500),
});

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await getAuthorizedAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
  if (admin.role === "VIEW_ONLY") return NextResponse.json({ error: "Your role cannot change customer status." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid customer status and reason." }, { status: 400 });
  const { userId } = await context.params;
  if (userId.length > 128) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  try {
    const result = await getDatabase().$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, roles: { where: { role: { key: "CUSTOMER" } }, select: { roleId: true } } },
      });
      if (!user || !user.roles.length) return null;
      await transaction.user.update({ where: { id: userId }, data: { status: parsed.data.status } });
      if (parsed.data.status !== "ACTIVE") {
        await transaction.customerSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), revocationReason: `ACCOUNT_${parsed.data.status}` },
        });
      }
      await transaction.adminAuditLog.create({
        data: {
          actorId: admin.id,
          action: "CUSTOMER_ACCOUNT_STATUS_CHANGED",
          entityId: userId,
          oldState: { status: user.status },
          newState: { status: parsed.data.status },
          reason: parsed.data.reason,
        },
      });
      return { id: userId, status: parsed.data.status };
    });
    if (!result) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    return NextResponse.json({ customer: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("ROVA customer status update failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Customer status could not be updated." }, { status: 503 });
  }
}
