import { describe, expect, it } from "vitest";
import { LiveGPSDriverLocationProvider } from "../../lib/driver-location";
import { SimulatedDriverLocationProvider, syntheticPickup } from "../../lib/simulated-driver-location";

describe("synthetic driver locations", () => {
  it("is deterministic and advances different drivers independently on the road graph", () => {
    const first = new SimulatedDriverLocationProvider(42);
    const second = new SimulatedDriverLocationProvider(42);
    const before = first.locations(0);
    expect(second.locations(0)).toEqual(before);
    let after = before;
    for (let t = 1000; t <= 300000; t += 1000) {
      after = first.locations(t);
      expect(second.locations(t)).toEqual(after);
      for (const location of after) {
        const x = (location.longitude - syntheticPickup[0]) / .008;
        const y = (location.latitude - syntheticPickup[1]) / .007;
        expect(Math.min(Math.abs(x - Math.round(x)), Math.abs(y - Math.round(y)))).toBeLessThan(1e-8);
        expect(location.source).toBe("SIMULATION");
      }
    }
    expect(new Set(after.map((item) => item.speedMetersPerSecond)).size).toBeGreaterThan(10);
    expect(after.some((item, index) => item.longitude !== before[index].longitude || item.latitude !== before[index].latitude)).toBe(true);
    expect(new SimulatedDriverLocationProvider(43).locations(0)).not.toEqual(before);
  });
  it("freezes when the simulation clock is paused", () => {
    const provider = new SimulatedDriverLocationProvider(17);
    const before = provider.locations(1000);
    expect(provider.locations(1000)).toEqual(before);
  });
  it("does not accept simulation or GPS updates into the disabled live provider", () => {
    const live = new LiveGPSDriverLocationProvider();
    const simulation = new SimulatedDriverLocationProvider(1).locations(0)[0];
    expect(() => live.acceptLocation(simulation)).toThrow(/disabled/);
    expect(() => live.acceptLocation({ ...simulation, source: "GPS" })).toThrow(/disabled/);
    expect(live.locations()).toEqual([]);
  });
});
