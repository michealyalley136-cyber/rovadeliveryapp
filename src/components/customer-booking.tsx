"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { customerServices } from "@/config/customer-services";

export function CustomerBooking({ service }: { service: "RIDE" | "TAXI" }) {
  const router = useRouter();
  const pickupRef = useRef<HTMLInputElement>(null);
  const destinationRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const details = customerServices.find((item) => item.id === service)!;

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem("rova-demo-booking") ?? "{}");
      if (value && typeof value === "object") {
        if ("pickup" in value && typeof value.pickup === "string" && pickupRef.current) pickupRef.current.value = value.pickup;
        if ("destination" in value && typeof value.destination === "string" && destinationRef.current) destinationRef.current.value = value.destination;
      }
      sessionStorage.removeItem("rova-demo-booking");
    } catch (reason) {
      console.error("Could not load booking details", reason);
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rides", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pickup: form.get("pickup"), destination: form.get("destination"), service }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create the demo ride.");
      router.push("/customer");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the demo ride.");
      setBusy(false);
    }
  }

  return <main className="customer-app customer-booking-page">
    <div className="customer-booking-shell">
      <header className="customer-booking-header"><Link href="/customer" className="customer-back">← Back to dashboard</Link><Link href="/" className="customer-logo">ROVA<span>.</span></Link></header>
      <section className="customer-panel customer-booking">
        <Image src={details.image} alt="" width={752} height={540} className="customer-booking-art" sizes="(max-width: 700px) 100vw, 680px" />
        <span className="customer-kicker">DEMO JOURNEY</span>
        <h1>{details.title}</h1>
        <p>This booking is simulated. No real driver, dispatch or payment is involved.</p>
        {error && <p className="customer-alert" role="alert">{error}</p>}
        <form onSubmit={submit}>
          <label>Pickup location<input name="pickup" ref={pickupRef} placeholder="Enter pickup" minLength={3} maxLength={120} required /></label>
          <label>Destination<input name="destination" ref={destinationRef} placeholder="Enter destination" minLength={3} maxLength={120} required /></label>
          <button className="customer-primary" disabled={busy}>{busy ? "Creating…" : "Create demo ride"}</button>
        </form>
      </section>
    </div>
  </main>;
}
