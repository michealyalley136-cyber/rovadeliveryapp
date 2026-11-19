import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSession, clearAdminSession, getAdminSession } from "@/server/auth";
import { getDatabase } from "@/server/db";
import { checkRateLimit } from "@/server/rate-limit";

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export async function GET() {
  const session = await getAdminSession();
  return session
    ? NextResponse.json({ user: { name: session.name, role: session.role } })
    : NextResponse.json({ error: "Sign in required." }, { status: 401 });
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "admin-login", 5);
  if (!rate.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429 });
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  try {
    const admin = await getDatabase().adminUser.findUnique({
      where: { email: parsed.data.email.trim().toLocaleLowerCase("en") },
      select: { id: true, email: true, fullName: true, passwordHash: true, role: true, active: true },
    });
    const passwordMatches = admin ? await compare(parsed.data.password, admin.passwordHash) : false;
    if (!admin?.active || !passwordMatches) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    await createAdminSession({ id: admin.id, role: admin.role, name: admin.fullName });
    return NextResponse.json({ user: { name: admin.fullName, role: admin.role } });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("ROVA admin sign-in failed", { error: name });
    return NextResponse.json({ error: "Admin sign-in is unavailable. Contact the system administrator." }, { status: 503 });
  }
}

export async function DELETE() {
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
