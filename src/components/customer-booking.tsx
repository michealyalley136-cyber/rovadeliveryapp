"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { customerServices } from "@/config/customer-services";
import { CustomerMapPlanner } from "@/components/customer-map-planner";

export function CustomerBooking({ service }: { service: "RIDE" | "TAXI" }) {
  const details = customerServices.find((item) => item.id === service)!;
  const routeProfile = service === "RIDE" ? "MOTORCYCLE" : "DRIVING";
  const [initialPickup, setInitialPickup] = useState("");
  const [initialDestination, setInitialDestination] = useState("");
  const [detailsReady, setDetailsReady] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const value: unknown = JSON.parse(sessionStorage.getItem("rova-demo-booking") ?? "{}");
        if (value && typeof value === "object") {
          if ("pickup" in value && typeof value.pickup === "string") setInitialPickup(value.pickup);
          if ("destination" in value && typeof value.destination === "string") setInitialDestination(value.destination);
        }
        sessionStorage.removeItem("rova-demo-booking");
      } catch {
        // A blocked browser store does not prevent map-based location selection.
      }
      setDetailsReady(true);
    });
    return () => { active = false; };
  }, []);
  return <main className="customer-app customer-booking-page" data-booking-service={service} data-routing-profile={routeProfile}>
    <div className="customer-booking-shell">
      <header className="customer-booking-header"><Link href="/customer" className="customer-back">← Back to Services</Link><Link href="/" className="customer-logo">ROVA<span>.</span></Link></header>
      <section className="customer-panel customer-booking">
        <Image src={details.image} alt="" width={752} height={540} className="customer-booking-art" sizes="(max-width: 700px) 100vw, 680px" />
        <span className="customer-kicker">{service === "RIDE" ? "MOTORCYCLE" : "TAXI"} JOURNEY</span>
        <h1>{details.title}</h1>
        <p>This selected service stays fixed while you choose locations and review an estimated road route. No driver is dispatched and no payment is collected.</p>
        {detailsReady ? <CustomerMapPlanner service={service} initialPickup={initialPickup} initialDestination={initialDestination} /> : <p role="status">Preparing your selected service…</p>}
      </section>
    </div>
  </main>;
}
