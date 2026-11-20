import { getAdminSession, getSession } from "@/server/auth";
import { Portal } from "@/components/portal";
import { SimulationRidePage } from "@/components/simulation-ride-page";
import "../../customer-dashboard.css";
import "./simulation.css";

export default async function RidePage({ params }: { params: Promise<{ rideId: string }> }) {
  const session = await getSession();
  if (session?.role !== "CUSTOMER") return <Portal role="CUSTOMER" user={null} />;
  const admin = await getAdminSession();
  const controls = process.env.NODE_ENV !== "production" || (process.env.SIMULATION_CONTROLS_ENABLED === "true" && (admin?.role === "SUPER_ADMIN" || admin?.role === "OPERATIONS_ADMIN"));
  const { rideId } = await params;
  return <SimulationRidePage rideId={rideId} controls={controls} />;
}
