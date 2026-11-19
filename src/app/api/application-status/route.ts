import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupApplication } from "@/server/application-service";
import { normalizeGhanaPhone } from "@/server/phone";
import { checkRateLimit } from "@/server/rate-limit";

const lookupSchema = z.object({
  reference: z.string().trim().min(8).max(40),
  phone: z.string().trim().max(24).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
});

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "application-status", 12);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many status checks. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }
  const parsed = lookupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.email && !parsed.data.phone)) {
    return NextResponse.json({ error: "Enter your application reference and the email or phone used to apply." }, { status: 400 });
  }
  const phone = parsed.data.phone ? normalizeGhanaPhone(parsed.data.phone) : undefined;
  if (parsed.data.phone && !phone) return NextResponse.json({ error: "Enter a valid Ghana phone number." }, { status: 400 });

  try {
    const application = await lookupApplication(parsed.data.reference, {
      phone: phone ?? undefined,
      email: parsed.data.email || undefined,
    });
    if (!application) return NextResponse.json({ error: "We could not find a matching application. Check the reference and contact details." }, { status: 404 });
    return NextResponse.json({ application });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    console.error("ROVA application status lookup failed", { error: detail });
    return NextResponse.json({ error: "Application status is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
