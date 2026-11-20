import { z } from "zod";
import { defaultSearchStages, searchStageAt } from "../server/dispatch/search";

const rideSchema = z.object({
  id: z.string().uuid(),
  service: z.enum(["RIDE", "TAXI"]),
  pickup: z.string().min(3).max(120),
  destination: z.string().min(3).max(120),
  startedAt: z.number().finite(),
  elapsed: z.number().min(0).finite(),
  speed: z.number().min(1).max(10),
  paused: z.boolean(),
  scenario: z.enum(["immediate", "delayed", "expanded", "none"]),
  status: z.enum(["SEARCHING", "APPROACHING", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_DRIVERS"]),
  phaseStartedAt: z.number().finite(),
});
export type SimulationRide = z.infer<typeof rideSchema>;
export const simulationKey = "rova-browser-simulation-v1";
const terminal = ["COMPLETED", "CANCELLED", "NO_DRIVERS"];

export function readSimulations(): SimulationRide[] {
  const raw = localStorage.getItem(simulationKey);
  if (!raw) return [];
  const parsed = z.array(rideSchema).safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Saved demo journeys could not be read.");
  return parsed.data;
}

export function writeSimulations(rides: SimulationRide[]) {
  localStorage.setItem(simulationKey, JSON.stringify(rides));
  window.dispatchEvent(new Event("rova-simulation-changed"));
}

export function createSimulation(service: SimulationRide["service"], pickup: string, destination: string): SimulationRide {
  const rides = readSimulations().map((ride) => simulateAt(ride, Date.now()));
  if (rides.some((ride) => !terminal.includes(ride.status))) throw new Error("You already have an active demo journey. Resume or cancel it first.");
  const now = Date.now();
  const ride: SimulationRide = { id: crypto.randomUUID(), service, pickup, destination, startedAt: now, phaseStartedAt: now, elapsed: 0, speed: 1, paused: false, scenario: "delayed", status: "SEARCHING" };
  writeSimulations([ride, ...rides]);
  return ride;
}

export function searchElapsed(ride: SimulationRide, now: number) {
  return ride.elapsed + (ride.paused ? 0 : Math.max(0, now - ride.startedAt) * ride.speed);
}

export function simulateAt(ride: SimulationRide, now: number): SimulationRide {
  if (ride.paused) return ride;
  if (ride.status === "SEARCHING") {
    const elapsed = searchElapsed(ride, now);
    const threshold = { immediate: 3000, delayed: 20000, expanded: 55000, none: Infinity }[ride.scenario];
    if (elapsed >= threshold && threshold < 90000) {
      return simulateAt({ ...ride, status: "APPROACHING", phaseStartedAt: now - (elapsed - threshold) / ride.speed }, now);
    }
    if (elapsed >= 90000) return { ...ride, status: "NO_DRIVERS", phaseStartedAt: now };
  }
  if (ride.status === "APPROACHING" && (now - ride.phaseStartedAt) * ride.speed >= 15000) return { ...ride, status: "ARRIVED", phaseStartedAt: now };
  if (ride.status === "IN_PROGRESS" && (now - ride.phaseStartedAt) * ride.speed >= 30000) return { ...ride, status: "COMPLETED", phaseStartedAt: now };
  return ride;
}

export function radiusFor(ride: SimulationRide, now: number) {
  return searchStageAt(defaultSearchStages[ride.service], 0, Math.min(89999, searchElapsed(ride, now)))?.stage.radiusMeters ?? 0;
}

export function isActiveSimulation(ride: SimulationRide) {
  return !terminal.includes(ride.status);
}
