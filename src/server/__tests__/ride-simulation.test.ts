import { describe, expect, it } from "vitest";
import { radiusFor, searchElapsed, simulateAt, type SimulationRide } from "../../lib/ride-simulation";

const ride: SimulationRide = { id: "10000000-0000-4000-8000-000000000000", service: "RIDE", pickup: "Accra", destination: "Osu", startedAt: 0, elapsed: 0, speed: 1, paused: false, scenario: "delayed", status: "SEARCHING", phaseStartedAt: 0 };

describe("browser ride simulation", () => {
  it("expands the service-specific radius and assigns after the delay", () => {
    expect(radiusFor(ride, 0)).toBeCloseTo(1609.344);
    expect(radiusFor(ride, 15000)).toBeCloseTo(3218.688);
    expect(radiusFor({ ...ride, service: "TAXI" }, 15000)).toBeCloseTo(4828.032);
    expect(simulateAt(ride, 19999).status).toBe("SEARCHING");
    expect(simulateAt(ride, 20000).status).toBe("APPROACHING");
    expect(simulateAt(ride, 36000).status).toBe("ARRIVED");
  });
  it("expires without drivers and completes journeys", () => {
    expect(simulateAt({ ...ride, scenario: "none" }, 90000).status).toBe("NO_DRIVERS");
    expect(simulateAt({ ...ride, status: "IN_PROGRESS", phaseStartedAt: 1000 }, 31000).status).toBe("COMPLETED");
  });
  it("keeps logical time fixed when paused and supports accelerated timing", () => {
    expect(searchElapsed({ ...ride, paused: true, elapsed: 1000 }, 100000)).toBe(1000);
    expect(simulateAt({ ...ride, speed: 10 }, 2000).status).toBe("APPROACHING");
    expect(simulateAt({ ...ride, paused: true }, 100000).status).toBe("SEARCHING");
  });
});
