import type { MapCoordinates } from "./types";
import { validMapCoordinates } from "./ghana";

type PositionedMarker<TMap> = {
  setLngLat(coordinates: [number, number]): unknown;
  addTo(map: TMap): unknown;
};

export function markerCoordinates(point: MapCoordinates): [number, number] | null {
  if (!validMapCoordinates(point)) return null;
  return [point.longitude, point.latitude];
}

export function addMarkerAt<TMap, TMarker extends PositionedMarker<TMap>>(
  marker: TMarker,
  map: TMap,
  point: MapCoordinates,
): TMarker | null {
  const coordinates = markerCoordinates(point);
  if (!coordinates) return null;
  marker.setLngLat(coordinates);
  marker.addTo(map);
  return marker;
}
