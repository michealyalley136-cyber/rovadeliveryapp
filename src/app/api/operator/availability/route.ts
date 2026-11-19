import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { setOperatorAvailability } from "@/server/demo-store";
import { operatorActivationDecision } from "@/server/compliance";

const availabilitySchema = z.object({ online: z.boolean() });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (session.role !== "OPERATOR") return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
  const parsed = availabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Availability value is invalid." }, { status: 400 });
  if (parsed.data.online) {
    const decision = operatorActivationDecision(session.role);
    if (!decision.allowed) return NextResponse.json({ error: decision.reason }, { status: 409 });
    setOperatorAvailability(true);
    return NextResponse.json({ online: true });
  }
  setOperatorAvailability(false);
  return NextResponse.json({ online: false, message: "Your demo operator profile is awaiting compliance approval." });
}
