export const simulatedRideStatuses = [
  "REQUESTED", "SEARCHING", "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED",
  "PICKUP_VERIFIED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_DRIVERS_AVAILABLE", "EXPIRED",
] as const;
export type SimulatedRideStatus = (typeof simulatedRideStatuses)[number];

const transitions: Partial<Record<SimulatedRideStatus, readonly SimulatedRideStatus[]>> = {
  REQUESTED: ["SEARCHING", "CANCELLED", "EXPIRED"],
  SEARCHING: ["DRIVER_ASSIGNED", "CANCELLED", "NO_DRIVERS_AVAILABLE", "EXPIRED"],
  DRIVER_ASSIGNED: ["DRIVER_EN_ROUTE", "CANCELLED"],
  DRIVER_EN_ROUTE: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["PICKUP_VERIFIED", "CANCELLED"],
  PICKUP_VERIFIED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
};

export function assertSimulatedRideTransition(current: SimulatedRideStatus, next: SimulatedRideStatus) {
  if (!transitions[current]?.includes(next)) throw new Error(`Simulated ride cannot move from ${current} to ${next}.`);
}
