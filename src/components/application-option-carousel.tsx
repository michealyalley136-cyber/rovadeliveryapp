"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import user from "@/images/application-options/user.png";
import motorcycleRider from "@/images/application-options/motorcycle-rider.png";
import taxiDriver from "@/images/application-options/taxi-driver.png";
import vehicleAccess from "@/images/application-options/vehicle-access-applicant.png";
import merchant from "@/images/application-options/merchant.png";
import restaurant from "@/images/application-options/restaurant.png";
import fleetOwner from "@/images/application-options/fleet-owner.png";
import vehicleDealer from "@/images/application-options/vehicle-dealer.png";
import type { ApplicationType } from "@/config/application-types";

export const visualOptions = [
  { id: "user", label: "User", type: "CUSTOMER", image: user },
  { id: "motorcycle-rider", label: "Motorcycle Rider", type: "MOTORCYCLE_RIDER", image: motorcycleRider },
  { id: "taxi-driver", label: "Taxi Driver", type: "TAXI_DRIVER", image: taxiDriver },
  { id: "vehicle-access", label: "Vehicle Access Applicant", type: "VEHICLE_ACCESS", image: vehicleAccess },
  { id: "merchant", label: "Merchant", type: "MERCHANT", image: merchant },
  { id: "restaurant", label: "Restaurant", type: "MERCHANT", image: restaurant },
  { id: "fleet-owner", label: "Fleet Owner", type: "FLEET_OWNER", image: fleetOwner },
  { id: "vehicle-dealer", label: "Vehicle Dealer", type: "VEHICLE_DEALER", image: vehicleDealer },
] as const satisfies readonly { id: string; label: string; type: ApplicationType; image: { src: string } }[];

export type VisualOption = (typeof visualOptions)[number];

export function ApplicationOptionCarousel({ options, selectedId, onSelect }: {
  options: readonly VisualOption[];
  selectedId: string | null;
  onSelect: (option: VisualOption) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const initialIndex = Math.max(0, options.findIndex((option) => option.id === selectedId));
  const [active, setActive] = useState(initialIndex);

  function center(index: number, behavior: ScrollBehavior = "smooth") {
    const track = trackRef.current;
    const card = track?.children.item(index);
    if (!track || !(card instanceof HTMLElement)) return;
    track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior });
    setActive(index);
  }

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.ctrlKey) return;
      event.preventDefault();
      track.scrollBy({ left: event.deltaY, behavior: "auto" });
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const index = Math.max(0, options.findIndex((option) => option.id === selectedId));
    const card = track?.children.item(index);
    if (track && card instanceof HTMLElement) {
      track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior: "instant" });
    }
  }, [options, selectedId]);

  return <div className="visual-selector">
    <div
      className="visual-carousel"
      ref={trackRef}
      role="group"
      aria-label="Application opportunities"
      onScroll={(event) => {
        const track = event.currentTarget;
        const middle = track.getBoundingClientRect().left + track.clientWidth / 2;
        let closest = 0;
        let distance = Infinity;
        Array.from(track.children).forEach((child, index) => {
          const rect = child.getBoundingClientRect();
          const next = Math.abs(rect.left + rect.width / 2 - middle);
          if (next < distance) { distance = next; closest = index; }
        });
        setActive(closest);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        suppressClick.current = false;
        drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        const delta = event.clientX - start.x;
        if (Math.abs(delta) > 5) {
          start.moved = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.scrollLeft = start.left - delta;
        }
      }}
      onPointerUp={() => {
        suppressClick.current = Boolean(drag.current?.moved);
        drag.current = null;
      }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = Math.max(0, Math.min(options.length - 1, active + (event.key === "ArrowRight" ? 1 : -1)));
        center(next);
        const card = event.currentTarget.children.item(next);
        if (card instanceof HTMLElement) card.focus({ preventScroll: true });
      }}
    >
      {options.map((option, index) => <button
        type="button"
        key={option.id}
        className={`visual-option ${active === index ? "is-active" : ""}`}
        aria-label={`Apply as ${option.label}`}
        aria-pressed={selectedId === option.id}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          center(index);
          onSelect(option);
        }}
      >
        <img src={option.image.src} alt="" draggable={false} loading="eager" />
        {selectedId === option.id && <span className="visual-option-selected">✓ Selected</span>}
      </button>)}
    </div>
    <div className="visual-carousel-caption"><span>Swipe or scroll to explore</span><span>{active + 1} of {options.length}</span></div>
  </div>;
}
