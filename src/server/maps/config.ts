import "server-only";
import type { MapStyleProvider } from "@/lib/maps/types";
import { MapProviderError } from "./errors";

export class MapTilerStyleProvider implements MapStyleProvider {
  config() {
    const key = process.env.ROVA_MAPTILER_PUBLIC_KEY;
    if (!key) return null;
    return {
      styleUrl: `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(key)}`,
      provider: "MapTiler",
      attribution: "© MapTiler © OpenStreetMap contributors",
    };
  }
}

export function mapStyleConfig() {
  return new MapTilerStyleProvider().config();
}

export function mapProviderAvailability() {
  const geoapify = Boolean(process.env.ROVA_GEOAPIFY_API_KEY);
  return {
    geocoding: geoapify,
    autocomplete: geoapify,
    reverseGeocoding: geoapify,
    driving: geoapify,
    motorcycle: geoapify,
  };
}

export function requireServerMapKey(name: "ROVA_GEOAPIFY_API_KEY") {
  const value = process.env[name];
  if (!value) throw new MapProviderError("The ROVA map provider is not configured for this deployment.");
  return value;
}
