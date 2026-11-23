import "server-only";
import type {
  GeoPlace,
  GeocodingMode,
  GeocodingProvider,
  MapCoordinates,
  RouteProfile,
  RouteResult,
  RoutingProvider,
} from "@/lib/maps/types";
import { isWithinGhana } from "@/lib/maps/ghana";
import { requireServerMapKey } from "./config";
import { fetchMapProvider } from "./http";
import { MapProviderError } from "./errors";

type GeoapifyPlace = {
  place_id?: string;
  lon?: number;
  lat?: number;
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  town?: string;
  state?: string;
  country_code?: string;
};

type GeoapifyRoute = {
  properties?: { distance?: number; time?: number; mode?: string };
  geometry?: GeoJSON.LineString | GeoJSON.MultiLineString;
};

function place(result: GeoapifyPlace, accuracy: GeoPlace["accuracy"]): GeoPlace | null {
  const coordinates = { longitude: Number(result.lon), latitude: Number(result.lat) };
  if (!isWithinGhana(coordinates)) return null;
  const name = result.name ?? result.address_line1 ?? "Selected Ghana location";
  const formattedAddress = result.formatted
    ?? [result.address_line1, result.address_line2].filter(Boolean).join(", ")
    ?? name;
  return {
    ...coordinates,
    id: result.place_id ?? `${coordinates.longitude},${coordinates.latitude}`,
    name,
    formattedAddress: formattedAddress || name,
    city: result.city ?? result.town,
    region: result.state,
    accuracy,
  };
}

export class GeoapifyGeocodingProvider implements GeocodingProvider {
  async search(
    query: string,
    limit: number,
    signal?: AbortSignal,
    mode: GeocodingMode = "SEARCH",
  ): Promise<GeoPlace[]> {
    const endpoint = mode === "AUTOCOMPLETE" ? "autocomplete" : "search";
    const url = new URL(`https://api.geoapify.com/v1/geocode/${endpoint}`);
    url.searchParams.set("text", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "en");
    url.searchParams.set("filter", "countrycode:gh");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("apiKey", requireServerMapKey("ROVA_GEOAPIFY_API_KEY"));
    const payload = await fetchMapProvider(url, signal) as { results?: GeoapifyPlace[] };
    return (payload.results ?? [])
      .map((result) => place(result, "SEARCH"))
      .filter((result): result is GeoPlace => result !== null);
  }

  async reverse(coordinates: MapCoordinates, signal?: AbortSignal): Promise<GeoPlace | null> {
    if (!isWithinGhana(coordinates)) throw new MapProviderError("Choose a location within Ghana.", 400);
    const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
    url.searchParams.set("lat", String(coordinates.latitude));
    url.searchParams.set("lon", String(coordinates.longitude));
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", "1");
    url.searchParams.set("apiKey", requireServerMapKey("ROVA_GEOAPIFY_API_KEY"));
    const payload = await fetchMapProvider(url, signal) as { results?: GeoapifyPlace[] };
    return payload.results
      ?.map((result) => place(result, "REVERSE"))
      .find((result) => result !== null) ?? null;
  }
}

export class GeoapifyRoutingProvider implements RoutingProvider {
  async route(start: MapCoordinates, end: MapCoordinates, profile: RouteProfile, signal?: AbortSignal): Promise<RouteResult> {
    if (!isWithinGhana(start) || !isWithinGhana(end)) throw new MapProviderError("Both route points must be within Ghana.", 400);
    const url = new URL("https://api.geoapify.com/v1/routing");
    url.searchParams.set("waypoints", `${start.latitude},${start.longitude}|${end.latitude},${end.longitude}`);
    url.searchParams.set("mode", profile === "MOTORCYCLE" ? "motorcycle" : "drive");
    url.searchParams.set("format", "geojson");
    url.searchParams.set("units", "metric");
    url.searchParams.set("traffic", "approximated");
    url.searchParams.set("apiKey", requireServerMapKey("ROVA_GEOAPIFY_API_KEY"));
    const payload = await fetchMapProvider(url, signal) as { features?: GeoapifyRoute[] };
    const feature = payload.features?.[0];
    if (!feature?.geometry || feature.properties?.distance === undefined || feature.properties.time === undefined) {
      throw new MapProviderError("No drivable route was found for those locations.", 404);
    }
    const geometry: GeoJSON.LineString = feature.geometry.type === "LineString"
      ? feature.geometry
      : {
          type: "LineString",
          coordinates: feature.geometry.coordinates.flat(),
        };
    const distanceMeters = Number(feature.properties.distance);
    const durationSeconds = Number(feature.properties.time);
    if (
      geometry.coordinates.length < 2 ||
      geometry.coordinates.some(([longitude, latitude]) => !isWithinGhana({ longitude, latitude })) ||
      !Number.isFinite(distanceMeters) || distanceMeters <= 0 ||
      !Number.isFinite(durationSeconds) || durationSeconds < 0
    ) throw new MapProviderError("The map provider returned an invalid route.", 502);
    return {
      geometry,
      distanceMeters,
      durationSeconds,
      start,
      end,
      profile,
      provider: "Geoapify",
    };
  }
}
