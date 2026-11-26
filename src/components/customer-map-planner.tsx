"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RovaMap } from "@/components/rova-map";
import { formatCoordinates, isWithinGhana } from "@/lib/maps/ghana";
import { routeInputKey, shouldAutocomplete } from "@/lib/maps/planner-state";
import type { GeoPlace, MapCoordinates, MapStyleConfig, RouteResult, ServiceZone } from "@/lib/maps/types";
import type { BookingDto } from "@/server/booking-types";

type Target = "pickup" | "destination";
type Config = {
  style: MapStyleConfig | null;
  serviceZones: ServiceZone[];
  providers: { geocoding: boolean; autocomplete: boolean; reverseGeocoding: boolean; driving: boolean; motorcycle: boolean };
};

function placeAt(point: MapCoordinates, accuracy: GeoPlace["accuracy"]): GeoPlace {
  return {
    ...point,
    id: `${point.longitude},${point.latitude}`,
    name: "Map-selected location",
    formattedAddress: formatCoordinates(point),
    accuracy,
  };
}

async function responseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "The map service is unavailable.");
  return payload;
}

function LocationSearch({ target, onSelect, disabled, initialValue = "" }: { target: Target; onSelect: (place: GeoPlace) => void; disabled: boolean; initialValue?: string }) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const selectedQuery = useRef(initialValue);

  const search = useCallback(async (value: string, signal?: AbortSignal, autocomplete = false) => {
    const normalized = value.trim();
    if (normalized.length < 3 || disabled) return;
    setBusy(true);
    setResults([]);
    setError("");
    try {
      const payload = await responseJson(await fetch("/api/maps/geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: normalized, limit: 6, autocomplete }),
        signal,
      }));
      if (signal?.aborted) return;
      setResults(payload.places ?? []);
      if (!payload.places?.length) setError(`No Ghana results found for ${normalized}.`);
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Location search is unavailable.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (disabled || !shouldAutocomplete(query, selectedQuery.current)) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => void search(query, controller.signal, true), 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, query, search]);

  return <div className="rova-location-search">
    <form onSubmit={(event) => {
      event.preventDefault();
      request.current?.abort();
      void search(query);
    }}>
      <label htmlFor={`rova-${target}-search`}>{target === "pickup" ? "Pickup address or landmark" : "Destination address or landmark"}</label>
      <div><input id={`rova-${target}-search`} value={query} onChange={(event) => {
        selectedQuery.current = "";
        setQuery(event.target.value);
      }} placeholder={target === "pickup" ? "e.g. Kotoka Airport" : "e.g. Kumasi Central Market"} minLength={2} maxLength={120} disabled={disabled} /><button type="submit" disabled={disabled || busy || query.trim().length < 2}>{busy ? "Searching…" : "Search"}</button></div>
    </form>
    {error && <p className="rova-map-inline-error" role="alert">{error}</p>}
    {results.length > 0 && <ul aria-label={`${target} search results`}>{results.map((place) => <li key={place.id}><button type="button" onClick={() => {
      request.current?.abort();
      selectedQuery.current = place.formattedAddress;
      setResults([]);
      setError("");
      setBusy(false);
      setQuery(place.formattedAddress);
      onSelect(place);
    }}><strong>{place.name}</strong><span>{place.formattedAddress}</span></button></li>)}</ul>}
  </div>;
}

