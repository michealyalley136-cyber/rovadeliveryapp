"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { SimulationRide } from "@/lib/ride-simulation";
import { radiusFor, searchElapsed } from "@/lib/ride-simulation";
import { SimulatedDriverLocationProvider, syntheticPickup, syntheticRoads } from "@/lib/simulated-driver-location";
import { distanceMeters } from "@/server/dispatch/geography";
import { initialVehicleOrientation, orientVehicle, sideViewScale, type VehicleOrientation } from "@/lib/vehicle-orientation";
import type { VehicleType } from "@/lib/driver-location";
import "maplibre-gl/dist/maplibre-gl.css";

const pickup = syntheticPickup;
const destination: [number, number] = [-0.163, 5.6177];
const route: [number, number][] = [pickup, [-0.179, 5.6037], [-0.179, 5.6107], [-0.163, 5.6107], destination];
const approach: [number, number][] = [[pickup[0] - .016, pickup[1] - .007], [pickup[0] - .008, pickup[1] - .007], [pickup[0] - .008, pickup[1]], pickup];
type VehicleMarker = { marker: maplibregl.Marker; icon: HTMLImageElement; orientation: VehicleOrientation };

function createVehicleMarker(map: maplibregl.Map, vehicleType: VehicleType, position: [number, number]): VehicleMarker {
  const element = document.createElement("div");
  element.className = "simulation-vehicle";
  const icon = document.createElement("img");
  icon.className = "simulation-vehicle-icon";
  icon.src = vehicleType === "RIDE" ? "/map-markers/motorcycle.svg" : "/map-markers/cab.svg";
  icon.alt = "";
  element.appendChild(icon);
  return { marker: new maplibregl.Marker({ element, rotationAlignment: "viewport" }).setLngLat(position).addTo(map), icon, orientation: { ...initialVehicleOrientation, facing: "right" } };
}

function updateVehicleOrientation(vehicle: VehicleMarker, headingDegrees: number | null, speedMetersPerSecond: number | null, bearing: number) {
  vehicle.orientation = orientVehicle(vehicle.orientation, { headingDegrees, speedMetersPerSecond }, bearing, { kind: "side" });
  vehicle.icon.style.transform = `scaleX(${sideViewScale(vehicle.orientation, "right")})`;
}

function pathHeading(points: [number, number][], fraction: number): number {
  const index = Math.min(points.length - 2, Math.floor(Math.max(0, fraction) * (points.length - 1)));
  const [a, b] = [points[index], points[index + 1]];
  return Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
}

function interpolate(points: [number, number][], fraction: number): [number, number] {
  const progress = Math.max(0, Math.min(0.999999, fraction)) * (points.length - 1);
  const index = Math.floor(progress);
  const part = progress - index;
  return [points[index][0] + (points[index + 1][0] - points[index][0]) * part, points[index][1] + (points[index + 1][1] - points[index][1]) * part];
}

function circle(meters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const points: [number, number][] = [];
  for (let i = 0; i <= 96; i++) {
    const angle = i * Math.PI * 2 / 96;
    points.push([pickup[0] + meters * Math.cos(angle) / (111320 * Math.cos(pickup[1] * Math.PI / 180)), pickup[1] + meters * Math.sin(angle) / 110574]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [points] } };
}

