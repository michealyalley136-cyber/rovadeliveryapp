import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { getDashboardData } from "@/server/demo-store";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const data = getDashboardData();
  if (session.role === "CUSTOMER") {
    return NextResponse.json({ trips: data.trips.filter((trip) => trip.customerId === session.id) });
  }
  if (session.role === "OPERATOR") {
    return NextResponse.json({
      trips: data.trips.filter((trip) => trip.operatorId === session.id || trip.status === "SEARCHING"),
      ledger: data.ledger.filter((entry) => entry.operatorId === session.id),
      operatorOnline: data.operatorOnline,
    });
  }
  return NextResponse.json({
    trips: data.trips,
    audits: data.audits,
    operatorOnline: data.operatorOnline,
    metrics: {
      activeTrips: data.trips.filter((trip) => !["TRIP_COMPLETED", "CANCELLED"].includes(trip.status)).length,
      tripsToday: data.trips.length,
      onlineOperators: Number(data.operatorOnline),
      criticalIncidents: 0,
      pendingApplications: Number(data.operatorApplication?.status === "SUBMITTED"),
    },
  });
}
