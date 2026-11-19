"use client";

import Link from "next/link";
import { useState } from "react";

type StatusResult = {
  reference: string;
  type: string;
  status: string;
  submittedAt: string;
};

const statusLabels: Record<string, string> = {
  RECEIVED: "Received",
  UNDER_REVIEW: "Under review",
  MORE_INFORMATION_REQUIRED: "More information required",
  PRE_QUALIFIED: "Pre-qualified",
  APPROVED_FOR_NEXT_STAGE: "Approved for next stage",
  WAITLISTED: "Waitlisted",
  DECLINED: "Declined",
};

const typeLabels: Record<string, string> = {
  MOTORCYCLE_RIDER: "Motorcycle Rider",
  TAXI_DRIVER: "Taxi Driver",
  DELIVERY_PARTNER: "Delivery Partner",
  VEHICLE_ACCESS: "Vehicle Access",
  MERCHANT: "Restaurant / Merchant",
  FLEET_OWNER: "Fleet Owner",
  VEHICLE_DEALER: "Vehicle Dealer",
  STRATEGIC_PARTNER: "Business / Strategic Partner",
};

export function ApplicationStatus() {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    const isEmail = contact.includes("@");
    try {
      const response = await fetch("/api/application-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, ...(isEmail ? { email: contact } : { phone: contact }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Status is temporarily unavailable.");
      setResult(data.application);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="apply-page"><header className="apply-header"><Link className="apply-brand" href="/">ROVA<span>.</span></Link><span>GHANA · PRE-LAUNCH</span><Link href="/apply">Apply to join ROVA</Link></header><section className="status-page"><div className="section-kicker">ROVA APPLICATIONS</div><h1>Check your<br /><em>application status.</em></h1><p>Enter your application reference and the email or phone number you used to apply.</p><form className="status-form" onSubmit={(event) => void checkStatus(event)}><label>Application reference<input required autoComplete="off" placeholder="ROVA-RID-000001" value={reference} onChange={(event) => setReference(event.target.value)} /></label><label>Email or Ghana phone<input required autoComplete="email" placeholder="Email or +233 phone number" value={contact} onChange={(event) => setContact(event.target.value)} /></label>{error && <p className="apply-error" role="alert">{error}</p>}<button className="apply-primary" disabled={loading}>{loading ? "Checking…" : "Check status"} <span>→</span></button></form>{result && <section className="status-result" role="status"><div><span>APPLICATION STATUS</span><b className={`status-${result.status.toLowerCase()}`}>{statusLabels[result.status] ?? result.status}</b></div><div><span>REFERENCE</span><strong>{result.reference}</strong></div><div><span>APPLICATION TYPE</span><b>{typeLabels[result.type] ?? result.type}</b></div><div><span>SUBMITTED</span><b>{new Date(result.submittedAt).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}</b></div><small>This is an application status only. It does not mean you are an active ROVA operator or that services are available.</small></section>}<Link className="status-back" href="/">← Back to ROVA Ghana</Link></section><footer className="apply-footer"><span>© ROVA Ghana. All rights reserved.</span><Link href="/privacy">Privacy notice</Link></footer></main>;
}
