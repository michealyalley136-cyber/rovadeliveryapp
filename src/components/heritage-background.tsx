"use client";

import { useEffect, useRef, useState } from "react";
import { nextRotationTime, rotationIndex, type HeritageArtwork, type HeritageRotation } from "@/config/heritage-rotation";
import { startVisiblePolling } from "@/lib/visible-polling";

export function HeritageBackground({ rotation }: { rotation: HeritageRotation }) {
  const [settings, setSettings] = useState(rotation);
  const [visible, setVisible] = useState<HeritageArtwork | null>(null);
  const [previous, setPrevious] = useState<HeritageArtwork | null>(null);
  const [unavailable, setUnavailable] = useState<Record<string, number>>({});
  const visibleRef = useRef<HeritageArtwork | null>(null);

  useEffect(() => {
    return startVisiblePolling({
      interval: 60000,
      maxInterval: 300000,
      async run(signal) {
        const response = await fetch("/api/customer/heritage", { cache: "no-store", signal });
        if (!response.ok) throw new Error(`Heritage settings request failed (${response.status}).`);
        const updated: unknown = await response.json();
        if (!isRotation(updated)) throw new Error("Heritage settings response is invalid.");
        if (signal.aborted) return;
        setSettings((old) => JSON.stringify(old) === JSON.stringify(updated) ? old : updated);
      },
      onError(error) { console.error("ROVA heritage settings refresh failed", error); },
    });
  }, []);

  useEffect(() => {
    const expiries = Object.values(unavailable);
    if (!expiries.length) return;
    const delay = Math.max(0, Math.min(...expiries) - Date.now());
    const timer = window.setTimeout(() => setUnavailable((old) =>
      Object.fromEntries(Object.entries(old).filter(([, expires]) => expires > Date.now()))), delay);
    return () => window.clearTimeout(timer);
  }, [unavailable]);

  useEffect(() => {
    const available = settings.artworks.filter((art) => !(art.id in unavailable));
    if (!available.length) return;
    let active = true;
    let timer: number | undefined;
    let preloadTimer: number | undefined;
    let fadeTimer: number | undefined;
    let loading: HTMLImageElement | undefined;

    function schedule() {
      if (loading) { loading.onload = null; loading.onerror = null; }
      const now = Date.now();
      const current = available[rotationIndex(now, settings.intervalSeconds, available.length)];
      const next = available[rotationIndex(nextRotationTime(now, settings.intervalSeconds), settings.intervalSeconds, available.length)];
      loading = new window.Image();
      loading.onload = () => {
        if (!active) return;
        if (visibleRef.current?.id !== current.id) {
          setPrevious(visibleRef.current);
          visibleRef.current = current;
          setVisible(current);
          window.clearTimeout(fadeTimer);
          fadeTimer = window.setTimeout(() => setPrevious(null), 1500);
        }
      };
      loading.onerror = () => {
        if (active) {
          console.error("ROVA heritage image failed to load", current.id);
          setUnavailable((old) => ({ ...old, [current.id]: Date.now() + 60000 }));
        }
      };
      loading.src = current.image;
      const delay = Math.max(0, nextRotationTime(now, settings.intervalSeconds) - now);
      if (next.id !== current.id) preloadTimer = window.setTimeout(() => { const image = new window.Image(); image.src = next.image; }, Math.max(0, delay - Math.min(5000, settings.intervalSeconds * 250)));
      timer = window.setTimeout(schedule, delay + 10);
    }

    if (document.visibilityState === "visible") schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer); window.clearTimeout(preloadTimer); window.clearTimeout(fadeTimer);
        schedule();
      } else {
        window.clearTimeout(timer); window.clearTimeout(preloadTimer); window.clearTimeout(fadeTimer);
        if (loading) { loading.onload = null; loading.onerror = null; }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearTimeout(timer); window.clearTimeout(preloadTimer); window.clearTimeout(fadeTimer);
      if (loading) { loading.onload = null; loading.onerror = null; }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [settings, unavailable]);

  const isAllowed = (art: HeritageArtwork | null) => art && settings.artworks.some((item) => item.id === art.id);
  const current = isAllowed(visible) ? visible : null;
  return <>
    <div className="heritage-background" aria-label={current ? `AI-generated artistic interpretation: ${current.name}` : undefined} role={current ? "img" : undefined}>
      {isAllowed(previous) && previous && <div className="heritage-layer" style={{ backgroundImage: `url("${previous.image}")` }} />}
      {current && <div key={current.id} className="heritage-layer heritage-fade-in" style={{ backgroundImage: `url("${current.image}")` }} />}
      {current && <span className="heritage-art-label" aria-hidden="true">AI artistic interpretation</span>}
    </div>
  </>;
}

function isRotation(value: unknown): value is HeritageRotation {
  if (!value || typeof value !== "object" || !("intervalSeconds" in value) || !("artworks" in value)) return false;
  return typeof value.intervalSeconds === "number" && Number.isInteger(value.intervalSeconds) && value.intervalSeconds > 0 &&
    Array.isArray(value.artworks) && value.artworks.every((art: unknown) =>
      !!art && typeof art === "object" && "id" in art && typeof art.id === "string" &&
      "name" in art && typeof art.name === "string" && "image" in art && typeof art.image === "string" && art.image.startsWith("/heritage/"));
}
