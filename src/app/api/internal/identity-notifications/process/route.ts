import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processIdentityNotifications } from "@/server/identity-notification-worker";

function validAuthorization(request: Request) {
  const secret = process.env.IDENTITY_NOTIFICATION_WORKER_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || secret.length < 32 || !provided) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!validAuthorization(request)) {
    return NextResponse.json({ error: "Worker authorization required." }, { status: 401 });
  }
  try {
    const results = await processIdentityNotifications({ limit: 25 });
    return NextResponse.json(
      { processed: results.length, outcomes: results.map((result) => result.status) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("ROVA identity notification worker failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Notification processing failed." }, { status: 503 });
  }
}
