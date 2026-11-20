"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import type { SimulationRide } from "@/lib/ride-simulation";
import { radiusFor, searchElapsed } from "@/lib/ride-simulation";
import "maplibre-gl/dist/maplibre-gl.css";

const pickup: [number, number] = [-0.187, 5.6037];
const destination: [number, number] = [-0.163, 5.6177];
const route: [number, number][] = [pickup, [-0.179, 5.6037], [-0.179, 5.6107], [-0.163, 5.6107], destination];
const approach: [number, number][] = [[pickup[0] - .016, pickup[1] - .007], [pickup[0] - .008, pickup[1] - .007], [pickup[0] - .008, pickup[1]], pickup];

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
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const rideRef = useRef({ ride, now });
  const [error, setError] = useState("");
  useEffect(() => { rideRef.current = { ride, now }; }, [ride, now]);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
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
    map.on("load", () => {
      const roads: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      for (let i = -8; i <= 8; i++) {
        roads.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[pickup[0] - .08, pickup[1] + i * .007], [pickup[0] + .08, pickup[1] + i * .007]] } });
        roads.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[pickup[0] + i * .008, pickup[1] - .06], [pickup[0] + i * .008, pickup[1] + .06]] } });
      }
      map.addSource("roads", { type: "geojson", data: { type: "FeatureCollection", features: roads } });
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
      for (let i = 0; i < 30; i++) {
        const el = document.createElement("div"); el.className = "simulation-vehicle"; el.textContent = i % 2 ? "🚕" : "🏍";
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(pickup).addTo(map));
      }
      const animate = (time: number) => {
        frame = requestAnimationFrame(animate);
        if (time - last < (reduced.matches ? 1000 : 50)) return;
        last = time;
        const state = rideRef.current.ride;
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
        markersRef.current.forEach((marker, i) => {
          const el = marker.getElement();
          const assigned = state.status === "APPROACHING" || state.status === "ARRIVED" || state.status === "IN_PROGRESS" || state.status === "COMPLETED";
          el.style.display = assigned ? (i === 0 ? "" : "none") : (state.status === "SEARCHING" && i % 2 === (state.service === "RIDE" ? 0 : 1) ? "" : "none");
          el.textContent = state.service === "RIDE" ? "🏍" : "🚕";
          if (assigned) {
            const progress = Math.max(0, ((state.paused ? state.startedAt : current) - state.phaseStartedAt) * state.speed);
            marker.setLngLat(state.status === "APPROACHING" ? interpolate(approach, progress / 15000) : state.status === "IN_PROGRESS" ? interpolate(route, progress / 30000) : state.status === "COMPLETED" ? destination : pickup);
          } else {
            const offset = (Math.floor(i / 2) - 7) * .007;
            const phase = reduced.matches ? 0 : ((state.paused ? state.startedAt : current) / 35000 + i / 30) % 1;
            const path: [number, number][] = [[pickup[0] - .024, pickup[1] + offset], [pickup[0] + .024, pickup[1] + offset], [pickup[0] + .024, pickup[1] + offset + .007], [pickup[0] - .024, pickup[1] + offset + .007], [pickup[0] - .024, pickup[1] + offset]];
            marker.setLngLat(interpolate(path, phase));
          }
        });
      };
      frame = requestAnimationFrame(animate);
    });
    return () => { cancelAnimationFrame(frame); markersRef.current = []; mapRef.current = null; map.remove(); };
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
