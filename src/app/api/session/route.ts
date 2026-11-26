import { NextResponse } from "next/server";
import { z } from "zod";
import { appRoles } from "@/lib/domain";
import { clearCustomerSession, clearSession, createDemoSession } from "@/server/auth";

const signInSchema = z.object({ role: z.enum(appRoles) });

export async function POST(request: Request) {
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid demo role." }, { status: 400 });
  try {
    const user = await createDemoSession(parsed.data.role);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start a demo session.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function DELETE() {
  await clearSession();
  try {
    await clearCustomerSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ROVA logout revocation failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Sign-out could not be fully confirmed. Retry after connectivity returns." },
      { status: 503 },
    );
  }
}
