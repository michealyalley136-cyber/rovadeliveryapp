"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { customerServices, greeting } from "@/config/customer-services";
import { ghanaRegions, localDateAndHour, type GhanaRegion } from "@/config/heritage";
import type { HeritageRotation } from "@/config/heritage-rotation";
import { HeritageBackground } from "@/components/heritage-background";
import type { Trip } from "@/lib/domain";

type Section = "Home" | "Activity" | "Wallet" | "Safety" | "Account";
type RideService = "RIDE" | "TAXI";
type SavedPlace = { id: string; label: string; address: string };
const nav: Section[] = ["Home", "Activity", "Wallet", "Safety", "Account"];
const storageKey = "rova-demo-saved-places";
const emptyPlaces = "[]";

function subscribePlaces(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("rova-places-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("rova-places-changed", callback);
  };
}
function placesSnapshot() {
  try { return localStorage.getItem(storageKey) ?? emptyPlaces; } catch { return emptyPlaces; }
}
function subscribeClock(callback: () => void) {
  const timer = window.setInterval(callback, 60000);
  return () => window.clearInterval(timer);
}
function parsePlaces(value: string): SavedPlace[] {
  try {
    const data: unknown = JSON.parse(value);
    return Array.isArray(data) ? data.filter((item): item is SavedPlace =>
      item !== null && typeof item === "object" && typeof item.id === "string" && typeof item.label === "string" && typeof item.address === "string") : [];
  } catch { return []; }
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
    Activity: "M4 5h16M4 12h16M4 19h16M8 3v4M8 10v4M8 17v4",
    Wallet: "M3 6h16a2 2 0 0 1 2 2v11H3a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h14M16 12h5",
    Safety: "M12 2 21 5v6c0 5-3.5 8.5-9 11-5.5-2.5-9-6-9-11V5zM8 12l3 3 5-6",
    Account: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10",
    pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
    search: "M21 21l-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.pin} /></svg>;
}

