import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getEnabledSlides,
  getNextSlideIndex,
  getPreviousSlideIndex,
  heroSlides,
} from "../../config/hero-slides";

const campaignSlides = [
  { id: "brand-introduction", image: "Move. Deliver. Earn. With ROVA-1.png" },
  { id: "safe-rides", image: "ROVA-Ghana-Safe-Reliable-Rides-3.png" },
  { id: "earning-opportunity", image: "Move-Deliver-Earn-with-ROVA-Ghana-2.png" },
  { id: "delivery", image: "ROVA-Ghana-Deliver-More-Earn-More-5.png" },
  { id: "local-commerce", image: "Deliver-More-Grow-with-ROVA-6.png" },
  { id: "multiple-services", image: "ROVA-Ghana-One-Platform-Many-Opportunities-7.png" },
  { id: "vehicle-access", image: "Your Journey to Earning Starts Here-8.png" },
  { id: "network", image: "ROVA-Ghana-Safe-Rides-New-Opportunities-4.png" },
  { id: "applications-open", image: "ROVA Ghana_ Your Next Opportunity-9.png" },
  { id: "ghardware-marketplace", image: "GHARDWARE-Ghana-Marketplace-Banner-10.png" },
];

function getPngDimensions(filePath: string) {
  const contents = fs.readFileSync(filePath);
  expect(contents.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

describe("hero slideshow configuration and navigation", () => {
  it("preserves the ten campaign slides and validates their image references and metadata", () => {
    const imagesDir = path.resolve(process.cwd(), "src/images");
    const configPath = path.resolve(process.cwd(), "src/config/hero-slides.ts");
    const config = fs.readFileSync(configPath, "utf8");
    const importedImages = [...config.matchAll(/from\s+["']\.\.\/images\/([^"']+)["']/g)].map((match) => match[1]);
    const enabled = getEnabledSlides(heroSlides);

    expect(heroSlides.map(({ id }) => id)).toEqual(campaignSlides.map(({ id }) => id));
    expect(new Set(heroSlides.map(({ id }) => id)).size).toBe(heroSlides.length);
    expect(enabled).toHaveLength(campaignSlides.length);
    expect(importedImages).toHaveLength(campaignSlides.length);

    for (const slide of enabled) {
      const expected = campaignSlides.find(({ id }) => id === slide.id);
      expect(expected).toBeDefined();
      expect(importedImages).toContain(expected!.image);
      const filePath = path.join(imagesDir, expected!.image);
      expect(fs.existsSync(filePath)).toBe(true);
      const dimensions = getPngDimensions(filePath);
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.height).toBeGreaterThan(0);

      const asset = slide.image as unknown as string | { src?: string; width?: number; height?: number };
      const src = typeof asset === "string" ? asset : asset?.src;
      expect(src).toBeTruthy();
      expect(src).not.toContain(",");
      expect(src).not.toContain("/_next/image");
      if (typeof asset !== "string") {
        expect(asset.width).toBe(dimensions.width);
        expect(asset.height).toBe(dimensions.height);
      }
    }
  });

  it("wraps next and previous slide indices cleanly", () => {
    const total = getEnabledSlides(heroSlides).length;
    expect(getNextSlideIndex(0, total)).toBe(1);
    expect(getNextSlideIndex(total - 1, total)).toBe(0);
    expect(getPreviousSlideIndex(0, total)).toBe(total - 1);
    expect(getPreviousSlideIndex(3, 10)).toBe(2);
    expect(getNextSlideIndex(0, 1)).toBe(0);
    expect(getPreviousSlideIndex(0, 1)).toBe(0);
  });
});
