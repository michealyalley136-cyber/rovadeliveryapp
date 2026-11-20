import "server-only";
import { access } from "node:fs/promises";
import path from "node:path";
import { defaultIntervalMinutes, heritageArtwork, type HeritageRotation } from "@/config/heritage-rotation";
import { getDatabase } from "@/server/db";

export async function getHeritageRotation(): Promise<HeritageRotation> {
  const settings = await getDatabase().heritageSettings.findUnique({ where: { id: "global" } });
  const disabled = new Set(settings?.disabledIds ?? []);
  const artworks = await Promise.all(heritageArtwork.filter((art) => !disabled.has(art.id)).map(async (art) => {
    try {
      await access(path.join(process.cwd(), "public", "heritage", path.basename(art.image)));
      return art;
    } catch (error) {
      console.error("ROVA heritage artwork unavailable", { id: art.id, error });
      return null;
    }
  }));
  return { intervalMinutes: settings?.intervalMinutes ?? defaultIntervalMinutes, artworks: artworks.filter((art) => art !== null) };
}
