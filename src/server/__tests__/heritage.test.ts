import { describe, expect, it } from "vitest";
import { ghanaRegions, heritageLandmarks, selectHeritageLandmark, type HeritageLandmark } from "../../config/heritage";

const first: HeritageLandmark = { id: "first", name: "First", region: "Greater Accra", image: "/first.webp", enabled: true, source: "source", author: "author", license: "license", licenseUrl: "license" };
const second: HeritageLandmark = { ...first, id: "second", region: "Ashanti", image: "/second.webp" };

describe("heritage selection", () => {
  it("uses a fallback when no reviewed images are available", () => {
    expect(ghanaRegions).toHaveLength(16);
    expect(selectHeritageLandmark(heritageLandmarks, [], "2026-11-20")).toBeNull();
    expect(selectHeritageLandmark([{ ...first, image: null }], [], "2026-11-20")).toBeNull();
  });
  it("prioritizes campaigns over regions and ignores unavailable campaign images", () => {
    const campaigns = [
      { landmarkId: "first", kind: "occasion" as const, enabled: true, start: "2026-11-01", end: "2026-11-30" },
      { landmarkId: "second", kind: "featured" as const, enabled: true, start: "2026-11-20", end: "2026-11-20" },
    ];
    expect(selectHeritageLandmark([first, second], campaigns, "2026-11-20", "Greater Accra")?.id).toBe("second");
    expect(selectHeritageLandmark([first, { ...second, enabled: false }], campaigns, "2026-11-20")?.id).toBe("first");
    expect(selectHeritageLandmark([first, second], campaigns, "2026-12-01", "Ashanti")?.id).toBe("second");
  });
  it("rotates deterministically by date", () => {
    expect(selectHeritageLandmark([first, second], [], "2026-11-20")?.id).toBe(selectHeritageLandmark([first, second], [], "2026-11-20")?.id);
    expect(selectHeritageLandmark([first, second], [], "2026-11-20")?.id).not.toBe(selectHeritageLandmark([first, second], [], "2026-11-21")?.id);
  });
});
