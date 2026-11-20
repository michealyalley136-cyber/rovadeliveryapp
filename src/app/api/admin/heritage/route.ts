import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultIntervalSeconds, heritageArtwork, rotationIntervals } from "@/config/heritage-rotation";
import { getAuthorizedAdmin } from "@/server/admin-auth";
import { getDatabase } from "@/server/db";

const schema = z.object({
  intervalSeconds: z.number().int().min(1).max(604800),
  disabledIds: z.array(z.string()).max(heritageArtwork.length).refine((ids) =>
    new Set(ids).size === ids.length && ids.every((id) => heritageArtwork.some((art) => art.id === id))),
});

async function authorize() {
  const admin = await getAuthorizedAdmin();
  return admin && (admin.role === "SUPER_ADMIN" || admin.role === "OPERATIONS_ADMIN") ? admin : null;
}

export async function GET() {
  try {
    if (!await authorize()) return NextResponse.json({ error: "Authorized administrator access is required." }, { status: 403 });
    const settings = await getDatabase().heritageSettings.findUnique({ where: { id: "global" } });
    return NextResponse.json({ intervalSeconds: settings ? settings.intervalSeconds ?? settings.intervalMinutes * 60 : defaultIntervalSeconds, disabledIds: settings?.disabledIds ?? [], artworks: heritageArtwork }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("ROVA heritage settings read failed", error);
    return NextResponse.json({ error: "Heritage settings could not be loaded." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!await authorize()) return NextResponse.json({ error: "Authorized administrator access is required." }, { status: 403 });
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid interval or landmark selection." }, { status: 400 });
    const existing = await getDatabase().heritageSettings.findUnique({ where: { id: "global" } });
    const previousInterval = existing ? existing.intervalSeconds ?? existing.intervalMinutes * 60 : defaultIntervalSeconds;
    if (!(rotationIntervals as readonly number[]).includes(parsed.data.intervalSeconds) && parsed.data.intervalSeconds !== previousInterval) {
      return NextResponse.json({ error: "Choose a supported rotation interval." }, { status: 400 });
    }
    await getDatabase().heritageSettings.upsert({ where: { id: "global" }, create: { id: "global", ...parsed.data }, update: parsed.data });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("ROVA heritage settings update failed", error);
    return NextResponse.json({ error: "Heritage settings could not be saved." }, { status: 503 });
  }
}
