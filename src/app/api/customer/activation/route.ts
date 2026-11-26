import { NextResponse } from "next/server";
import { z } from "zod";
import { customerIdentityError } from "@/server/customer-identity-response";
import { activateCustomerApplication } from "@/server/customer-identity-service";
import { createCustomerSession } from "@/server/auth";
import { checkRateLimit } from "@/server/rate-limit";

const bodySchema = z.strictObject({
  token: z.string().min(32).max(256),
  password: z.string()
    .min(12)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "customer-activation", 8, 60 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many activation attempts. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 2_000) {
    return NextResponse.json({ error: "Activation request is too large." }, { status: 413 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "Use a valid activation link and a password with at least 12 characters, uppercase, lowercase and a number.",
    }, { status: 400 });
  }
  try {
    const user = await activateCustomerApplication(parsed.data);
    await createCustomerSession(user.id, request);
    return NextResponse.json({
      user: { name: user.name },
      message: "Your verified customer account is active.",
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const detail = customerIdentityError(error);
    return NextResponse.json(
      { error: detail.message, code: detail.code },
      { status: detail.status, headers: { "cache-control": "no-store" } },
    );
  }
}
