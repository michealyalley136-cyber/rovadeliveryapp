import { describe, expect, it, vi } from "vitest";
import {
  formatCoordinates,
  ghanaCoverageChecks,
  isWithinGhana,
  validMapCoordinates,
} from "@/lib/maps/ghana";
import { addMarkerAt } from "@/lib/maps/marker-lifecycle";

describe("Ghana map geography", () => {
  it.each(ghanaCoverageChecks)("includes $name in mapping coverage", ({ coordinates }) => {
    expect(validMapCoordinates(coordinates)).toBe(true);
    expect(isWithinGhana(coordinates)).toBe(true);
  });

  it("rejects invalid and out-of-country coordinates", () => {
    expect(validMapCoordinates({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isWithinGhana({ latitude: 51.5072, longitude: -0.1276 })).toBe(false);
    expect(isWithinGhana({ latitude: Number.NaN, longitude: -0.2 })).toBe(false);
  });

  it("uses human-readable latitude then longitude display", () => {
    expect(formatCoordinates({ longitude: -0.187, latitude: 5.6037 })).toBe("5.60370, -0.18700");
  });

  it("sets finite longitude-latitude coordinates before adding a marker", () => {
    const calls: string[] = [];
    const marker = {
      setLngLat: (coordinates: [number, number]) => calls.push(`set:${coordinates.join(",")}`),
      addTo: () => calls.push("add"),
    };
    const map = {};

    expect(addMarkerAt(marker, map, { longitude: -0.171, latitude: 5.605 })).toBe(marker);
    expect(calls).toEqual(["set:-0.171,5.605", "add"]);
  });

  it("does not add a marker with unavailable or non-finite coordinates", () => {
    const marker = {
      setLngLat: vi.fn(),
      addTo: vi.fn(),
    };

    expect(addMarkerAt(marker, {}, { longitude: Number.NaN, latitude: 5.605 })).toBeNull();
    expect(marker.setLngLat).not.toHaveBeenCalled();
    expect(marker.addTo).not.toHaveBeenCalled();
  });
});
