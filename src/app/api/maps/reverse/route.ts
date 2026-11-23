import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerMapAccess } from "@/server/maps/auth";
import { GeoapifyGeocodingProvider } from "@/server/maps/geoapify";
import { mapProviderMessage } from "@/server/maps/errors";
import { checkRateLimit } from "@/server/rate-limit";

const schema = z.object({
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
});

export async function POST(request: Request) {
  try {
    await requireCustomerMapAccess();
    const rate = checkRateLimit(request, "map-reverse", 40);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many location updates. Please wait before trying again." }, {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose valid map coordinates." }, { status: 400 });
    const place = await new GeoapifyGeocodingProvider().reverse(parsed.data, request.signal);
    return NextResponse.json({ place }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const detail = mapProviderMessage(error);
    return NextResponse.json({ error: detail.message }, { status: detail.status });
  }
}
