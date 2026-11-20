"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole, AuditEvent, LedgerEntry, Trip } from "@/lib/domain";
import { formatGhs } from "@/lib/money";
import { SignIn } from "@/components/sign-in";

type DashboardPayload = {
  trips: Trip[];
  ledger?: LedgerEntry[];
  audits?: AuditEvent[];
  operatorOnline?: boolean;
  metrics?: { activeTrips: number; tripsToday: number; onlineOperators: number; criticalIncidents: number; pendingApplications: number };
};

const destinations = {
  CUSTOMER: { title: "Where are you going?", subtitle: "A safer, smoother way to get there.", nav: ["Home", "Activity", "Services", "Safety", "Account"] },
  OPERATOR: { title: "Good morning, Kojo.", subtitle: "Your next opportunity starts here.", nav: ["Home", "Earnings", "Activity", "Vehicle", "Account"] },
  OPERATIONS: { title: "Operations overview", subtitle: "ROVA Ghana · Accra pilot", nav: ["Overview", "Live operations", "Operators", "Fleet", "Safety", "Compliance", "Audit log"] },
} as const;

const statusNames: Record<string, string> = {
  REQUESTED: "Requested", SEARCHING: "Finding a rider", RIDER_ASSIGNED: "Rider assigned", RIDER_EN_ROUTE: "On the way",
  RIDER_ARRIVED: "At pickup", TRIP_STARTED: "In progress", TRIP_COMPLETED: "Completed", CANCELLED: "Cancelled", EMERGENCY: "Emergency",
};

