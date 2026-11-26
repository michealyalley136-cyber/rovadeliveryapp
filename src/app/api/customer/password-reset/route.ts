import { NextResponse } from "next/server";
import { z } from "zod";
import { customerIdentityError } from "@/server/customer-identity-response";
import { requestCustomerPasswordReset, resetCustomerPassword } from "@/server/customer-identity-service";
import { checkRateLimit } from "@/server/rate-limit";

const requestSchema = z.strictObject({
  identifier: z.string().trim().min(5).max(254),
});
const resetSchema = z.strictObject({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});
const publicMessage = "If an eligible account exists, password-reset instructions will be sent.";

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "customer-password-reset", 6, 60 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ message: publicMessage }, {
      status: 202,
      headers: { "Retry-After": String(rate.retryAfterSeconds), "cache-control": "no-store" },
    });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  try {
    await requestCustomerPasswordReset(parsed.success ? parsed.data.identifier : `invalid:${Date.now()}`);
  } catch (error) {
    console.error("ROVA password reset queue admission failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return NextResponse.json(
    { message: publicMessage },
    { status: 202, headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const rate = checkRateLimit(request, "customer-password-reset-consume", 8, 60 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many reset attempts. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }
  const parsed = resetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The reset request is invalid." }, { status: 400 });
  try {
    await resetCustomerPassword(parsed.data.token, parsed.data.password);
    return NextResponse.json({ message: "Password updated. Previous customer sessions were revoked." }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const detail = customerIdentityError(error);
    return NextResponse.json({ error: detail.message, code: detail.code }, { status: detail.status });
  }
}
