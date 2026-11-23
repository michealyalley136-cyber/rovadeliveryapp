"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { MapCoordinates, MapVehicleUpdate, RouteResult, ServiceZone } from "@/lib/maps/types";
import { ghanaBounds, ghanaInitialView } from "@/lib/maps/ghana";
import { addMarkerAt, markerCoordinates } from "@/lib/maps/marker-lifecycle";
import "maplibre-gl/dist/maplibre-gl.css";

type RovaMapProps = {
  styleUrl: string | null;
  pickup: MapCoordinates | null;
  destination: MapCoordinates | null;
  route: RouteResult | null;
  selectionMode: "pickup" | "destination" | null;
  serviceZones: ServiceZone[];
  vehicles?: readonly MapVehicleUpdate[];
  onSelect: (point: MapCoordinates) => void;
  onPickupMove: (point: MapCoordinates) => void;
  onDestinationMove: (point: MapCoordinates) => void;
};

function markerElement(kind: "pickup" | "destination") {
  const element = document.createElement("div");
  element.className = `rova-map-marker rova-map-marker-${kind}`;
  element.textContent = kind === "pickup" ? "P" : "D";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", `${kind === "pickup" ? "Pickup" : "Destination"} marker. Drag to correct location.`);
  return element;
}

export function RovaMap({
  styleUrl, pickup, destination, route, selectionMode, serviceZones,
  vehicles = [], onSelect, onPickupMove, onDestinationMove,
}: RovaMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pickupMarker = useRef<maplibregl.Marker | null>(null);
  const destinationMarker = useRef<maplibregl.Marker | null>(null);
  const pickupDragHandler = useRef<(() => void) | null>(null);
  const destinationDragHandler = useRef<(() => void) | null>(null);
  const vehicleMarkers = useRef(new Map<string, maplibregl.Marker>());
  const callbacks = useRef({ onSelect, onPickupMove, onDestinationMove });
  const zones = useRef(serviceZones);
  const [loading, setLoading] = useState(Boolean(styleUrl));
  const [error, setError] = useState("");

  useEffect(() => {
    callbacks.current = { onSelect, onPickupMove, onDestinationMove };
  }, [onDestinationMove, onPickupMove, onSelect]);

  useEffect(() => {
    zones.current = serviceZones;
  }, [serviceZones]);

  useEffect(() => {
    if (!container.current || !styleUrl) return;
    let active = true;
    let map: maplibregl.Map;
    const currentVehicleMarkers = vehicleMarkers.current;
    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({
        container: container.current,
        style: styleUrl,
        center: [ghanaInitialView.center.longitude, ghanaInitialView.center.latitude],
        zoom: ghanaInitialView.zoom,
        maxBounds: [[ghanaBounds.west - 1, ghanaBounds.south - 1], [ghanaBounds.east + 1, ghanaBounds.north + 1]],
        attributionControl: false,
        cooperativeGestures: true,
      });
      mapRef.current = map;
    } catch {
      queueMicrotask(() => {
        if (active) {
          setError("The Ghana map could not be started.");
          setLoading(false);
        }
      });
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => {
      if (!active) return;
      map.addSource("rova-service-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: zones.current.map((zone) => ({
          type: "Feature", properties: { id: zone.id, active: zone.active }, geometry: zone.geometry,
        })) },
      });
      map.addLayer({
        id: "rova-service-zone-fill", type: "fill", source: "rova-service-zones",
        paint: { "fill-color": "#006838", "fill-opacity": .035 },
      });
      map.addLayer({
        id: "rova-service-zone-line", type: "line", source: "rova-service-zones",
        paint: { "line-color": "#006838", "line-width": 1.5, "line-opacity": .45, "line-dasharray": [3, 2] },
      });
      map.addSource("rova-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "rova-route-outline", type: "line", source: "rova-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": .9 },
      });
      map.addLayer({
        id: "rova-route-line", type: "line", source: "rova-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#006838", "line-width": 5 },
      });
      setLoading(false);
    });
    map.on("error", () => {
      if (active) {
        setError("The licensed Ghana map tiles could not be loaded. Check the provider configuration and connection.");
        setLoading(false);
      }
    });
    map.on("click", (event) => {
      callbacks.current.onSelect({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
    });
    return () => {
      active = false;
      if (pickupMarker.current && pickupDragHandler.current) {
        pickupMarker.current.off("dragend", pickupDragHandler.current);
      }
      if (destinationMarker.current && destinationDragHandler.current) {
        destinationMarker.current.off("dragend", destinationDragHandler.current);
      }
      pickupMarker.current?.remove();
      destinationMarker.current?.remove();
      pickupMarker.current = null;
      destinationMarker.current = null;
      pickupDragHandler.current = null;
      destinationDragHandler.current = null;
      for (const marker of currentVehicleMarkers.values()) marker.remove();
      currentVehicleMarkers.clear();
      if (mapRef.current === map) {
        map.remove();
        mapRef.current = null;
      }
    };
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pickupCoordinates = pickup ? markerCoordinates(pickup) : null;
    const destinationCoordinates = destination ? markerCoordinates(destination) : null;
    if (pickup && pickupCoordinates) {
      if (!pickupMarker.current) {
        const marker = new maplibregl.Marker({ element: markerElement("pickup"), draggable: true });
        pickupDragHandler.current = () => {
          const point = marker.getLngLat();
          if (Number.isFinite(point.lng) && Number.isFinite(point.lat)) {
            callbacks.current.onPickupMove({ longitude: point.lng, latitude: point.lat });
          }
        };
        marker.on("dragend", pickupDragHandler.current);
        pickupMarker.current = addMarkerAt(marker, map, pickup);
      } else {
        pickupMarker.current.setLngLat(pickupCoordinates);
      }
    } else {
      if (pickupMarker.current && pickupDragHandler.current) {
        pickupMarker.current.off("dragend", pickupDragHandler.current);
      }
      pickupMarker.current?.remove();
      pickupMarker.current = null;
      pickupDragHandler.current = null;
    }
    if (destination && destinationCoordinates) {
      if (!destinationMarker.current) {
        const marker = new maplibregl.Marker({ element: markerElement("destination"), draggable: true });
        destinationDragHandler.current = () => {
          const point = marker.getLngLat();
          if (Number.isFinite(point.lng) && Number.isFinite(point.lat)) {
            callbacks.current.onDestinationMove({ longitude: point.lng, latitude: point.lat });
          }
        };
        marker.on("dragend", destinationDragHandler.current);
        destinationMarker.current = addMarkerAt(marker, map, destination);
      } else {
        destinationMarker.current.setLngLat(destinationCoordinates);
      }
    } else {
      if (destinationMarker.current && destinationDragHandler.current) {
        destinationMarker.current.off("dragend", destinationDragHandler.current);
      }
      destinationMarker.current?.remove();
      destinationMarker.current = null;
      destinationDragHandler.current = null;
    }
    if (pickupCoordinates && destinationCoordinates) {
      const bounds = new maplibregl.LngLatBounds(pickupCoordinates, destinationCoordinates);
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 350 });
    } else if (pickupCoordinates) {
      map.easeTo({ center: pickupCoordinates, zoom: Math.max(map.getZoom(), 13), duration: 350 });
    } else if (destinationCoordinates) {
      map.easeTo({ center: destinationCoordinates, zoom: Math.max(map.getZoom(), 13), duration: 350 });
    }
  }, [destination, pickup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visible = new Set(vehicles.map((vehicle) => vehicle.vehicleId));
    for (const [vehicleId, marker] of vehicleMarkers.current) {
      if (!visible.has(vehicleId)) {
        marker.remove();
        vehicleMarkers.current.delete(vehicleId);
      }
    }
    for (const vehicle of vehicles) {
      const coordinates = markerCoordinates(vehicle);
      if (!coordinates) {
        const existing = vehicleMarkers.current.get(vehicle.vehicleId);
        existing?.remove();
        vehicleMarkers.current.delete(vehicle.vehicleId);
        continue;
      }
      let marker = vehicleMarkers.current.get(vehicle.vehicleId);
      if (!marker) {
        const element = document.createElement("div");
        element.className = `rova-map-vehicle ${vehicle.source === "SIMULATION" ? "rova-map-vehicle-simulation" : ""}`;
        element.setAttribute("aria-label", `${vehicle.source === "SIMULATION" ? "Simulated " : ""}${vehicle.vehicleType.toLowerCase()} location`);
        element.textContent = vehicle.vehicleType === "MOTORCYCLE" ? "R" : "V";
        const created = addMarkerAt(new maplibregl.Marker({ element, rotationAlignment: "map" }), map, vehicle);
        if (!created) continue;
        marker = created;
        vehicleMarkers.current.set(vehicle.vehicleId, created);
      } else {
        marker.setLngLat(coordinates);
      }
      marker.setRotation(vehicle.headingDegrees ?? 0);
    }
  }, [vehicles]);

  useEffect(() => {
    const map = mapRef.current;
    const updateRoute = () => {
      const source = map?.getSource("rova-route") as GeoJSONSource | undefined;
      source?.setData(route
        ? { type: "Feature", properties: {}, geometry: route.geometry }
        : { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
      if (route && map && route.geometry.coordinates.length) {
        const bounds = route.geometry.coordinates.reduce(
          (value, coordinate) => value.extend(coordinate as [number, number]),
          new maplibregl.LngLatBounds(route.geometry.coordinates[0] as [number, number], route.geometry.coordinates[0] as [number, number]),
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
      }
    };
    if (map?.isStyleLoaded()) updateRoute();
    else map?.once("load", updateRoute);
  }, [route]);

  return <div className={`rova-map-shell ${selectionMode ? "rova-map-selecting" : ""}`}>
    <div ref={container} className="rova-map" role="img" aria-label="Interactive road map of Ghana." />
    {!styleUrl && <div className="rova-map-unavailable" role="status"><strong>Ghana map unavailable</strong><span>A licensed map provider key has not been configured. No substitute map is shown.</span></div>}
    {styleUrl && loading && <div className="rova-map-loading" role="status">Loading licensed Ghana map…</div>}
    {error && <p className="rova-map-error" role="alert">{error}</p>}
    {selectionMode && <span className="rova-map-selection">Tap the map to set {selectionMode}</span>}
  </div>;
}
