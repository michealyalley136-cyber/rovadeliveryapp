import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getEnabledSlides,
  getNextSlideIndex,
  getPreviousSlideIndex,
  heroSlides,
} from "../../config/hero-slides";

describe("hero slideshow configuration and navigation", () => {
  it("loads every image file in src/images as an enabled slide without commas", () => {
    const imagesDir = path.resolve(process.cwd(), "src/images");
    const files = fs.readdirSync(imagesDir).filter((file) => /\.(png|jpe?g|webp)$/i.test(file));
    const enabled = getEnabledSlides(heroSlides);

    expect(files).toHaveLength(10);
    expect(heroSlides).toHaveLength(files.length);
    expect(enabled).toHaveLength(files.length);

    for (const file of files) {
      expect(file).not.toContain(",");
    }

    for (const slide of enabled) {
      const asset = slide.image as unknown as string | { src?: string };
      const src = typeof asset === "string" ? asset : asset?.src;
      expect(src).toBeTruthy();
      expect(src).not.toContain(",");
      expect(src).not.toContain("/_next/image");
    }
  });

  it("wraps next and previous slide indices cleanly", () => {
    expect(getNextSlideIndex(0, 10)).toBe(1);
    expect(getNextSlideIndex(9, 10)).toBe(0);
    expect(getPreviousSlideIndex(0, 10)).toBe(9);
    expect(getPreviousSlideIndex(3, 10)).toBe(2);
    expect(getNextSlideIndex(0, 1)).toBe(0);
    expect(getPreviousSlideIndex(0, 1)).toBe(0);
  });
});
