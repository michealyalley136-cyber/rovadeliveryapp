import { describe, expect, it } from "vitest";
import { distanceMeters } from "../dispatch/geography";
import { defaultSearchStages, rankEligibleDrivers, searchStageAt, type DriverCandidate } from "../dispatch/search";

const pickup = { latitude: 5.6037, longitude: -0.187 };
const driver: DriverCandidate = {
  id: "a", service: "RIDE", coordinates: pickup, locationUpdatedAt: 100000,
  locationAccuracyMeters: 10, registered: true, approved: true, online: true,
  vehicleApproved: true, compliant: true, suspended: false, assigned: false, declined: false,
  pickupEtaSeconds: 60, roadDistanceMeters: 500, lastOfferedAt: null,
};
const query = { pickup, service: "RIDE" as const, radiusMeters: 1609.344, now: 100000,
  maxLocationAgeSeconds: 30, maxAccuracyMeters: 100, maxPickupEtaSeconds: 600 };

describe("dispatch geography and search", () => {
  it("calculates distances in meters and rejects invalid coordinates", () => {
    expect(distanceMeters(pickup, pickup)).toBe(0);
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111195, -1);
    expect(() => distanceMeters(pickup, { latitude: NaN, longitude: 0 })).toThrow();
  });
  it.each(["RIDE", "TAXI"] as const)("uses the approved timed stages for %s", (service) => {
    const stages = defaultSearchStages[service];
    expect(stages.map((s) => Math.round(s.radiusMeters / 1609.344))).toEqual(service === "RIDE" ? [1, 2, 3, 5, 10] : [1, 3, 5, 10, 15]);
    expect(searchStageAt(stages, 1000, 15999)?.index).toBe(0);
    expect(searchStageAt(stages, 1000, 16000)?.index).toBe(1);
    expect(searchStageAt(stages, 1000, 91000)).toBeNull();
    expect(() => searchStageAt(stages, 1000, 999)).toThrow();
  });
  it("excludes unqualified, stale, unavailable, distant or unrouteable drivers", () => {
    const rejected: Partial<DriverCandidate>[] = [
      { service: "TAXI" }, { approved: false }, { registered: false }, { online: false },
      { vehicleApproved: false }, { compliant: false }, { suspended: true }, { assigned: true },
      { declined: true }, { locationUpdatedAt: 69999 }, { locationUpdatedAt: 100001 },
      { locationAccuracyMeters: 101 }, { pickupEtaSeconds: null }, { pickupEtaSeconds: 601 },
      { roadDistanceMeters: null }, { coordinates: { latitude: 6, longitude: 0 } },
    ];
    const drivers = [driver, ...rejected.map((patch, i) => ({ ...driver, ...patch, id: `invalid-${i}` }))];
    expect(rankEligibleDrivers({ ...query, drivers }).map((item) => item.driver.id)).toEqual(["a"]);
  });
  it("prioritizes pickup ETA before straight-line proximity", () => {
    const closer = { ...driver, id: "closer", pickupEtaSeconds: 120 };
    const faster = { ...driver, id: "faster", pickupEtaSeconds: 40, coordinates: { latitude: 5.604, longitude: -0.187 } };
    expect(rankEligibleDrivers({ ...query, drivers: [closer, faster] }).map((item) => item.driver.id)).toEqual(["faster", "closer"]);
  });
});
