import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { createTrip } from "@/server/demo-store";
import { estimateFare } from "@/server/pricing";

const rideSchema = z.object({
  pickup: z.string().trim().min(3).max(120),
  destination: z.string().trim().min(3).max(120),
  service: z.enum(["RIDE", "TAXI"]),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const service = new URL(request.url).searchParams.get("service");
  if (service !== "RIDE" && service !== "TAXI") return NextResponse.json({ error: "Choose a supported ride service." }, { status: 400 });
  return NextResponse.json({ farePesewas: estimateFare(service), currency: "GHS", demo: true });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to request a ride." }, { status: 401 });
  if (session.role !== "CUSTOMER") return NextResponse.json({ error: "Only customers can request rides." }, { status: 403 });
  const parsed = rideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a pickup and destination." }, { status: 400 });
  const trip = createTrip({ ...parsed.data, farePesewas: estimateFare(parsed.data.service) });
  return NextResponse.json({ trip }, { status: 201 });
}
