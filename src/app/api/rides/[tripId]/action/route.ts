import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { getDashboardData, transitionTrip } from "@/server/demo-store";

const actionSchema = z.object({ action: z.enum(["ACCEPT", "EN_ROUTE", "ARRIVED", "START", "COMPLETE"]) });
const statusByAction = {
  ACCEPT: "RIDER_ASSIGNED",
  EN_ROUTE: "RIDER_EN_ROUTE",
  ARRIVED: "RIDER_ARRIVED",
  START: "TRIP_STARTED",
  COMPLETE: "TRIP_COMPLETED",
} as const;

export async function POST(request: Request, context: { params: Promise<{ tripId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (session.role !== "OPERATOR") return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid trip action." }, { status: 400 });
  const { tripId } = await context.params;
  const trip = getDashboardData().trips.find((item) => item.id === tripId);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  if (trip.operatorId && trip.operatorId !== session.id) {
    return NextResponse.json({ error: "This trip is assigned to another operator." }, { status: 403 });
  }
  if (parsed.data.action !== "ACCEPT" && trip.operatorId !== session.id) {
    return NextResponse.json({ error: "Accept this trip before progressing it." }, { status: 409 });
  }
  try {
    return NextResponse.json({ trip: transitionTrip(tripId, statusByAction[parsed.data.action], session.role) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update trip.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
