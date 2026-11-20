import manifest from "./heritage-manifest.json";

export type HeritageArtwork = { id: string; name: string; image: string };
export type HeritageRotation = { intervalSeconds: number; artworks: HeritageArtwork[] };
export const heritageArtwork: HeritageArtwork[] = manifest;
export const defaultIntervalSeconds = 60;
export const rotationIntervals = [15, 30, 60, 120, 300, 900, 1800, 3600, 10800] as const;

export function rotationIndex(timestamp: number, intervalSeconds: number, count: number) {
  if (!Number.isFinite(timestamp) || !Number.isInteger(intervalSeconds) || intervalSeconds <= 0 || count <= 0) return -1;
  const index = Math.floor(timestamp / (intervalSeconds * 1000));
  return ((index % count) + count) % count;
}

export function nextRotationTime(timestamp: number, intervalSeconds: number) {
  const interval = intervalSeconds * 1000;
  return (Math.floor(timestamp / interval) + 1) * interval;
}
