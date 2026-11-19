import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { submitOperatorApplication } from "@/server/demo-store";

const applicationSchema = z.object({
  legalNameConfirmed: z.literal(true),
  identityDocumentAvailable: z.literal(true),
  licenceAvailable: z.literal(true),
  vehiclePlan: z.enum(["OWN_VEHICLE", "NEED_VEHICLE"]),
  trainingAcknowledged: z.literal(true),
  agreementsAcknowledged: z.literal(true),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (session.role !== "OPERATOR") return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
  const parsed = applicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete each required onboarding acknowledgement." }, { status: 400 });
  const application = submitOperatorApplication();
  return NextResponse.json({
    application,
    message: "Application submitted for review. Approval is not automatic.",
  }, { status: 201 });
}
