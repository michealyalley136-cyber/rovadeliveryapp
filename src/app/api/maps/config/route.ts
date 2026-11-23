import { NextResponse } from "next/server";
import { ghanaInitialView, ghanaServiceZone } from "@/lib/maps/ghana";
import { requireCustomerMapAccess } from "@/server/maps/auth";
import { mapProviderAvailability, mapStyleConfig } from "@/server/maps/config";
import { mapProviderMessage } from "@/server/maps/errors";

export async function GET() {
  try {
    await requireCustomerMapAccess();
    return NextResponse.json({
      style: mapStyleConfig(),
      initialView: ghanaInitialView,
      serviceZones: [ghanaServiceZone],
      providers: mapProviderAvailability(),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const detail = mapProviderMessage(error);
    return NextResponse.json({ error: detail.message }, { status: detail.status });
  }
}
