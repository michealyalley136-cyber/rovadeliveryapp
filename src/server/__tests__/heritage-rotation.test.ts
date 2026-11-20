import { describe, expect, it } from "vitest";
import { defaultIntervalMinutes, heritageArtwork, nextRotationTime, rotationIndex } from "../../config/heritage-rotation";

describe("heritage rotation", () => {
  it("uses shared three-hour windows anchored to the epoch", () => {
    const interval = 3 * 60 * 60 * 1000;
    expect(defaultIntervalMinutes).toBe(180);
    expect(rotationIndex(interval - 1, 180, 8)).toBe(0);
    expect(rotationIndex(interval, 180, 8)).toBe(1);
    expect(rotationIndex(interval * 9, 180, 8)).toBe(1);
    expect(nextRotationTime(interval + 17, 180)).toBe(interval * 2);
  });
  it("handles disabled or missing collections and configurable intervals", () => {
    expect(rotationIndex(123, 180, 0)).toBe(-1);
    expect(rotationIndex(60000, 1, 3)).toBe(1);
    expect(heritageArtwork).toHaveLength(8);
    expect(new Set(heritageArtwork.map((art) => art.id)).size).toBe(8);
  });
});
