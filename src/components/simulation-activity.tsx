"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isActiveSimulation, readSimulations, simulateAt, type SimulationRide } from "@/lib/ride-simulation";

export function SimulationActivity() {
  const [rides, setRides] = useState<SimulationRide[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    function load() {
      try {
        setRides(readSimulations().map((ride) => simulateAt(ride, Date.now())));
        setError("");
      } catch {
        setError("Saved demo journeys could not be loaded from this browser.");
      }
    }
    load();
    window.addEventListener("storage", load);
    window.addEventListener("rova-simulation-changed", load);
    return () => { window.removeEventListener("storage", load); window.removeEventListener("rova-simulation-changed", load); };
  }, []);
  return <div><h2>Browser simulations</h2><p>Saved only on this device. These are not real rides.</p>
    {error && <p role="alert">{error}</p>}
    {!error && rides.length === 0 && <p>No browser simulations yet.</p>}
    {(["Active journeys", "Completed journeys", "Cancelled or unavailable"] as const).map((group) => {
      const items = rides.filter((ride) => group === "Active journeys" ? isActiveSimulation(ride) : group === "Completed journeys" ? ride.status === "COMPLETED" : ["CANCELLED", "NO_DRIVERS"].includes(ride.status));
      return items.length > 0 && <div key={group}><h3>{group}</h3>{items.map((ride) => <Link className="customer-trip" key={ride.id} href={`/customer/ride/${ride.id}`}><div><strong>{ride.destination}</strong><p>From {ride.pickup} · {ride.service === "RIDE" ? "Motorcycle" : "Cab"}</p></div><span>{ride.status.replaceAll("_", " ").toLowerCase()}</span></Link>)}</div>;
    })}
  </div>;
}
