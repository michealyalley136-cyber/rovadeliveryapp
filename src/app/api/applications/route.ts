import { NextResponse } from "next/server";
import { z } from "zod";
import { applicationFields, applicationTypes, ghanaCities, sharedApplicationFields } from "@/config/application-types";
import { createApplication } from "@/server/application-service";
import { isApplicationEnabled } from "@/server/feature-flags";
import { normalizeGhanaPhone } from "@/server/phone";
import { checkRateLimit } from "@/server/rate-limit";

const applicationSchema = z.object({
  type: z.enum(applicationTypes),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(9).max(24),
  whatsapp: z.string().trim().max(24).optional().or(z.literal("")),
  email: z.union([z.email(), z.literal("")]).optional(),
  city: z.enum(ghanaCities),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  consent: z.literal(true),
  data: z.record(z.string(), z.string().trim().max(1000)),
});

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "application-submit");
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many applications were submitted from this connection. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 24_000) {
    return NextResponse.json({ error: "Application is too large. Remove some optional details and try again." }, { status: 413 });
  }

  const parsed = applicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the required fields and consent before submitting." }, { status: 400 });
  if (!isApplicationEnabled(parsed.data.type)) return NextResponse.json({ error: "Applications for this opportunity are temporarily paused." }, { status: 403 });
  const phone = normalizeGhanaPhone(parsed.data.phone);
  const whatsapp = parsed.data.whatsapp ? normalizeGhanaPhone(parsed.data.whatsapp) : null;
  if (!phone || (parsed.data.whatsapp && !whatsapp)) {
    return NextResponse.json({ error: "Enter a valid Ghana phone number using +233 or a local 0-prefixed format." }, { status: 400 });
  }

  const requiredCommon = sharedApplicationFields.filter((field) => field.required).map((field) => field.name);
  const details = applicationFields[parsed.data.type];
  const permittedDetails = new Set(details.map((field) => field.name));
  if (Object.keys(parsed.data.data).some((name) => !permittedDetails.has(name))) {
    return NextResponse.json({ error: "The application contains unexpected fields. Refresh the form and try again." }, { status: 400 });
  }
  const invalidOption = details.find((field) => {
    const value = parsed.data.data[field.name];
    return value !== undefined && field.kind === "select" && !field.options?.includes(value);
  });
  if (invalidOption) return NextResponse.json({ error: "Choose an option from the application form." }, { status: 400 });
  const requiredDetails = details.filter((field) => field.required);
  const missingCommon = requiredCommon.filter((name) => {
    const value = parsed.data[name as keyof typeof parsed.data];
    return typeof value !== "string" || !value.trim();
  });
  const invalidDetail = requiredDetails.find((field) => {
    const value = parsed.data.data[field.name];
    if (typeof value !== "string" || !value.trim()) return true;
    return field.kind === "select" && !field.options?.includes(value);
  });
  if (missingCommon.length || invalidDetail) {
    return NextResponse.json({ error: "Complete each required field using the listed options." }, { status: 400 });
  }

  try {
    const application = await createApplication({
      type: parsed.data.type,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone,
      whatsapp,
      email: parsed.data.email?.trim() || null,
      city: parsed.data.city,
      area: parsed.data.area?.trim() || null,
      data: parsed.data.data,
    });
    return NextResponse.json({ application, message: "Your application is received. Submission does not guarantee approval." }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    console.error("ROVA application submission failed", { error: detail });
    return NextResponse.json(
      { error: "The application service is temporarily unavailable. Your details were not saved; please try again later." },
      { status: 503 },
    );
  }
}
