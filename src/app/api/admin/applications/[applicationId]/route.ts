import { NextResponse } from "next/server";
import { z } from "zod";
import { applicationStatuses } from "@/lib/application-workflow";
import { assertApplicationTransition } from "@/lib/application-workflow";
import { getAuthorizedAdmin } from "@/server/admin-auth";
import { getDatabase } from "@/server/db";

const updateSchema = z.object({
  status: z.enum(applicationStatuses).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
  note: z.string().trim().min(3).max(2000).optional(),
  followUpAt: z.iso.datetime().optional(),
  assignToMe: z.boolean().optional(),
}).refine((value) => value.status || value.note || value.assignToMe, "Provide a status, note, or assignment change.");

function maskContact(value: string | null) {
  if (!value) return null;
  return value.includes("@") ? `${value.slice(0, 1)}***@${value.split("@")[1]}` : `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ applicationId: string }> }) {
  let admin: Awaited<ReturnType<typeof getAuthorizedAdmin>>;
  try {
    admin = await getAuthorizedAdmin();
  } catch {
    return NextResponse.json({ error: "Admin storage is unavailable." }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
  const { applicationId } = await context.params;
  const id = Number(applicationId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
  try {
    const application = await getDatabase().application.findUnique({
      where: { id },
      include: {
        applicant: true,
        history: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { fullName: true } } } },
        notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { fullName: true } } } },
      },
    });
    if (!application) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
    const duplicateWhere = [
      { normalizedPhone: application.applicant.normalizedPhone },
      ...(application.applicant.normalizedEmail ? [{ normalizedEmail: application.applicant.normalizedEmail }] : []),
    ];
    const [duplicateMatches, duplicates] = await Promise.all([
      getDatabase().application.count({
        where: { id: { not: id }, applicant: { OR: duplicateWhere } },
      }),
      getDatabase().application.findMany({
        where: { id: { not: id }, applicant: { OR: duplicateWhere } },
        orderBy: { submittedAt: "desc" },
        take: 5,
        select: { reference: true, type: true, status: true, submittedAt: true },
      }),
    ]);
    const detail = { ...application, duplicateMatches, duplicates };
    if (admin.role === "VIEW_ONLY") {
      return NextResponse.json({
        application: {
          ...detail,
          applicant: { ...detail.applicant, phone: maskContact(detail.applicant.phone), email: maskContact(detail.applicant.email) },
          notes: [],
        },
      }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ application: detail }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("ROVA admin application detail failed", { error: name });
    return NextResponse.json({ error: "Application details could not be loaded." }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  let admin: Awaited<ReturnType<typeof getAuthorizedAdmin>>;
  try {
    admin = await getAuthorizedAdmin();
  } catch {
    return NextResponse.json({ error: "Admin storage is unavailable." }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
  if (admin.role === "VIEW_ONLY") return NextResponse.json({ error: "Your role cannot change applications." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid status change, internal note, or assignment." }, { status: 400 });
  if (parsed.data.status && !parsed.data.reason) return NextResponse.json({ error: "A reason is required when changing application status." }, { status: 400 });

  const { applicationId } = await context.params;
  const id = Number(applicationId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Application was not found." }, { status: 404 });

  try {
    const database = getDatabase();
    const result = await database.$transaction(async (transaction) => {
      const current = await transaction.application.findUnique({ where: { id }, select: { status: true, reference: true } });
      if (!current) return null;
      if (parsed.data.status) assertApplicationTransition(current.status, parsed.data.status);

      const changes: { status?: (typeof applicationStatuses)[number]; assignedTo?: string } = {};
      if (parsed.data.status) changes.status = parsed.data.status;
      if (parsed.data.assignToMe) changes.assignedTo = admin.id;
      if (parsed.data.status) {
        const updated = await transaction.application.updateMany({
          where: { id, status: current.status },
          data: changes,
        });
        if (updated.count !== 1) throw new Error("Application changed while this update was being saved. Refresh and try again.");
        await transaction.applicationStatusHistory.create({
          data: {
            applicationId: id,
            previousStatus: current.status,
            newStatus: parsed.data.status,
            changedById: admin.id,
            reason: parsed.data.reason,
          },
        });
      } else if (Object.keys(changes).length) {
        await transaction.application.update({ where: { id }, data: changes });
      }
      if (parsed.data.note) {
        await transaction.applicationNote.create({
          data: {
            applicationId: id,
            authorId: admin.id,
            body: parsed.data.note,
            followUpAt: parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null,
          },
        });
      }
      await transaction.adminAuditLog.create({
        data: {
          actorId: admin.id,
          action: parsed.data.status ? "APPLICATION_STATUS_CHANGED" : parsed.data.assignToMe ? "APPLICATION_ASSIGNED" : "APPLICATION_NOTE_ADDED",
          entityId: String(id),
          oldState: { status: current.status },
          newState: { status: parsed.data.status ?? current.status, assignedTo: changes.assignedTo ?? null },
          reason: parsed.data.reason ?? parsed.data.note ?? null,
        },
      });
      return { reference: current.reference, status: parsed.data.status ?? current.status };
    });
    if (!result) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
    return NextResponse.json({ application: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Application update failed.";
    const status = message.startsWith("Application cannot move") || message.startsWith("Application changed") ? 409 : 503;
    if (status === 503) console.error("ROVA admin application update failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: status === 409 ? message : "Application update could not be saved." }, { status });
  }
}
