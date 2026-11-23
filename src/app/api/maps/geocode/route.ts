import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerMapAccess } from "@/server/maps/auth";
import { GeoapifyGeocodingProvider } from "@/server/maps/geoapify";
import { mapProviderMessage } from "@/server/maps/errors";
import { checkRateLimit } from "@/server/rate-limit";

const schema = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(8).default(6),
  autocomplete: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    await requireCustomerMapAccess();
    const rate = checkRateLimit(request, "map-geocode", 30);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many map searches. Please wait before trying again." }, {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a Ghana address or landmark." }, { status: 400 });
    const places = await new GeoapifyGeocodingProvider().search(
      parsed.data.query,
      parsed.data.limit,
      request.signal,
      parsed.data.autocomplete ? "AUTOCOMPLETE" : "SEARCH",
    );
    return NextResponse.json({ places }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const detail = mapProviderMessage(error);
    return NextResponse.json({ error: detail.message }, { status: detail.status });
  }
}
