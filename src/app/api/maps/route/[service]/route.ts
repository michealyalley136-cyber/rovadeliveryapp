import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerMapAccess } from "@/server/maps/auth";
import { GeoapifyRoutingProvider } from "@/server/maps/geoapify";
import { mapProviderMessage } from "@/server/maps/errors";
import { checkRateLimit } from "@/server/rate-limit";

const coordinates = z.object({
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
});
const bodySchema = z.object({
  pickup: coordinates,
  destination: coordinates,
});

export async function POST(request: Request, context: RouteContext<"/api/maps/route/[service]">) {
  try {
    await requireCustomerMapAccess();
    const rate = checkRateLimit(request, "map-route", 12);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many route requests. Please wait before trying again." }, {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      });
    }
    const { service } = await context.params;
    if (service !== "RIDE" && service !== "TAXI") {
      return NextResponse.json({ error: "Choose a supported transportation service." }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose valid pickup and destination points." }, { status: 400 });
    const route = await new GeoapifyRoutingProvider().route(
      parsed.data.pickup,
      parsed.data.destination,
      service === "RIDE" ? "MOTORCYCLE" : "DRIVING",
      request.signal,
    );
    return NextResponse.json({ service, route }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const detail = mapProviderMessage(error);
    return NextResponse.json({ error: detail.message }, { status: detail.status });
  }
}
