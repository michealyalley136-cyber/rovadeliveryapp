import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = join(process.cwd(), "public");
const read = (path: string) => readFileSync(join(publicDir, path));

describe("installable app icons", () => {
  it.each([
    ["favicon-16x16.png", 16], ["favicon-32x32.png", 32], ["favicon-48x48.png", 48], ["favicon-64x64.png", 64],
    ["apple-touch-icon.png", 180], ["icon-144x144.png", 144], ["icon-192x192.png", 192],
    ["icon-256x256.png", 256], ["icon-384x384.png", 384], ["icon-512x512.png", 512],
    ["maskable-icon-192x192.png", 192], ["maskable-icon-512x512.png", 512],
  ])("%s has the requested PNG dimensions", (name, size) => {
    const png = read(`icons/${name}`);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  });

  it("includes 16, 32 and 48 pixel icons in the ICO", () => {
    const ico = read("favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);
  });

  it("references existing correctly sized icons in the install manifest", () => {
    const manifest = JSON.parse(read("manifest.webmanifest").toString()) as {
      name: string; short_name: string; start_url: string; scope: string; display: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(manifest).toMatchObject({ name: "ROVA Ghana", short_name: "ROVA", start_url: "/", scope: "/", display: "standalone" });
    for (const icon of manifest.icons) {
      const png = read(icon.src.slice(1));
      expect(icon.type).toBe("image/png");
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    expect(manifest.icons.filter((icon) => icon.purpose === "maskable").map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
  });
});
