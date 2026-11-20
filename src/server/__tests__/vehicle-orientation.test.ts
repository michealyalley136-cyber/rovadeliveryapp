import { describe, expect, it } from "vitest";
import { initialVehicleOrientation, normalizeHeading, orientVehicle, shortestRotation, sideViewScale } from "../../lib/vehicle-orientation";
import type { DriverLocationUpdate } from "../../lib/driver-location";

describe("vehicle marker orientation", () => {
  const right = { ...initialVehicleOrientation, facing: "right" as const };
  const side = { kind: "side" as const };
  it.each([
    [0, "right"], [45, "right"], [90, "right"], [135, "right"],
    [180, "right"], [225, "left"], [270, "left"], [315, "left"],
    [-90, "left"], [450, "right"],
  ] as const)("keeps side-view artwork upright at %s degrees", (heading, facing) => {
    const result = orientVehicle(right, { headingDegrees: heading, speedMetersPerSecond: 5 }, 0, side);
    expect(result.facing).toBe(facing);
    expect(result.heading).toBe(normalizeHeading(heading));
    expect(sideViewScale(result, "right")).toBe(facing === "right" ? 1 : -1);
    expect(result.rotation).toBe(0);
  });
  it("uses screen-relative bearing and keeps the last valid heading when stopped or unknown", () => {
    const east = orientVehicle(right, { headingDegrees: 90, speedMetersPerSecond: 5 }, 0, side);
    const stopped = orientVehicle(east, { headingDegrees: 270, speedMetersPerSecond: 0 }, 0, side);
    expect(stopped.heading).toBe(90);
    expect(stopped.facing).toBe("right");
    const rotatedMap = orientVehicle(stopped, { headingDegrees: null, speedMetersPerSecond: 0 }, 180, side);
    expect(rotatedMap.heading).toBe(90);
    expect(rotatedMap.facing).toBe("left");
    expect(orientVehicle(east, { headingDegrees: NaN, speedMetersPerSecond: 5 }, 0, side)).toEqual(east);
  });
  it("avoids side-to-side jitter around north and south", () => {
    const left = { ...right, facing: "left" as const };
    expect(orientVehicle(left, { headingDegrees: 2, speedMetersPerSecond: 5 }, 0, side).facing).toBe("left");
    expect(orientVehicle(left, { headingDegrees: 178, speedMetersPerSecond: 5 }, 0, side).facing).toBe("left");
  });
  it("unwraps top-view turns and accounts for artwork and map offsets", () => {
    expect(shortestRotation(350, 10)).toBe(370);
    expect(shortestRotation(10, 350)).toBe(-10);
    const result = orientVehicle({ ...right, rotation: 350 }, { headingDegrees: 100, speedMetersPerSecond: 5 }, 30, { kind: "top", artworkHeading: 60 });
    expect(result.rotation).toBe(370);
    expect(result.heading).toBe(100);
  });
  it("uses the same orientation logic for a future GPS location without enabling GPS", () => {
    const gps: DriverLocationUpdate = { driverId: "driver", vehicleType: "TAXI", latitude: 5.6, longitude: -.18, headingDegrees: 270, speedMetersPerSecond: 4, accuracyMeters: 10, positionTimestamp: 1000, receivedTimestamp: 1100, availability: "AVAILABLE", activeRideId: null, source: "GPS" };
    expect(orientVehicle(right, gps, 0, side).facing).toBe("left");
  });
});
