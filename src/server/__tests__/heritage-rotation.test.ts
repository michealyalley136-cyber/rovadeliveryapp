import { describe, expect, it } from "vitest";
import { defaultIntervalSeconds, heritageArtwork, nextRotationTime, rotationIndex, rotationIntervals } from "../../config/heritage-rotation";

describe("heritage rotation", () => {
  it("uses shared windows anchored to the epoch and preserves three-hour intervals", () => {
    const interval = 3 * 60 * 60 * 1000;
    expect(defaultIntervalSeconds).toBe(60);
    expect(rotationIndex(interval - 1, 10800, 8)).toBe(0);
    expect(rotationIndex(interval, 10800, 8)).toBe(1);
    expect(rotationIndex(interval * 9, 10800, 8)).toBe(1);
    expect(nextRotationTime(interval + 17, 10800)).toBe(interval * 2);
  });
  it("handles disabled or missing collections and configurable intervals", () => {
    expect(rotationIndex(123, 180, 0)).toBe(-1);
    for (const seconds of rotationIntervals) {
      expect(rotationIndex(seconds * 1000, seconds, 8)).toBe(1);
      expect(rotationIndex(seconds * 1000 * 8, seconds, 8)).toBe(0);
    }
    expect(heritageArtwork).toHaveLength(8);
    expect(new Set(heritageArtwork.map((art) => art.id)).size).toBe(8);
  });
});
