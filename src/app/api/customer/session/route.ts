import { NextResponse } from "next/server";
import { z } from "zod";
import { clearCustomerSession, createCustomerSession, getCustomerSession } from "@/server/auth";
import { authenticateCustomer } from "@/server/customer-identity-service";
import { checkRateLimit } from "@/server/rate-limit";

const credentialsSchema = z.strictObject({
  identifier: z.string().trim().min(5).max(254),
  password: z.string().min(1).max(128),
});

export async function GET() {
  const session = await getCustomerSession();
  return session
    ? NextResponse.json({ authenticated: true }, { headers: { "cache-control": "private, no-store" } })
    : NextResponse.json({ error: "Customer sign-in is required." }, { status: 401, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "customer-login", 8, 15 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid customer email or phone and password." }, { status: 400 });
  try {
    const user = await authenticateCustomer(parsed.data.identifier, parsed.data.password);
    if (!user) return NextResponse.json({ error: "Email or phone and password are incorrect." }, { status: 401 });
    await createCustomerSession(user.id, request);
    return NextResponse.json(
      { user: { name: user.name } },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    console.error("ROVA customer sign-in failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Customer sign-in is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    await clearCustomerSession();
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("ROVA customer logout revocation failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Sign-out could not be fully confirmed. Retry after connectivity returns." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