export function CustomerDashboard({ user, rotation }: { user: { name: string }; rotation: HeritageRotation }) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("Home");
  const [locationOpen, setLocationOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [region, setRegion] = useState<GhanaRegion | "">("");
  const [locationError, setLocationError] = useState("");
  const [booking, setBooking] = useState<RideService | null>(null);
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [placeLabel, setPlaceLabel] = useState("Home");
  const [placeAddress, setPlaceAddress] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const places = parsePlaces(useSyncExternalStore(subscribePlaces, placesSnapshot, () => emptyPlaces));
  const clock = useSyncExternalStore(subscribeClock, () => { const { date, hour } = localDateAndHour(new Date()); return `${date}|${hour}`; }, () => "2000-01-01|12");
  const [, hourText] = clock.split("|");
  const hour = Number(hourText);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (response.status === 401) { router.refresh(); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load demo activity.");
      setTrips(result.trips);
      setDashboardError("");
    } catch (reason) {
      setDashboardError(reason instanceof Error ? reason.message : "Could not load demo activity.");
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (response.status === 401) { if (active) router.refresh(); return; }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load demo activity.");
        if (active) { setTrips(result.trips); setDashboardError(""); }
      } catch (reason) {
        if (active) setDashboardError(reason instanceof Error ? reason.message : "Could not load demo activity.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [router]);

  function useLocation() {
    setLocationError("");
    if (!navigator.geolocation) { setLocationError("Location is unavailable. Enter a location instead."); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const value = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
        setLocation(value);
        setPickup(value);
        setLocationOpen(false);
      },
      () => setLocationError("Could not access your location. Enter a location instead."),
      { timeout: 10000 },
    );
  }

  function savePlaces(next: SavedPlace[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("rova-places-changed"));
      setError("");
      return true;
    } catch { setError("Could not save places on this device. Check your browser storage settings."); return false; }
  }

  async function requestRide(event: React.FormEvent) {
    event.preventDefault();
    if (!booking) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/rides", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pickup, destination, service: booking }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create the demo ride.");
      setBooking(null);
      setMessage("Demo ride created. No real driver or payment is involved.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the demo ride."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign out."); }
  }

  const active = trips?.find((trip) => !["TRIP_COMPLETED", "CANCELLED"].includes(trip.status));
  const openBooking = (service: RideService, address?: string) => {
    setSection("Home"); setBooking(service);
    if (address) setDestination(address);
    if (location && !pickup) setPickup(location);
  };
  const navigation = (label: string) => <nav aria-label={label}>{nav.map((item) =>
    <button type="button" className={section === item ? "selected" : ""} aria-current={section === item ? "page" : undefined} onClick={() => { setSection(item); setBooking(null); }} key={item}><Icon name={item} /><span>{item}</span></button>)}</nav>;

  return <main className="customer-app">
    <aside className="customer-sidebar">
      <Link href="/" className="customer-logo">ROVA<span>.</span></Link>
      <p>YOUR CITY. YOUR LIFE.</p>
      {navigation("Customer navigation")}
      <div className="customer-sidebar-note">Built for Ghana.<br /><strong>Made for your everyday.</strong></div>
    </aside>
    <div className="customer-shell">
      <header className="customer-header">
        <div><Link href="/" className="customer-logo">ROVA<span>.</span></Link><button className="customer-location" onClick={() => setLocationOpen(!locationOpen)} aria-expanded={locationOpen}><Icon name="pin" /><span>{location || "Set your location"}</span><span aria-hidden="true">⌄</span></button></div>
        <div className="customer-header-actions"><button className="customer-icon-button" aria-label="Notifications" onClick={() => setMessage("Notifications are not available in the demo.")}><Icon name="bell" /></button><button className="customer-avatar" aria-label="Open account" onClick={() => setSection("Account")}>{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</button></div>
        {locationOpen && <div className="customer-location-panel">
          <strong>Your location</strong><p>Use your coordinates or enter a location manually.</p>
          <label htmlFor="customer-region">Region (optional)</label><select id="customer-region" value={region} onChange={(event) => setRegion(ghanaRegions.find((item) => item === event.target.value) ?? "")}><option value="">Select a region</option>{ghanaRegions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button type="button" onClick={useLocation}>Use current location</button>
          <form onSubmit={(event) => { event.preventDefault(); setPickup(location); setLocationOpen(false); }}><label htmlFor="customer-location">Location</label><input id="customer-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Enter your area or address" required /><button type="submit">Set location</button></form>
          {locationError && <p role="alert">{locationError}</p>}
        </div>}
      </header>
      <div className="customer-content">
        <p className="customer-demo">DEMO WORKSPACE · No real services, payments or tracking</p>
        {error && <p className="customer-alert" role="alert">{error}</p>}
        {dashboardError && <p className="customer-alert" role="alert">{dashboardError} {trips && "Displayed activity may be out of date."}</p>}
        {message && <p className="customer-message" role="status">{message} <button onClick={() => setMessage("")} aria-label="Dismiss message">×</button></p>}
        {section === "Home" && <>
          <section className={`customer-welcome ${hour >= 18 || hour < 5 ? "customer-welcome-evening" : ""}`}>
            <HeritageBackground rotation={rotation} />
            <div className="customer-welcome-copy"><p>{greeting(hour)}, {user.name.trim().split(/\s+/)[0]}!</p><h1>What would you like<br />to do today?</h1><span>Wherever life takes you, ROVA is with you.</span></div>
          </section>
          <button className="customer-search" onClick={() => openBooking("RIDE")}><Icon name="search" /><span>Where to?</span><span aria-hidden="true">→</span></button>
          {booking && <section className="customer-panel customer-booking" aria-labelledby="booking-title"><div className="customer-section-heading"><div><span className="customer-kicker">DEMO JOURNEY</span><h2 id="booking-title">{booking === "RIDE" ? "Book a Motorcycle" : "Book a Cab"}</h2></div><button onClick={() => setBooking(null)} aria-label="Close booking">×</button></div>
            <p>This creates a simulated ride only. Address search, maps and live dispatch are not available.</p>
            <form onSubmit={requestRide}><label>Pickup location<input value={pickup} onChange={(event) => setPickup(event.target.value)} placeholder="Enter pickup" minLength={3} maxLength={120} required /></label><label>Destination<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Enter destination" minLength={3} maxLength={120} required /></label><button className="customer-primary" disabled={busy}>{busy ? "Creating…" : "Create demo ride"}</button></form>
          </section>}
          {active && <section className="customer-active"><div><span className="customer-kicker">ACTIVE DEMO RIDE</span><h2>{active.destination}</h2><p>{active.status.replaceAll("_", " ").toLowerCase()} · from {active.pickup}</p></div><button onClick={() => setSection("Activity")}>View activity →</button></section>}
          <div className="customer-section-heading"><div><span className="customer-kicker">EXPLORE ROVA</span><h2>What can we help you with?</h2></div></div>
          <div className="customer-services">{customerServices.map((service) => <button type="button" className={`customer-service ${service.color}`} key={service.id} onClick={() => service.id === "RIDE" || service.id === "TAXI" ? openBooking(service.id) : setMessage(`${service.title} is coming soon and is not available for bookings.`)}>
            <div className="customer-service-image"><Image src={service.image} alt="" width={376} height={270} sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 360px" /></div>
            <div className="customer-service-copy"><span className="customer-service-status">{service.demo ? "DEMO" : "COMING SOON"}</span><h3>{service.title}</h3><p>{service.description}</p><span className="customer-service-arrow" aria-hidden="true">↗</span></div>
          </button>)}</div>
          <button className="customer-safety" onClick={() => setSection("Safety")}><span className="customer-safety-icon"><Icon name="Safety" /></span><span><small>ROVA SAFETY</small><strong>Your safety comes first.</strong><span>Explore our plans for safer journeys.</span></span><b aria-hidden="true">→</b></button>
          <SavedDestinations places={places} setEditing={setEditing} setPlaceLabel={setPlaceLabel} setPlaceAddress={setPlaceAddress} select={(address) => openBooking("RIDE", address)} remove={(id) => savePlaces(places.filter((place) => place.id !== id))} editing={editing} placeLabel={placeLabel} placeAddress={placeAddress} save={(event) => { event.preventDefault(); const place = { id: editing ?? crypto.randomUUID(), label: placeLabel.trim(), address: placeAddress.trim() }; if (savePlaces(editing ? places.map((old) => old.id === editing ? place : old) : [...places, place])) { setEditing(null); setPlaceLabel("Home"); setPlaceAddress(""); } }} />
        </>}
        {section === "Activity" && <section className="customer-panel"><span className="customer-kicker">YOUR JOURNEYS</span><h1>Activity</h1><p>Demo activity is temporary and may reset when the server restarts.</p>{trips === null ? <p>Loading activity…</p> : trips.length ? trips.map((trip) => <div className="customer-trip" key={trip.id}><div><strong>{trip.destination}</strong><p>From {trip.pickup} · {trip.service === "RIDE" ? "Motorcycle" : "Cab"}</p></div><span>{trip.status.replaceAll("_", " ").toLowerCase()}</span></div>) : <p>No demo rides yet.</p>}</section>}
        {section === "Wallet" && <section className="customer-panel"><span className="customer-kicker">COMING SOON</span><h1>Wallet</h1><p>Payment methods, credits and receipts are not available yet. No payments are collected in this demo.</p></section>}
        {section === "Safety" && <section className="customer-panel"><span className="customer-kicker">ROVA SAFETY</span><h1>Your safety comes first.</h1><p>We are preparing safety features for future service. Emergency SOS, trusted contacts, trip sharing, driver verification and incident reporting are not available in this demo.</p><p>If you are in immediate danger, contact your local emergency services.</p></section>}
        {section === "Account" && <section className="customer-panel"><span className="customer-kicker">DEMO ACCOUNT</span><h1>{user.name}</h1><p>This is a shared demo profile, not a real customer account. Saved destinations remain on this browser only.</p><button className="customer-primary" onClick={() => void signOut()}>Sign out</button></section>}
      </div>
      <div className="customer-bottom">{navigation("Mobile customer navigation")}</div>
    </div>
  </main>;
}

function SavedDestinations({ places, setEditing, setPlaceLabel, setPlaceAddress, select, remove, editing, placeLabel, placeAddress, save }: {
  places: SavedPlace[]; setEditing: (value: string | null) => void; setPlaceLabel: (value: string) => void; setPlaceAddress: (value: string) => void;
  select: (address: string) => void; remove: (id: string) => void; editing: string | null; placeLabel: string; placeAddress: string; save: (event: React.FormEvent) => void;
}) {
  return <section className="customer-saved"><div className="customer-section-heading"><div><span className="customer-kicker">YOUR PLACES</span><h2>Saved destinations</h2></div></div><p>Saved on this browser for the demo, not in an account.</p>
    <div className="customer-place-grid">{["Home", "Work"].filter((label) => !places.some((place) => place.label.toLowerCase() === label.toLowerCase())).map((label) => <div className="customer-place" key={label}><button className="customer-place-select" onClick={() => { setEditing(null); setPlaceLabel(label); setPlaceAddress(""); document.getElementById("customer-place-address")?.focus(); }}><Icon name={label === "Home" ? "Home" : "pin"} /><span><strong>{label}</strong><small>Add an address</small></span></button></div>)}{places.map((place) => <div className="customer-place" key={place.id}><button className="customer-place-select" onClick={() => select(place.address)}><Icon name={place.label.toLowerCase() === "home" ? "Home" : "pin"} /><span><strong>{place.label}</strong><small>{place.address}</small></span></button><button onClick={() => { setEditing(place.id); setPlaceLabel(place.label); setPlaceAddress(place.address); }} aria-label={`Edit ${place.label}`}>Edit</button><button onClick={() => remove(place.id)} aria-label={`Delete ${place.label}`}>Delete</button></div>)}</div>
    <form className="customer-place-form" onSubmit={save}><label>Place name<input value={placeLabel} onChange={(event) => setPlaceLabel(event.target.value)} placeholder="Home, Work or another place" maxLength={40} required /></label><label>Address<input id="customer-place-address" value={placeAddress} onChange={(event) => setPlaceAddress(event.target.value)} placeholder="Enter an address" minLength={3} maxLength={120} required /></label><button className="customer-primary">{editing ? "Update place" : "Save place"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setPlaceLabel("Home"); setPlaceAddress(""); }}>Cancel</button>}</form>
  </section>;
}
