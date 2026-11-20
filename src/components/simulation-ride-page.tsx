"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SimulationMap } from "@/components/simulation-map";
import { readSimulations, searchElapsed, simulateAt, writeSimulations, type SimulationRide } from "@/lib/ride-simulation";

const labels: Record<SimulationRide["status"], string> = {
  SEARCHING: "Finding your driver", APPROACHING: "Your demo driver is on the way", ARRIVED: "Demo driver arrived",
  IN_PROGRESS: "Your demo journey is underway", COMPLETED: "Demo journey completed",
  CANCELLED: "Demo journey cancelled", NO_DRIVERS: "No demo drivers nearby",
};

export function SimulationRidePage({ rideId, controls }: { rideId: string; controls: boolean }) {
  const [ride, setRide] = useState<SimulationRide | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function tick() {
      try {
        const time = Date.now();
        const rides = readSimulations();
        const found = rides.find((item) => item.id === rideId);
        const updated = found ? simulateAt(found, time) : null;
        if (found && updated && updated !== found) writeSimulations(rides.map((item) => item.id === rideId ? updated : item));
        setRide(updated); setNow(time); setLoaded(true);
      } catch {
        setError("Demo journeys could not be loaded from this browser."); setLoaded(true);
      }
    }
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [rideId]);

  function change(update: (value: SimulationRide, time: number) => SimulationRide) {
    try {
      const time = Date.now();
      const rides = readSimulations();
      const current = rides.find((item) => item.id === rideId);
      if (!current) throw new Error("Demo journey not found.");
      const next = update(simulateAt(current, time), time);
      writeSimulations(rides.map((item) => item.id === rideId ? next : item));
      setRide(next); setNow(time); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the demo journey."); }
  }

  return <main className="customer-app simulation-page"><div className="simulation-shell">
    <header className="customer-booking-header"><Link href="/customer" className="customer-back">← Dashboard</Link><Link href="/" className="customer-logo">ROVA<span>.</span></Link></header>
    <p className="simulation-disclaimer">SIMULATION ONLY · No real locations, drivers, bookings or payments</p>
    {error && <p className="customer-alert" role="alert">{error}</p>}
    {!loaded && <p>Loading demo journey…</p>}
    {loaded && !ride && <p>This demo journey is not available in this browser. <Link href="/customer">Return to dashboard</Link>.</p>}
    {ride && <>
      <SimulationMap ride={ride} now={now} />
      <section className="simulation-card" aria-live="polite">
        <span className="customer-kicker">DEMO {ride.service === "RIDE" ? "MOTORCYCLE" : "CAB"}</span>
        <h1>{ride.status === "SEARCHING" ? `Finding your ${ride.service === "RIDE" ? "rider" : "driver"}` : labels[ride.status]}</h1>
        <p><strong>From:</strong> {ride.pickup} <br /><strong>To:</strong> {ride.destination}</p>
        <p>The map is illustrative; addresses have not been geocoded and the route is not real.</p>
        <p>Nearby vehicles are independent demo traffic. The assigned driver and approach are separately scripted.</p>
        {["APPROACHING", "ARRIVED", "IN_PROGRESS"].includes(ride.status) && <div className="simulation-driver"><span>{ride.service === "RIDE" ? "🏍" : "🚘"}</span><div><strong>Demo driver · Kofi</strong><small>Synthetic profile · {ride.status === "APPROACHING" ? `simulated ETA ${Math.max(0, Math.ceil((15000 - ((ride.paused ? ride.startedAt : now) - ride.phaseStartedAt) * ride.speed) / 1000))}s` : ride.status === "ARRIVED" ? "at pickup" : "journey in progress"}</small></div></div>}
        {ride.status === "ARRIVED" && <button className="customer-primary" onClick={() => change((current, time) => current.status === "ARRIVED" ? { ...current, status: "IN_PROGRESS", phaseStartedAt: time } : current)}>Verify demo pickup &amp; start</button>}
        {ride.status === "IN_PROGRESS" && <p>Simulated journey progress: {Math.min(100, Math.max(0, Math.floor(((ride.paused ? ride.startedAt : now) - ride.phaseStartedAt) * ride.speed / 300)))}%</p>}
        {ride.status === "COMPLETED" && <p>Trip summary: {ride.pickup} to {ride.destination}. No fare or payment was processed.</p>}
        {ride.status === "NO_DRIVERS" && <p>We couldn&apos;t find a simulated driver. You can try another demo booking.</p>}
        {["SEARCHING", "APPROACHING", "ARRIVED"].includes(ride.status) && <button className="simulation-cancel" onClick={() => change((current, time) => ["SEARCHING", "APPROACHING", "ARRIVED"].includes(current.status) ? { ...current, status: "CANCELLED", phaseStartedAt: time } : current)}>Cancel demo request</button>}
        {["COMPLETED", "CANCELLED", "NO_DRIVERS"].includes(ride.status) && <Link className="customer-back" href="/customer">Return to dashboard</Link>}
      </section>
      {controls && <section className="simulation-controls"><h2>Authorized demo controls</h2>
        <label>Scenario <select value={ride.scenario} disabled={ride.status !== "SEARCHING"} onChange={(event) => {
          const value = event.target.value;
          if (value === "immediate" || value === "delayed" || value === "expanded" || value === "none") change((current) => ({ ...current, scenario: value }));
        }}><option value="immediate">Immediate acceptance</option><option value="delayed">Delayed acceptance</option><option value="expanded">Multiple expansions</option><option value="none">No drivers</option></select></label>
        <button onClick={() => change((current, time) => current.paused ? { ...current, paused: false, startedAt: time, phaseStartedAt: time - (current.startedAt - current.phaseStartedAt) } : { ...current, elapsed: current.status === "SEARCHING" ? searchElapsed(current, time) : current.elapsed, paused: true, startedAt: time })}>{ride.paused ? "Resume" : "Pause"}</button>
        <button disabled={ride.paused} onClick={() => change((current, time) => ({ ...current, elapsed: current.status === "SEARCHING" ? searchElapsed(current, time) : current.elapsed, startedAt: time, phaseStartedAt: time - (time - current.phaseStartedAt) * current.speed / (current.speed === 1 ? 10 : 1), speed: current.speed === 1 ? 10 : 1 }))}>Speed: {ride.speed}×</button>
        {ride.status === "APPROACHING" && <button onClick={() => change((current, time) => ({ ...current, status: "ARRIVED", phaseStartedAt: time }))}>Simulate arrival</button>}
        {ride.status === "IN_PROGRESS" && <button onClick={() => change((current, time) => ({ ...current, status: "COMPLETED", phaseStartedAt: time }))}>Complete demo journey</button>}
      </section>}
    </>}
  </div></main>;
}