export function Portal({ role, user }: { role: AppRole; user: { name: string } | null }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [pickup, setPickup] = useState("Osu Oxford Street, Accra");
  const [destination, setDestination] = useState("");
  const [service, setService] = useState<"RIDE" | "TAXI">("RIDE");
  const [fare, setFare] = useState<number | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (response.status === 401) {
      router.refresh();
      return;
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Unable to load dashboard data.");
    setData(payload);
    setDashboardError("");
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!active) return;
        if (response.status === 401) {
          router.refresh();
          return;
        }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load dashboard data.");
        if (active) {
          setData(payload);
          setDashboardError("");
        }
      } catch (reason) {
        if (active) setDashboardError(reason instanceof Error ? reason.message : "Unable to load dashboard data.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [router, user]);

  useEffect(() => {
    if (role !== "CUSTOMER" || !user) return;
    let active = true;
    void fetch(`/api/rides?service=${service}`)
      .then(async (response) => {
        const result = await response.json();
        if (response.ok && active) setFare(result.farePesewas);
      })
      .catch(() => {
        if (active) setFare(null);
      });
    return () => { active = false; };
  }, [role, service, user]);

  async function perform(url: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That action could not be completed.");
      setMessage(result.message ?? "Updated.");
      await refresh();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <main className="signin-page"><Link href="/" className="wordmark">ROVA<span>.</span></Link><SignIn role={role} /><Link className="back-home" href="/">← Back to ROVA</Link></main>;
  const content = destinations[role];

  return (
    <main className={`portal portal-${role.toLowerCase()}`}>
      <aside className="sidebar">
        <Link className="wordmark" href="/">ROVA<span>.</span></Link>
        <div className="workspace-label">{role === "OPERATIONS" ? "GHANA OPERATIONS" : role === "OPERATOR" ? "OPERATOR APP" : "CUSTOMER APP"}</div>
        <nav className="side-nav" aria-label="Main navigation">
          {content.nav.map((item, index) => <a className={index === 0 ? "active" : ""} href={index === 0 ? `/${role === "OPERATIONS" ? "operations" : role === "OPERATOR" ? "driver" : "customer"}` : "#"} key={item}><span className="nav-glyph">{["⌂", "◷", "◇", "✳", "○", "▦", "◉"][index]}</span>{item}</a>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="safety-reminder"><span>✳</span><strong>Safety is how<br />we move.</strong><small>Need help? We&apos;re here.</small></div>
        <div className="profile-block"><div className="avatar">{user.name.split(" ").map((part) => part[0]).join("")}</div><div><strong>{user.name}</strong><small>{role === "OPERATIONS" ? "Operations team" : `${role === "OPERATOR" ? "ROVA" : "ROVA"} ${role === "OPERATOR" ? "Rider" : "Customer"}`}</small></div><button className="logout" aria-label="Sign out" onClick={() => void perform("/api/session", "DELETE")}>↗</button></div>
      </aside>
      <section className="portal-main">
        <header className="portal-header"><div className="mobile-brand"><Link className="wordmark" href="/">ROVA<span>.</span></Link><span className="demo-label">DEMO</span></div><div className="header-note"><span className="status-dot" /> {role === "OPERATIONS" ? "ACCRA PILOT · DEMO DATA" : "ACCRA, GHANA"}</div><button className="notification-button" aria-label="Notifications">♧<i /></button></header>
        <div className="portal-content">
          <div className="portal-title-row"><div><div className="eyebrow dark-eyebrow">{role === "OPERATIONS" ? "COMMAND CENTER" : role === "OPERATOR" ? "YOUR ROVA DAY" : "ROVA GHANA · DEMO"}</div><h1>{content.title}</h1><p>{content.subtitle}</p></div><span className="demo-label">DEMO WORKSPACE</span></div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {dashboardError && <div className="alert alert-error" role="alert">{dashboardError} {data && "Displayed dashboard data may be out of date."}</div>}
          {message && <div className="alert alert-success" role="status">{message}</div>}
          {!data && !dashboardError && <p role="status">Loading dashboard data…</p>}
          {data && role === "CUSTOMER" && <CustomerView data={data} pickup={pickup} setPickup={setPickup} destination={destination} setDestination={setDestination} service={service} setService={setService} fare={fare} busy={busy} onRequest={() => void perform("/api/rides", "POST", { pickup, destination, service })} />}
          {data && role === "OPERATOR" && <OperatorView data={data} busy={busy} onAvailability={(online) => void perform("/api/operator/availability", "POST", { online })} onAction={(tripId, action) => void perform(`/api/rides/${tripId}/action`, "POST", { action })} />}
          {data && role === "OPERATIONS" && <OperationsView data={data} />}
          <footer className="portal-footer"><span>ROVA GHANA · PILOT ENVIRONMENT</span><span>Move forward, together.</span></footer>
        </div>
      </section>
    </main>
  );
}

function CustomerView({ data, pickup, setPickup, destination, setDestination, service, setService, fare, busy, onRequest }: {
  data: DashboardPayload | null; pickup: string; setPickup: (value: string) => void; destination: string;
  setDestination: (value: string) => void; service: "RIDE" | "TAXI"; setService: (value: "RIDE" | "TAXI") => void;
  fare: number | null; busy: boolean; onRequest: () => void;
}) {
  const trips = data?.trips ?? [];
  return <div className="customer-layout">
    <section className="request-card"><div className="request-card-top"><div><span className="eyebrow dark-eyebrow">PLAN YOUR JOURNEY</span><h2>Where to?</h2></div><span className="location-chip"><i /> ACCRA</span></div>
      <div className="route-inputs"><label><span className="route-marker pickup-marker" /> <span className="field-wrap"><small>YOUR PICKUP</small><input aria-label="Pickup location" value={pickup} onChange={(event) => setPickup(event.target.value)} /></span></label><div className="route-line" /><label><span className="route-marker destination-marker" /> <span className="field-wrap"><small>YOUR DESTINATION</small><input aria-label="Destination" placeholder="Where would you like to go?" value={destination} onChange={(event) => setDestination(event.target.value)} /></span></label></div>
      <div className="service-selector"><button className={service === "RIDE" ? "selected" : ""} onClick={() => setService("RIDE")}><span className="service-emoji">↗</span><span><b>ROVA Ride</b><small>Motorcycle · quick</small></span><i>●</i></button><button className={service === "TAXI" ? "selected" : ""} onClick={() => setService("TAXI")}><span className="service-emoji">⌑</span><span><b>ROVA Taxi</b><small>Car · comfortable</small></span><i>●</i></button></div>
      <div className="fare-estimate"><span>DEMO FARE ESTIMATE</span><strong>{fare === null ? "—" : formatGhs(fare)}</strong></div>
      <button className="button button-dark request-button" onClick={onRequest} disabled={busy || destination.trim().length < 3}>{busy ? "Requesting…" : "Find a ride"}<span>→</span></button>
      <p className="demo-disclaimer">Estimate uses demo pricing for a sample Accra route. No payment will be collected.</p>
    </section>
    <section className="side-content"><div className="map-preview"><div className="map-preview-grid" /><div className="map-preview-road road-a" /><div className="map-preview-road road-b" /><div className="map-location"><span>●</span></div><div className="map-preview-tag">ACCRA · GHANA <b>05°33&apos; N</b></div><div className="map-preview-status"><i /> ROVA SERVICE AREA <span>ACTIVE</span></div></div>
      <div className="quick-links"><button><span>⌂</span><b>Home</b><small>Set a saved place</small><i>＋</i></button><button><span>▣</span><b>Work</b><small>Set a saved place</small><i>＋</i></button></div>
      <div className="trip-list"><div className="subsection-title"><h3>Your recent trips</h3><span>{trips.length} trips</span></div>{trips.length ? trips.slice(0, 3).map((trip) => <TripRow key={trip.id} trip={trip} />) : <div className="empty-state">Your journeys will appear here once you request a ride.</div>}</div>
    </section>
  </div>;
}

function OperatorView({ data, busy, onAvailability, onAction }: {
  data: DashboardPayload | null; busy: boolean; onAvailability: (online: boolean) => void; onAction: (tripId: string, action: string) => void;
}) {
  const trips = data?.trips ?? [];
  const available = Boolean(data?.operatorOnline);
  const job = trips.find((trip) => trip.status !== "TRIP_COMPLETED" && trip.status !== "CANCELLED");
  const earnings = (data?.ledger ?? []).filter((entry) => entry.type === "CREDIT").reduce((sum, entry) => sum + entry.amountPesewas, 0);
  return <div className="operator-view">
    <section className="operator-welcome"><div><span className="eyebrow">YOUR STATUS</span><h2>{available ? "You’re online." : "Ready when you are."}</h2><p>{available ? "You can receive ride requests in the Accra pilot zone." : "Go online to receive requests from nearby customers."}</p></div><button className={`online-toggle ${available ? "is-online" : ""}`} onClick={() => onAvailability(!available)} disabled={busy} aria-pressed={available}><span />{available ? "ONLINE" : "GO ONLINE"}</button></section>
    <div className="metric-grid"><Metric label="Today’s earnings" value={formatGhs(earnings)} note="Net demo ledger" /><Metric label="Trips completed" value={String((data?.ledger ?? []).filter((entry) => entry.category === "TRIP_EARNING").length)} note="Today · demo" /><Metric label="Current balance" value={formatGhs(earnings)} note="Available in demo wallet" /></div>
    <div className="operator-columns"><section className="panel"><div className="subsection-title"><h3>{job ? "Your active request" : "Ride requests"}</h3><span className="live-tag"><i /> LIVE DEMO</span></div>{job ? <div className="operator-job"><div className="job-type"><span>↗</span><b>ROVA {job.service === "RIDE" ? "RIDE" : "TAXI"}</b><small>{job.estimatedDistanceKm.toFixed(1)} km · ~{job.estimatedDurationMin} min</small></div><div className="job-point"><i className="point-pickup" /><div><small>PICKUP</small><b>{job.pickup}</b></div></div><div className="job-point"><i className="point-destination" /><div><small>DESTINATION</small><b>{job.destination}</b></div></div><div className="job-fare"><small>ESTIMATED FARE</small><strong>{formatGhs(job.estimatedFarePesewas)}</strong></div><TripActions trip={job} busy={busy} onAction={onAction} /></div> : <div className="empty-state">No ride requests at the moment. New demo requests will appear here.</div>}</section>
      <section className="panel earnings-panel"><div className="subsection-title"><h3>Recent earnings</h3><span>LEDGER</span></div>{data?.ledger?.length ? data.ledger.slice(0, 5).map((entry) => <div className="ledger-row" key={entry.id}><span className={entry.type === "CREDIT" ? "credit-mark" : "debit-mark"}>{entry.type === "CREDIT" ? "+" : "−"}</span><div><b>{entry.category === "TRIP_EARNING" ? "Trip earning" : "ROVA platform fee"}</b><small>{entry.description}</small></div><strong>{entry.type === "DEBIT" ? "−" : "+"}{formatGhs(entry.amountPesewas)}</strong></div>) : <div className="empty-state">Completed trip earnings and fee breakdowns will be listed here.</div>}<div className="demo-note">DEMO EXAMPLE · platform fees are configurable, not a final commercial rate.</div></section></div>
    <section className="compliance-banner"><span>✓</span><div><b>Demo compliance checks: approved</b><small>Identity, licence, vehicle, insurance, training and agreement are valid in this fictional operator profile.</small></div><Link className="onboarding-link" href="/driver/onboarding">Onboarding →</Link><span className="status-pill status-green">READY</span></section>
  </div>;
}

function OperationsView({ data }: { data: DashboardPayload | null }) {
  const metrics = data?.metrics;
  const trips = data?.trips ?? [];
  return <div className="operations-view"><div className="metric-grid ops-metrics"><Metric label="Active operators" value="1" note="Verified demo profile" /><Metric label="Online operators" value={String(metrics?.onlineOperators ?? 0)} note="Accra service zone" /><Metric label="Active trips" value={String(metrics?.activeTrips ?? 0)} note="Live operations" /><Metric label="Applications to review" value={String(metrics?.pendingApplications ?? 0)} note="Operator onboarding" /></div>
    <div className="ops-columns"><section className="panel ops-trip-panel"><div className="subsection-title"><div><span className="eyebrow dark-eyebrow">LIVE OPERATIONS</span><h3>Trips in progress</h3></div><span className="live-tag"><i /> UPDATING</span></div><div className="table-scroll"><table><thead><tr><th>TRIP</th><th>SERVICE</th><th>ROUTE</th><th>OPERATOR</th><th>STATUS</th></tr></thead><tbody>{trips.map((trip) => <tr key={trip.id}><td><b>{trip.id.slice(0, 12).toUpperCase()}</b><small>{new Date(trip.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</small></td><td>ROVA {trip.service}</td><td><span>{trip.pickup}</span><small>to {trip.destination}</small></td><td>{trip.operatorId ? "Kojo Asare" : "Finding operator"}</td><td><span className={`status-pill ${trip.status === "TRIP_COMPLETED" ? "status-green" : trip.status === "EMERGENCY" ? "status-red" : "status-blue"}`}>{statusNames[trip.status]}</span></td></tr>)}</tbody></table>{!trips.length && <div className="empty-state">No trips have been requested in this demo session.</div>}</div></section>
      <section className="panel attention-panel"><div className="subsection-title"><h3>Needs attention</h3><span className="attention-count">03</span></div><AttentionItem color="amber" title="Compliance review queue" detail={`${metrics?.pendingApplications ?? 0} operator applications · no document, no activation`} /><AttentionItem color="red" title="Critical safety incidents" detail={`${metrics?.criticalIncidents ?? 0} open incidents`} /><AttentionItem color="blue" title="Fleet readiness" detail="1 demo vehicle · assigned" /><div className="zone-card"><span className="eyebrow dark-eyebrow">PILOT SERVICE AREA</span><b>Accra · Greater Accra</b><div><span className="zone-status on">RIDE <i>ON</i></span><span className="zone-status off">TAXI <i>OFF</i></span><span className="zone-status off">FOOD <i>OFF</i></span><span className="zone-status off">DELIVERY <i>OFF</i></span></div></div></section></div>
    <section className="panel audit-panel"><div className="subsection-title"><div><span className="eyebrow dark-eyebrow">ACCOUNTABILITY</span><h3>Recent audit activity</h3></div><span>READ ONLY</span></div>{data?.audits?.length ? data.audits.slice(0, 6).map((event) => <div className="audit-row" key={event.id}><i /><div><b>{event.action.replaceAll("_", " ")}</b><small>{event.entity} · {event.entityId.slice(0, 16)}</small></div><time>{new Date(event.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</time></div>) : <div className="empty-state">Sensitive actions are recorded here. No new activity yet.</div>}</section>
  </div>;
}

function TripActions({ trip, busy, onAction }: { trip: Trip; busy: boolean; onAction: (id: string, action: string) => void }) {
  const action = trip.status === "SEARCHING" ? "ACCEPT" : trip.status === "RIDER_ASSIGNED" ? "EN_ROUTE" : trip.status === "RIDER_EN_ROUTE" ? "ARRIVED" : trip.status === "RIDER_ARRIVED" ? "START" : trip.status === "TRIP_STARTED" ? "COMPLETE" : null;
  const label = action === "ACCEPT" ? "Accept request" : action === "EN_ROUTE" ? "Go to pickup" : action === "ARRIVED" ? "I’ve arrived" : action === "START" ? "Start trip" : action === "COMPLETE" ? "Complete trip" : null;
  return <div className="trip-action-row"><span className="status-pill status-blue">{statusNames[trip.status]}</span>{action && label && <button className="button button-dark" onClick={() => onAction(trip.id, action)} disabled={busy}>{label}<span>→</span></button>}</div>;
}

function TripRow({ trip }: { trip: Trip }) {
  return <div className="trip-row"><span className="trip-icon">↗</span><div><b>{trip.destination}</b><small>{trip.pickup} · {new Date(trip.createdAt).toLocaleDateString("en-GH")}</small></div><span className={`status-pill ${trip.status === "TRIP_COMPLETED" ? "status-green" : "status-blue"}`}>{statusNames[trip.status]}</span></div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function AttentionItem({ color, title, detail }: { color: "amber" | "red" | "blue"; title: string; detail: string }) {
  return <div className="attention-item"><i className={`attention-dot ${color}`} /><div><b>{title}</b><small>{detail}</small></div><span>→</span></div>;
}
