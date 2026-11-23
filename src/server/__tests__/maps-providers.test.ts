import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GeoapifyGeocodingProvider, GeoapifyRoutingProvider } from "@/server/maps/geoapify";
import { mapProviderAvailability, MapTilerStyleProvider } from "@/server/maps/config";

const accra = { longitude: -0.187, latitude: 5.6037 };
const tema = { longitude: -0.0167, latitude: 5.6698 };

describe("map providers", () => {
  beforeEach(() => {
    vi.stubEnv("ROVA_GEOAPIFY_API_KEY", "routing-test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses MapTiler Streets v4 only with the browser-restricted key", () => {
    vi.stubEnv("ROVA_MAPTILER_PUBLIC_KEY", "browser-test-key");
    const config = new MapTilerStyleProvider().config();
    expect(config?.styleUrl).toContain("/maps/streets-v4/style.json");
    expect(config?.styleUrl).toContain("key=browser-test-key");
  });

  it("restricts place search to Ghana and filters out-of-country results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { place_id: "accra", name: "Accra", formatted: "Accra, Ghana", lon: -0.187, lat: 5.6037, country_code: "gh" },
        { place_id: "london", name: "London", formatted: "London, UK", lon: -0.1276, lat: 51.5072, country_code: "gb" },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const places = await new GeoapifyGeocodingProvider().search("Accra", 6);
    const url = new URL(fetchMock.mock.calls[0][0].toString());
    expect(url.pathname).toBe("/v1/geocode/search");
    expect(url.searchParams.get("filter")).toBe("countrycode:gh");
    expect(url.searchParams.get("apiKey")).toBe("routing-test-key");
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ longitude: accra.longitude, latitude: accra.latitude, accuracy: "SEARCH" });
  });

  it("uses Geoapify autocomplete for live address suggestions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        place_id: "kotoka",
        name: "Kotoka International Airport",
        formatted: "Kotoka International Airport, Accra, Ghana",
        lon: -0.171,
        lat: 5.605,
        country_code: "gh",
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const places = await new GeoapifyGeocodingProvider().search("Kotoka", 6, undefined, "AUTOCOMPLETE");
    expect(new URL(fetchMock.mock.calls[0][0].toString()).pathname).toBe("/v1/geocode/autocomplete");
    expect(places[0]?.formattedAddress).toContain("Kotoka International Airport");
  });

  it("reverse geocodes through Geoapify", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        place_id: "accra-reverse",
        name: "Accra",
        formatted: "Accra, Greater Accra Region, Ghana",
        lon: accra.longitude,
        lat: accra.latitude,
        country_code: "gh",
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const place = await new GeoapifyGeocodingProvider().reverse(accra);
    const url = new URL(fetchMock.mock.calls[0][0].toString());
    expect(url.pathname).toBe("/v1/geocode/reverse");
    expect(place).toMatchObject({ name: "Accra", accuracy: "REVERSE" });
  });

  it("enables server map services without a MapTiler server key", () => {
    const availability = mapProviderAvailability();
    expect(availability).toEqual({
      geocoding: true,
      autocomplete: true,
      reverseGeocoding: true,
      driving: true,
      motorcycle: true,
    });
    expect(JSON.stringify(availability)).not.toContain("routing-test-key");
  });

  it.each(["DRIVING", "MOTORCYCLE"] as const)("returns a real-provider road geometry for %s", async (profile) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{
        geometry: { type: "LineString", coordinates: [[accra.longitude, accra.latitude], [tema.longitude, tema.latitude]] },
        properties: { distance: 23000, time: 1800 },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const route = await new GeoapifyRoutingProvider().route(accra, tema, profile);
    const url = new URL(fetchMock.mock.calls[0][0].toString());
    expect(url.searchParams.get("mode")).toBe(profile === "DRIVING" ? "drive" : "motorcycle");
    expect(route).toMatchObject({ distanceMeters: 23000, durationSeconds: 1800, profile, provider: "Geoapify" });
    expect(route.geometry.coordinates[0]).toEqual([accra.longitude, accra.latitude]);
  });

  it("does not fabricate a route when provider data is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [] }), { status: 200 })));
    await expect(new GeoapifyRoutingProvider().route(accra, tema, "DRIVING"))
      .rejects.toThrow("No drivable route was found");
  });

  it("fails before any provider request when credentials are absent", async () => {
    vi.stubEnv("ROVA_GEOAPIFY_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GeoapifyRoutingProvider().route(accra, tema, "DRIVING"))
      .rejects.toThrow("provider is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not request Geoapify geocoding when its server key is absent", async () => {
    vi.stubEnv("ROVA_GEOAPIFY_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GeoapifyGeocodingProvider().search("Kotoka International Airport", 6))
      .rejects.toThrow("provider is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
