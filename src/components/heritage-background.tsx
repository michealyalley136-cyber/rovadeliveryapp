"use client";

import { useEffect, useRef, useState } from "react";
import { nextRotationTime, rotationIndex, type HeritageArtwork, type HeritageRotation } from "@/config/heritage-rotation";

export function HeritageBackground({ rotation, initialError = false }: { rotation: HeritageRotation; initialError?: boolean }) {
  const [settings, setSettings] = useState(rotation);
  const [refreshError, setRefreshError] = useState(initialError);
  const [visible, setVisible] = useState<HeritageArtwork | null>(null);
  const [previous, setPrevious] = useState<HeritageArtwork | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const visibleRef = useRef<HeritageArtwork | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    async function refresh() {
      if (!active || document.visibilityState !== "visible") return;
      const requestController = new AbortController();
      controller = requestController;
      try {
        const response = await fetch("/api/customer/heritage", { cache: "no-store", signal: requestController.signal });
        if (!response.ok) throw new Error(`Heritage settings request failed (${response.status}).`);
        const updated: HeritageRotation = await response.json();
        if (!active || requestController.signal.aborted) return;
        setSettings((old) => JSON.stringify(old) === JSON.stringify(updated) ? old : updated);
        setRefreshError(false);
      } catch (error) {
        if (active && !requestController.signal.aborted) {
          console.error("ROVA heritage settings refresh failed", error);
          setRefreshError(true);
        }
      } finally {
        if (active && controller === requestController && !requestController.signal.aborted && document.visibilityState === "visible") timer = window.setTimeout(refresh, 60000);
      }
    }
    function onVisibility() {
      window.clearTimeout(timer);
      controller?.abort();
      if (document.visibilityState === "visible") void refresh();
    }
    timer = window.setTimeout(refresh, 60000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    const available = settings.artworks.filter((art) => !unavailable.includes(art.id));
    if (!available.length) return;
    let active = true;
    let timer: number | undefined;
    let preloadTimer: number | undefined;
    let fadeTimer: number | undefined;
    let loading: HTMLImageElement | undefined;

    function schedule() {
      if (loading) { loading.onload = null; loading.onerror = null; }
      const now = Date.now();
      const current = available[rotationIndex(now, settings.intervalMinutes, available.length)];
      const next = available[rotationIndex(nextRotationTime(now, settings.intervalMinutes), settings.intervalMinutes, available.length)];
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
          if (visibleRef.current?.id === current.id || unavailable.length + 1 >= settings.artworks.length) {
            visibleRef.current = null;
            setVisible(null);
            setPrevious(null);
          }
          setUnavailable((old) => [...old, current.id]);
        }
      };
      loading.src = current.image;
      const delay = Math.max(0, nextRotationTime(now, settings.intervalMinutes) - now);
      if (next.id !== current.id) preloadTimer = window.setTimeout(() => { const image = new window.Image(); image.src = next.image; }, Math.max(0, delay - 30000));
      timer = window.setTimeout(schedule, delay + 10);
    }

    schedule();
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

  const isAllowed = (art: HeritageArtwork | null) => art && settings.artworks.some((item) => item.id === art.id) && !unavailable.includes(art.id);
  const current = isAllowed(visible) ? visible : null;
  return <>
    <div className="heritage-background" aria-label={current ? `AI-generated artistic interpretation: ${current.name}` : undefined} role={current ? "img" : undefined}>
      {isAllowed(previous) && previous && <div className="heritage-layer" style={{ backgroundImage: `url("${previous.image}")` }} />}
      {current && <div key={current.id} className="heritage-layer heritage-fade-in" style={{ backgroundImage: `url("${current.image}")` }} />}
      {current && <span className="heritage-art-label" aria-hidden="true">AI artistic interpretation</span>}
    </div>
    {refreshError && <span className="heritage-refresh-error" role="status">Banner settings could not be refreshed.</span>}
  </>;
}
