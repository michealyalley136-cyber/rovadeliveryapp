import { describe, expect, it } from "vitest";
import { assertSimulatedRideTransition, simulatedRideStatuses } from "../dispatch/lifecycle";

describe("simulated ride lifecycle", () => {
  it("requires pickup verification before a trip starts", () => {
    expect(() => assertSimulatedRideTransition("DRIVER_ARRIVED", "IN_PROGRESS")).toThrow();
    expect(() => assertSimulatedRideTransition("DRIVER_ARRIVED", "PICKUP_VERIFIED")).not.toThrow();
    expect(() => assertSimulatedRideTransition("PICKUP_VERIFIED", "IN_PROGRESS")).not.toThrow();
  });
  it("never transitions from a terminal state", () => {
    for (const status of ["COMPLETED", "CANCELLED", "NO_DRIVERS_AVAILABLE", "EXPIRED"] as const) {
      for (const next of simulatedRideStatuses) expect(() => assertSimulatedRideTransition(status, next)).toThrow();
    }
  });
  it("does not allow a searching ride to skip assignment", () => {
    expect(() => assertSimulatedRideTransition("SEARCHING", "DRIVER_ASSIGNED")).not.toThrow();
    expect(() => assertSimulatedRideTransition("SEARCHING", "DRIVER_EN_ROUTE")).toThrow();
  });
});