export function SimulationMap({ ride, now }: { ride: SimulationRide; now: number }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, VehicleMarker>>(new Map());
  const rideRef = useRef({ ride, now });
  const [error, setError] = useState("");
  useEffect(() => { rideRef.current = { ride, now }; }, [ride, now]);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({ container: container.current, center: [-0.177, 5.610], zoom: 12, attributionControl: false, style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9f2e7" } }] } });
    } catch (reason) {
      console.error("Simulation map unavailable", reason);
      setTimeout(() => setError("The illustration could not be displayed. Your demo journey is still available below."), 0);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = 0;
    let lastRadius = -1;
    let simulationTime = 0;
    const markers = markersRef.current;
    const seed = Array.from(rideRef.current.ride.id).reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
    const provider = new SimulatedDriverLocationProvider(seed);
    map.on("load", () => {
      map.addSource("roads", { type: "geojson", data: syntheticRoads() });
      map.addLayer({ id: "roads", type: "line", source: "roads", paint: { "line-color": "#ffffff", "line-width": 3 } });
      map.addSource("radius", { type: "geojson", data: circle(0) });
      map.addLayer({ id: "radius", type: "fill", source: "radius", paint: { "fill-color": "#1cab6b", "fill-opacity": .13 } });
      map.addLayer({ id: "radius-border", type: "line", source: "radius", paint: { "line-color": "#149657", "line-width": 2, "line-opacity": .6 } });
      map.addSource("journey", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } } });
      map.addLayer({ id: "journey", type: "line", source: "journey", paint: { "line-color": "#07804a", "line-width": 5 } });
      map.addSource("approach", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: approach } } });
      map.addLayer({ id: "approach", type: "line", source: "approach", paint: { "line-color": "#1970bd", "line-width": 4, "line-dasharray": [2, 1] } });
      const radar = document.createElement("div");
      radar.className = "simulation-radar";
      radar.setAttribute("aria-hidden", "true");
      radar.innerHTML = "<i></i><i></i>";
      new maplibregl.Marker({ element: radar }).setLngLat(pickup).addTo(map);
      for (const [point, color, label] of [[pickup, "#008148", "Pickup"], [destination, "#d83737", "Destination"]] as const) {
        const el = document.createElement("div"); el.className = "simulation-pin"; el.style.background = color; el.setAttribute("aria-label", label);
        new maplibregl.Marker({ element: el }).setLngLat(point).addTo(map);
      }
      const assignedMarker = createVehicleMarker(map, rideRef.current.ride.service, pickup);
      const animate = (time: number) => {
        frame = requestAnimationFrame(animate);
        if (time - last < (reduced.matches ? 1000 : 50)) return;
        const dt = last ? Math.min(1000, time - last) : 0;
        last = time;
        const state = rideRef.current.ride;
        if (!state.paused && !reduced.matches) simulationTime += dt;
        const locations = provider.locations(simulationTime);
        const current = Date.now();
        radar.style.display = state.status === "SEARCHING" && !state.paused ? "" : "none";
        map.setLayoutProperty("approach", "visibility", state.status === "APPROACHING" ? "visible" : "none");
        const radius = state.status === "SEARCHING" ? radiusFor(state, current) : 0;
        (map.getSource("radius") as GeoJSONSource).setData(circle(radius));
        if (radius > 0 && radius !== lastRadius) {
          lastRadius = radius;
          const dx = radius / (111320 * Math.cos(pickup[1] * Math.PI / 180));
          const dy = radius / 110574;
          map.fitBounds([[pickup[0] - dx, pickup[1] - dy], [Math.max(destination[0], pickup[0] + dx), Math.max(destination[1], pickup[1] + dy)]], { padding: 45, duration: reduced.matches ? 0 : 800, maxZoom: 12 });
        }
        locations.forEach((location) => {
          let vehicle = markers.get(location.driverId);
          if (!vehicle) {
            vehicle = createVehicleMarker(map, location.vehicleType, [location.longitude, location.latitude]);
            markers.set(location.driverId, vehicle);
          }
          const el = vehicle.marker.getElement();
          const nearby = distanceMeters({ longitude: pickup[0], latitude: pickup[1] }, { longitude: location.longitude, latitude: location.latitude }) <= radius;
          el.style.display = state.status === "SEARCHING" && location.vehicleType === state.service && location.availability === "AVAILABLE" && nearby ? "" : "none";
          vehicle.marker.setLngLat([location.longitude, location.latitude]);
          updateVehicleOrientation(vehicle, location.headingDegrees, location.speedMetersPerSecond, map.getBearing());
        });
        const assigned = state.status === "APPROACHING" || state.status === "ARRIVED" || state.status === "IN_PROGRESS" || state.status === "COMPLETED";
        assignedMarker.marker.getElement().style.display = assigned ? "" : "none";
        if (assigned) {
          const progress = Math.max(0, ((state.paused ? state.startedAt : current) - state.phaseStartedAt) * state.speed);
          assignedMarker.marker.setLngLat(state.status === "APPROACHING" ? interpolate(approach, progress / 15000) : state.status === "IN_PROGRESS" ? interpolate(route, progress / 30000) : state.status === "COMPLETED" ? destination : pickup);
          if (state.status === "APPROACHING" || state.status === "IN_PROGRESS") {
            const points = state.status === "APPROACHING" ? approach : route;
            updateVehicleOrientation(assignedMarker, pathHeading(points, progress / (state.status === "APPROACHING" ? 15000 : 30000)), state.paused ? 0 : 1, map.getBearing());
          } else updateVehicleOrientation(assignedMarker, null, 0, map.getBearing());
        }
      };
      frame = requestAnimationFrame(animate);
    });
    return () => { cancelAnimationFrame(frame); markers.clear(); mapRef.current = null; map.remove(); };
  }, []);

  const elapsed = searchElapsed(ride, now);
  return <div className="simulation-map-wrap">
    <div ref={container} className="simulation-map" role="img" aria-label="Illustrative simulation map; locations and roads are not real." />
    <span className="simulation-map-label">ILLUSTRATIVE MAP · SYNTHETIC LOCATIONS</span>
    {ride.status === "SEARCHING" && <span className="simulation-radius">{(radiusFor(ride, now) / 1000).toFixed(1)} km search area · {Math.min(90, Math.floor(elapsed / 1000))}s</span>}
    <button className="simulation-recenter" type="button" onClick={() => mapRef.current?.flyTo({ center: pickup, zoom: 12 })}>Recenter</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
