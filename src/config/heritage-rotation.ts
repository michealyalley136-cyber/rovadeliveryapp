import manifest from "./heritage-manifest.json";

export type HeritageArtwork = { id: string; name: string; image: string };
export type HeritageRotation = { intervalMinutes: number; artworks: HeritageArtwork[] };
export const heritageArtwork: HeritageArtwork[] = manifest;
export const defaultIntervalMinutes = 180;

export function rotationIndex(timestamp: number, intervalMinutes: number, count: number) {
  if (!Number.isFinite(timestamp) || !Number.isInteger(intervalMinutes) || intervalMinutes <= 0 || count <= 0) return -1;
  const index = Math.floor(timestamp / (intervalMinutes * 60000));
  return ((index % count) + count) % count;
}

export function nextRotationTime(timestamp: number, intervalMinutes: number) {
  const interval = intervalMinutes * 60000;
  return (Math.floor(timestamp / interval) + 1) * interval;
}
