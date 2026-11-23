import type { MapCoordinates } from "./types";

export function routeInputKey(
  service: "RIDE" | "TAXI",
  pickup: MapCoordinates | null,
  destination: MapCoordinates | null,
) {
  if (!pickup || !destination) return null;
  return [
    service,
    pickup.longitude,
    pickup.latitude,
    destination.longitude,
    destination.latitude,
  ].join(":");
}

export function shouldAutocomplete(query: string, selectedQuery: string) {
  const normalized = query.trim();
  return normalized.length >= 3 && normalized !== selectedQuery.trim();
}
