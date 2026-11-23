import type { MapCoordinates, ServiceZone } from "./types";

export const ghanaBounds = { west: -3.30, south: 4.45, east: 1.25, north: 11.25 } as const;
export const ghanaCenter: MapCoordinates = { longitude: -0.1870, latitude: 5.6037 };
export const ghanaInitialView = { center: ghanaCenter, zoom: 11 };

export const ghanaServiceZone: ServiceZone = {
  id: "ghana-mapping-coverage",
  name: "Ghana",
  active: true,
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-3.25, 4.75], [-2.55, 4.72], [-1.62, 4.72], [-0.72, 5.15], [0.45, 5.65],
      [1.20, 6.05], [0.95, 6.95], [0.20, 7.55], [0.15, 8.65], [-0.15, 9.45],
      [-0.90, 10.90], [-1.65, 11.15], [-2.50, 11.05], [-2.80, 9.80],
      [-3.18, 8.80], [-3.22, 7.20], [-3.10, 5.65], [-3.25, 4.75],
    ]],
  },
};

export const ghanaCoverageChecks = [
  { name: "Accra", coordinates: { longitude: -0.1870, latitude: 5.6037 } },
  { name: "Tema", coordinates: { longitude: -0.0167, latitude: 5.6698 } },
  { name: "Kumasi", coordinates: { longitude: -1.6244, latitude: 6.6885 } },
  { name: "Tamale", coordinates: { longitude: -0.8424, latitude: 9.4075 } },
  { name: "Takoradi", coordinates: { longitude: -1.7554, latitude: 4.8960 } },
  { name: "Cape Coast", coordinates: { longitude: -1.2466, latitude: 5.1054 } },
] as const;

export function validMapCoordinates(value: unknown): value is MapCoordinates {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<MapCoordinates>;
  return typeof point.latitude === "number" && Number.isFinite(point.latitude) &&
    point.latitude >= -90 && point.latitude <= 90 &&
    typeof point.longitude === "number" && Number.isFinite(point.longitude) &&
    point.longitude >= -180 && point.longitude <= 180;
}

function inRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [x1, y1] = ring[current];
    const [x2, y2] = ring[previous];
    const intersects = ((y1 > latitude) !== (y2 > latitude)) &&
      longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isWithinGhana(point: MapCoordinates) {
  return validMapCoordinates(point) &&
    inRing(point.longitude, point.latitude, ghanaServiceZone.geometry.coordinates[0]);
}

export function formatCoordinates(point: MapCoordinates) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}
