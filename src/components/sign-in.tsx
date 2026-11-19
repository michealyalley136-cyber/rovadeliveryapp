"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/lib/domain";

const roleLabels: Record<AppRole, { title: string; detail: string }> = {
  CUSTOMER: { title: "Customer", detail: "Plan a ride and follow your trip." },
  OPERATOR: { title: "Rider", detail: "Manage availability, trips and earnings." },
  OPERATIONS: { title: "Operations", detail: "Monitor the pilot and live trip activity." },
};

export function SignIn({ role }: { role: AppRole }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function signIn() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to start a demo session.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start a demo session.");
    } finally {
      setLoading(false);
    }
  }

  const info = roleLabels[role];
  return (
    <section className="signin-card">
      <div className="signin-mark">R</div>
      <div className="eyebrow dark-eyebrow">ROVA PILOT WORKSPACE</div>
      <h1>Welcome to ROVA.</h1>
      <p>Explore a clearly labelled demo workspace. No real ride requests or payments will be made.</p>
      <div className="role-choice"><span className="role-dot" /><div><strong>{info.title} demo</strong><small>{info.detail}</small></div><span className="demo-label">DEMO</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark signin-button" onClick={signIn} disabled={loading}>{loading ? "Starting workspace…" : `Continue as ${info.title}`} <span>→</span></button>
      <p className="signin-footnote">Demo data is temporary and resets when the server restarts.</p>
    </section>
  );
}
