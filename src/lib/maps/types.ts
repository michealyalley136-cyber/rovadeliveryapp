export type MapCoordinates = { longitude: number; latitude: number };

export type GeoPlace = MapCoordinates & {
  id: string;
  name: string;
  formattedAddress: string;
  city?: string;
  region?: string;
  accuracy: "SEARCH" | "REVERSE" | "GPS" | "MAP";
};

export type RouteProfile = "DRIVING" | "MOTORCYCLE";
export type GeocodingMode = "SEARCH" | "AUTOCOMPLETE";

export type RouteResult = {
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
  start: MapCoordinates;
  end: MapCoordinates;
  profile: RouteProfile;
  provider: string;
};

export type MapStyleConfig = {
  styleUrl: string;
  provider: string;
  attribution: string;
};

export type ServiceZone = {
  id: string;
  name: string;
  active: boolean;
  geometry: GeoJSON.Polygon;
};

export type MapVehicleUpdate = MapCoordinates & {
  vehicleId: string;
  vehicleType: "MOTORCYCLE" | "TAXI" | "DELIVERY" | "FLEET";
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
  accuracyMeters: number | null;
  positionTimestamp: number;
  source: "SIMULATION" | "GPS";
};

export interface VehicleLocationProvider {
  subscribe(
    listener: (updates: readonly MapVehicleUpdate[]) => void,
    options?: { signal?: AbortSignal },
  ): () => void;
}

export interface MapStyleProvider {
  config(): MapStyleConfig | null;
}

export interface GeocodingProvider {
  search(query: string, limit: number, signal?: AbortSignal, mode?: GeocodingMode): Promise<GeoPlace[]>;
  reverse(coordinates: MapCoordinates, signal?: AbortSignal): Promise<GeoPlace | null>;
}

export interface RoutingProvider {
  route(start: MapCoordinates, end: MapCoordinates, profile: RouteProfile, signal?: AbortSignal): Promise<RouteResult>;
}