export function CustomerMapPlanner({
  service,
  initialPickup = "",
  initialDestination = "",
  persistentBookingEnabled = false,
}: {
  service: "RIDE" | "TAXI";
  initialPickup?: string;
  initialDestination?: string;
  persistentBookingEnabled?: boolean;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState("");
  const [pickup, setPickup] = useState<GeoPlace | null>(null);
  const [destination, setDestination] = useState<GeoPlace | null>(null);
  const [target, setTarget] = useState<Target | null>("pickup");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [completedRouteKey, setCompletedRouteKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingDto | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const routeRequest = useRef<AbortController | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const currentRouteKey = routeInputKey(service, pickup, destination);
  const route = completedRouteKey === currentRouteKey ? routeResult : null;

  useEffect(() => {
    let active = true;
    void fetch("/api/maps/config", { cache: "no-store" })
      .then(responseJson)
      .then((value) => { if (active) setConfig(value); })
      .catch((reason) => { if (active) setConfigError(reason instanceof Error ? reason.message : "Map configuration is unavailable."); });
    return () => { active = false; };
  }, []);

  const clearRoute = useCallback(() => {
    routeRequest.current?.abort();
    routeRequest.current = null;
    setBusy(false);
    setRouteResult(null);
    setCompletedRouteKey(null);
    idempotencyKey.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    routeRequest.current?.abort();
    routeRequest.current = null;
    queueMicrotask(() => {
      if (active) setBusy(false);
    });
    return () => {
      active = false;
      routeRequest.current?.abort();
    };
  }, [service]);

  const choose = useCallback((which: Target, place: GeoPlace) => {
    setError("");
    clearRoute();
    if (!isWithinGhana(place)) {
      setError("Choose a location inside Ghana.");
      return;
    }
    if (which === "pickup") {
      setPickup(place);
      setTarget("destination");
    } else {
      setDestination(place);
      setTarget(null);
    }
  }, [clearRoute]);

  const movePin = useCallback((which: Target, point: MapCoordinates) => {
    const place = placeAt(point, "MAP");
    choose(which, place);
    void fetch("/api/maps/reverse", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(point),
    }).then(responseJson).then((payload) => {
      if (payload.place) {
        if (which === "pickup") setPickup(payload.place);
        else setDestination(payload.place);
      }
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "The location could not be described. The selected coordinates are still available.");
    });
  }, [choose]);

  function useGps() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location permission is unavailable. Search or tap the map to set your pickup.");
      setTarget("pickup");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { longitude: coords.longitude, latitude: coords.latitude };
        if (!isWithinGhana(point)) {
          setError("Your current position is outside Ghana. Search or tap the map to set a pickup.");
          setGpsBusy(false);
          return;
        }
        choose("pickup", placeAt(point, "GPS"));
        setGpsBusy(false);
        void fetch("/api/maps/reverse", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(point),
        }).then(responseJson).then((payload) => { if (payload.place) setPickup(payload.place); }).catch((reason) => {
          setError(reason instanceof Error ? reason.message : "The coordinates were selected, but a place name is unavailable.");
        });
      },
      () => {
        setError("Location permission was not granted. Search, enter the map manually, or tap to set your pickup.");
        setGpsBusy(false);
        setTarget("pickup");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function calculateRoute() {
    if (!pickup || !destination) {
      setError("Choose both pickup and destination.");
      return;
    }
    routeRequest.current?.abort();
    const controller = new AbortController();
    const requestKey = routeInputKey(service, pickup, destination);
    routeRequest.current = controller;
    setBusy(true);
    setError("");
    setRouteResult(null);
    setCompletedRouteKey(null);
    try {
      const payload = await responseJson(await fetch(`/api/maps/route/${service}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pickup,
          destination,
        }),
        signal: controller.signal,
      }));
      if (controller.signal.aborted || routeRequest.current !== controller) return;
      setRouteResult(payload.route);
      setCompletedRouteKey(requestKey);
      idempotencyKey.current = crypto.randomUUID();
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      if (!controller.signal.aborted && routeRequest.current === controller) {
        setError(reason instanceof Error ? reason.message : "A road route is unavailable.");
      }
    } finally {
      if (routeRequest.current === controller) {
        routeRequest.current = null;
        setBusy(false);
      }
    }
  }

  async function submitBooking() {
    if (!pickup || !destination || !route || !persistentBookingEnabled) return;
    setSubmitBusy(true);
    setError("");
    try {
      const payload = await responseJson(await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service,
          pickupName: pickup.name,
          pickupLatitude: pickup.latitude,
          pickupLongitude: pickup.longitude,
          destinationName: destination.name,
          destinationLatitude: destination.latitude,
          destinationLongitude: destination.longitude,
          idempotencyKey: idempotencyKey.current ?? crypto.randomUUID(),
        }),
      }));
      setConfirmedBooking(payload.booking);
      setDetailsOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The booking request could not be saved.");
    } finally {
      setSubmitBusy(false);
    }
  }

  if (confirmedBooking) {
    return <section className="rova-booking-confirmation" aria-live="polite">
      <span className="customer-kicker">REQUEST RECEIVED</span>
      <div className="rova-confirmation-mark" aria-hidden="true">ROVA</div>
      <h2>Your pilot booking is saved</h2>
      <p className="rova-booking-reference">{confirmedBooking.reference}</p>
      <dl>
        <div><dt>Service</dt><dd>{confirmedBooking.service === "RIDE" ? "Motorcycle" : "Taxi"}</dd></div>
        <div><dt>Pickup</dt><dd>{confirmedBooking.pickupName}</dd></div>
        <div><dt>Destination</dt><dd>{confirmedBooking.destinationName}</dd></div>
        <div><dt>Road distance</dt><dd>{(confirmedBooking.routeDistanceMeters / 1000).toFixed(1)} km</dd></div>
        <div><dt>Estimated travel time</dt><dd>{Math.ceil(confirmedBooking.routeDurationSeconds / 60)} min</dd></div>
        <div><dt>Created</dt><dd>{new Date(confirmedBooking.createdAt).toLocaleString()}</dd></div>
        <div><dt>Status</dt><dd>Request received</dd></div>
      </dl>
      <p className="rova-pilot-disclaimer">This is a non-operational pilot booking. No driver will be dispatched or arrive, and no payment has been collected.</p>
      <div className="rova-confirmation-actions">
        <button type="button" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? "Hide booking" : "View booking"}</button>
        <a className="customer-primary" href="/customer">Return to dashboard</a>
      </div>
      {detailsOpen && <pre className="rova-booking-details">{JSON.stringify({
        reference: confirmedBooking.reference,
        service: confirmedBooking.service,
        status: confirmedBooking.status,
        pickup: confirmedBooking.pickupName,
        destination: confirmedBooking.destinationName,
        distanceMeters: confirmedBooking.routeDistanceMeters,
        durationSeconds: confirmedBooking.routeDurationSeconds,
        createdAt: confirmedBooking.createdAt,
      }, null, 2)}</pre>}
    </section>;
  }

  return <section className="rova-map-planner" aria-labelledby="rova-map-planner-title">
    <div className="customer-section-heading"><div><h2 id="rova-map-planner-title">Plan your journey</h2><p className="rova-selected-service">{service === "RIDE" ? "Motorcycle service" : "Taxi service"}</p></div><span className="rova-map-phase">PLANNING ONLY · NO DISPATCH</span></div>
    <p className="rova-map-intro">Search or correct map pins, then request a road route. This does not book a driver, expose live driver locations, or collect payment.</p>
    {configError && <p className="rova-map-inline-error" role="alert">{configError}</p>}
    <div className="rova-map-layout">
      <div className="rova-map-panel">
        <LocationSearch key={`pickup-${pickup?.id ?? "empty"}`} target="pickup" initialValue={pickup?.formattedAddress ?? initialPickup} disabled={!config?.providers.geocoding} onSelect={(place) => choose("pickup", place)} />
        <LocationSearch key={`destination-${destination?.id ?? "empty"}`} target="destination" initialValue={destination?.formattedAddress ?? initialDestination} disabled={!config?.providers.geocoding} onSelect={(place) => choose("destination", place)} />
        <div className="rova-map-actions">
          <button type="button" onClick={useGps} disabled={gpsBusy}>{gpsBusy ? "Locating…" : "Use my location"}</button>
          <button type="button" className={target === "pickup" ? "selected" : ""} onClick={() => setTarget("pickup")}>Set pickup pin</button>
          <button type="button" className={target === "destination" ? "selected" : ""} onClick={() => setTarget("destination")}>Set destination pin</button>
        </div>
        <div className="rova-selected-points">
          <div><span>PICKUP</span><strong>{pickup?.formattedAddress ?? "Not selected"}</strong>{pickup && <small>{formatCoordinates(pickup)} · {pickup.accuracy.toLowerCase()}</small>}</div>
          <div><span>DESTINATION</span><strong>{destination?.formattedAddress ?? "Not selected"}</strong>{destination && <small>{formatCoordinates(destination)} · {destination.accuracy.toLowerCase()}</small>}</div>
        </div>
        <button className="customer-primary rova-route-button" type="button" disabled={busy || !pickup || !destination || !(service === "RIDE" ? config?.providers.motorcycle : config?.providers.driving)} onClick={() => void calculateRoute()}>{busy ? "Calculating road route…" : "Get road route"}</button>
        {error && <p className="rova-map-inline-error" role="alert">{error}</p>}
        {route && <section className="rova-route-summary" aria-live="polite">
          <span className="customer-kicker">REVIEW BOOKING</span>
          <div><strong>{(route.distanceMeters / 1000).toFixed(1)} km</strong><span>Estimated {Math.ceil(route.durationSeconds / 60)} min · {route.provider}</span></div>
          <p>The server will verify this route again before saving. This is a request only, not a driver dispatch or guaranteed arrival time.</p>
          {persistentBookingEnabled ? <>
            <p className="rova-pilot-disclaimer">Saved pilot requests are non-operational. No driver will arrive.</p>
            <button className="customer-primary rova-submit-booking" type="button" disabled={submitBusy} onClick={() => void submitBooking()}>
              {submitBusy ? "Verifying and saving…" : "Submit booking request"}
            </button>
          </> : <p className="rova-booking-unavailable">
            Persistent booking submission is unavailable until a verified customer account and approved staging integration are enabled.
          </p>}
        </section>}
      </div>
      <RovaMap
        styleUrl={config?.style?.styleUrl ?? null}
        pickup={pickup}
        destination={destination}
        route={route}
        selectionMode={target}
        serviceZones={config?.serviceZones ?? []}
        onSelect={(point) => { if (target) choose(target, placeAt(point, "MAP")); }}
        onPickupMove={(point) => movePin("pickup", point)}
        onDestinationMove={(point) => movePin("destination", point)}
      />
    </div>
    <p className="rova-map-provider-note">Map tiles, search and routing are independent provider calls. Missing credentials produce explicit unavailable states—never synthetic roads or fabricated route estimates.</p>
  </section>;
}
