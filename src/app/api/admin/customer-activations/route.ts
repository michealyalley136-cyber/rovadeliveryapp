import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedAdmin } from "@/server/admin-auth";
import { customerIdentityError } from "@/server/customer-identity-response";
import { issueCustomerActivation } from "@/server/customer-identity-service";
import { checkRateLimit } from "@/server/rate-limit";

const bodySchema = z.strictObject({
  applicationId: z.number().int().positive(),
});

export async function POST(request: Request) {
  const admin = await getAuthorizedAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });
  if (admin.role === "VIEW_ONLY") {
    return NextResponse.json({ error: "Your role cannot issue customer activations." }, { status: 403 });
  }
  const rate = checkRateLimit(request, `customer-activation-invite:${admin.id}`, 10, 60 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many activation invitations. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid customer application." }, { status: 400 });
  try {
    const invitation = await issueCustomerActivation(parsed.data.applicationId, admin.id);
    return NextResponse.json({
      invitation,
      message: "A secure, single-use activation notification was queued. No account exists until it is redeemed.",
    }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const detail = customerIdentityError(error);
    return NextResponse.json(
      { error: detail.message, code: detail.code },
      { status: detail.status, headers: { "cache-control": "no-store" } },
    );
  }
}
