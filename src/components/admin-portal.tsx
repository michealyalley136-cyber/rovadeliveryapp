"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { applicationTypeOptions, ghanaCities, type ApplicationStatus, type ApplicationType } from "@/config/application-types";

type AdminUser = { name: string; role: string };
type ApplicationRow = {
  id: number;
  reference: string;
  type: ApplicationType;
  status: ApplicationStatus;
  submittedAt: string;
  assignedTo: string | null;
  applicant: { firstName: string; lastName: string; phone: string | null; email: string | null; city: string };
};
type AdminPayload = {
  applications: ApplicationRow[];
  page: number;
  pageSize: number;
  total: number;
  metrics: { total: number; newToday: number; byStatus: Record<string, number>; byType: Record<string, number> };
};
type ApplicationDetail = {
  id: number;
  reference: string;
  type: ApplicationType;
  status: ApplicationStatus;
  submittedAt: string;
  data: Record<string, string>;
  applicant: { firstName: string; lastName: string; phone: string | null; whatsapp: string | null; email: string | null; city: string; area: string | null };
  history: { previousStatus: ApplicationStatus | null; newStatus: ApplicationStatus; reason: string | null; changedAt: string; changedBy: { fullName: string } | null }[];
  notes: { body: string; followUpAt: string | null; createdAt: string; author: { fullName: string } }[];
  duplicateMatches: number;
  duplicates: { reference: string; type: ApplicationType; status: ApplicationStatus; submittedAt: string }[];
};

const statuses: ApplicationStatus[] = ["RECEIVED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "PRE_QUALIFIED", "APPROVED_FOR_NEXT_STAGE", "WAITLISTED", "DECLINED"];
const statusLabels: Record<ApplicationStatus, string> = {
  RECEIVED: "Received", UNDER_REVIEW: "Under review", MORE_INFORMATION_REQUIRED: "More information required",
  PRE_QUALIFIED: "Pre-qualified", APPROVED_FOR_NEXT_STAGE: "Approved for next stage", WAITLISTED: "Waitlisted", DECLINED: "Declined",
};

export function AdminPortal({ user }: { user: AdminUser | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdminPayload | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<ApplicationStatus>("UNDER_REVIEW");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saved, setSaved] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const detailRequest = useRef(0);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to sign in.");
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search.trim()) params.set("search", search.trim());
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      if (city) params.set("city", city);
      try {
        const response = await fetch(`/api/admin/applications?${params}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load applications.");
        if (active) setData(result);
      } catch (issue) {
        if (active) setError(issue instanceof Error ? issue.message : "Could not load applications.");
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [city, page, reloadToken, search, status, type, user]);

  async function openApplication(id: number, preserveConfirmation = false, preserveReview = false) {
    if (!preserveConfirmation && (loading || selected?.id === id)) return;
    if (!preserveConfirmation && selected && selected.id !== id && (reason.trim() || note.trim() || followUpAt) &&
      !window.confirm("Discard the unsaved review for this applicant?")) return;
    const requestId = ++detailRequest.current;
    setError("");
    if (!preserveConfirmation) setSaved("");
    try {
      const response = await fetch(`/api/admin/applications/${id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load application.");
      if (requestId !== detailRequest.current) return;
      setSelected(result.application);
      if (!preserveReview) setNextStatus(result.application.status === "RECEIVED" ? "UNDER_REVIEW" : result.application.status);
      if (!preserveConfirmation) {
        setReason("");
        setNote("");
        setFollowUpAt("");
      }
    } catch (issue) {
      if (requestId === detailRequest.current) setError(issue instanceof Error ? issue.message : "Could not load application.");
    }
  }

  async function saveReview() {
    if (!selected) return;
    if (nextStatus !== selected.status && reason.trim().length < 3) {
      setError("Enter a reason before changing application status.");
      return;
    }
    if (nextStatus === selected.status && !note.trim()) {
      setError("Choose a new status or add an internal note.");
      return;
    }
    if (!reason.trim() && !note.trim()) {
      setError("Add a status reason or an internal note.");
      return;
    }
    setError("");
    setSaved("");
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/applications/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(nextStatus !== selected.status ? { status: nextStatus, reason } : {}),
          ...(note.trim() ? { note, ...(followUpAt ? { followUpAt: new Date(followUpAt).toISOString() } : {}) } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save this review.");
      setNote("");
      setReason("");
      setFollowUpAt("");
      await openApplication(selected.id, true);
      setSaved("Review saved to the application history.");
      setReloadToken((current) => current + 1);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save this review.");
    } finally {
      setLoading(false);
    }
  }

  async function assignToMe() {
    if (!selected) return;
    setError("");
    setSaved("");
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/applications/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignToMe: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not assign this application.");
      await openApplication(selected.id, true, true);
      setSaved("Application assigned to you.");
      setReloadToken((current) => current + 1);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not assign this application.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.reload();
  }

  function downloadCsv() {
    const link = document.createElement("a");
    link.href = "/api/admin/applications?format=csv";
    link.download = "rova-applications.csv";
    link.click();
  }

  if (!user) return <main className="admin-login-page"><Link className="apply-brand" href="/">ROVA<span>.</span></Link><form className="admin-login-card" onSubmit={(event) => void signIn(event)}><div className="section-kicker">RESTRICTED ACCESS</div><h1>ROVA Operations</h1><p>Sign-in is limited to provisioned ROVA team accounts. There is no public admin registration.</p><label>Work email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="apply-error" role="alert">{error}</p>}<button className="apply-primary" disabled={loading}>{loading ? "Signing in…" : "Sign in"} <span>→</span></button></form></main>;

  const canEdit = user.role !== "VIEW_ONLY";
  const maxPage = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  const selectedTypeLabel = (value: string) => applicationTypeOptions.find((item) => item.type === value)?.label ?? value;

  return <main className="admin-page"><aside className="admin-sidebar"><Link className="apply-brand" href="/">ROVA<span>.</span></Link><span className="admin-section-label">RECRUITMENT PORTAL</span><nav><a className="active" href="#applications">Applications</a><a href="#pipeline">Pipeline</a><a href="#applications">Partners</a></nav><div className="admin-sidebar-bottom"><b>{user.name}</b><small>{user.role.replaceAll("_", " ")}</small><button onClick={() => void signOut()}>Sign out ↗</button><Link href="/">← Public website</Link></div></aside><section className="admin-main"><header className="admin-header"><div><span className="section-kicker">ROVA GHANA · PRE-LAUNCH</span><h1>Applications</h1></div><div className="admin-header-actions"><button className="admin-export" onClick={downloadCsv}>Export CSV ↓</button><span className="admin-role">{user.role.replaceAll("_", " ")}</span></div></header>
    {error && <p className="apply-error admin-error" role="alert">{error}</p>}{saved && <p className="admin-saved" role="status">{saved}</p>}
    <section className="admin-metrics"><article><span>Total applications</span><b>{data?.metrics.total ?? "—"}</b></article><article><span>New today</span><b>{data?.metrics.newToday ?? "—"}</b></article><article><span>Under review</span><b>{data?.metrics.byStatus.UNDER_REVIEW ?? 0}</b></article><article><span>Pre-qualified</span><b>{data?.metrics.byStatus.PRE_QUALIFIED ?? 0}</b></article><article><span>Needs follow-up</span><b>{data?.metrics.byStatus.MORE_INFORMATION_REQUIRED ?? 0}</b></article></section>
    <section className="admin-panel" id="applications"><div className="admin-panel-heading"><div><span className="section-kicker">RECRUITMENT PIPELINE</span><h2>Applicant directory</h2></div><span>{data?.total ?? 0} records</span></div><div className="admin-filters"><input aria-label="Search applicants" placeholder="Search reference, name, phone or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Filter by application type" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">All application types</option>{applicationTypeOptions.map((item)=><option value={item.type} key={item.type}>{item.label}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{statuses.map((item)=><option value={item} key={item}>{statusLabels[item]}</option>)}</select><select aria-label="Filter by city" value={city} onChange={(event) => { setCity(event.target.value); setPage(1); }}><option value="">All cities</option>{ghanaCities.map((item)=><option value={item} key={item}>{item}</option>)}</select></div>
      <div className="admin-table-scroll"><table><thead><tr><th>REFERENCE</th><th>APPLICANT</th><th>TYPE</th><th>PHONE</th><th>CITY</th><th>SUBMITTED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{data?.applications.map((application)=><tr key={application.id}><td><button className="ref-link" onClick={() => void openApplication(application.id)}>{application.reference}</button></td><td>{application.applicant.firstName} {application.applicant.lastName}<small>{application.applicant.email ?? ""}</small></td><td>{selectedTypeLabel(application.type)}</td><td>{application.applicant.phone ?? "Restricted"}</td><td>{application.applicant.city}</td><td>{new Date(application.submittedAt).toLocaleDateString("en-GH")}</td><td><span className={`admin-status status-${application.status.toLowerCase()}`}>{statusLabels[application.status]}</span></td><td><button className="view-button" onClick={() => void openApplication(application.id)}>Open</button></td></tr>)}</tbody></table>{!data?.applications.length && <div className="admin-empty">No applications match these filters. New submissions will appear here.</div>}</div><div className="admin-pagination"><span>Page {page} of {maxPage} · {data?.total ?? 0} applications</span><div><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>← Previous</button><button onClick={() => setPage((current) => Math.min(maxPage, current + 1))} disabled={page >= maxPage}>Next →</button></div></div></section>
    {selected && <section className="admin-panel application-detail"><div className="admin-panel-heading"><div><span className="section-kicker">APPLICATION PROFILE</span><h2>{selected.applicant.firstName} {selected.applicant.lastName}</h2><p>{selected.reference} · {selectedTypeLabel(selected.type)} · {selected.applicant.city}</p></div><button className="detail-close" onClick={() => setSelected(null)}>Close ×</button></div>{selected.duplicateMatches > 0 && <div className="admin-duplicate-warning" role="status"><b>Possible duplicate applications</b><span>{selected.duplicateMatches} other application(s) use this applicant’s phone or email.</span>{selected.duplicates.map((duplicate) => <small key={duplicate.reference}>{duplicate.reference} · {selectedTypeLabel(duplicate.type)} · {statusLabels[duplicate.status]}</small>)}</div>}<div className="detail-columns"><div><h3>Applicant details</h3><div className="detail-values"><span>Phone<b>{selected.applicant.phone ?? "Restricted"}</b></span><span>WhatsApp<b>{selected.applicant.whatsapp ?? "Not provided"}</b></span><span>Email<b>{selected.applicant.email ?? "Not provided"}</b></span><span>Area<b>{selected.applicant.area ?? "Not provided"}</b></span></div><h3>Application responses</h3><div className="detail-values">{Object.entries(selected.data).map(([key,value])=><span key={key}>{key.replaceAll(/([A-Z])/g," $1").replaceAll("_"," ")}<b>{value}</b></span>)}</div></div><div className="detail-review"><h3>Review action</h3>{canEdit ? <><button className="admin-assign-button" onClick={() => void assignToMe()} disabled={loading}>Assign to me</button><label>Status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ApplicationStatus)}>{statuses.map((item)=><option value={item} key={item}>{statusLabels[item]}</option>)}</select></label><label>Reason for status change<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required when changing status" /></label><label>Internal note<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Not visible to the applicant" /></label><label>Follow-up date<input type="date" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></label><button className="apply-primary" onClick={() => void saveReview()} disabled={loading}>Save review <span>→</span></button></> : <p className="admin-private-note">This account has view-only access. Contact an administrator to make changes.</p>}<h3>Status history</h3><div className="admin-history">{selected.history.map((entry)=><div key={`${entry.newStatus}-${entry.changedAt}`}><b>{statusLabels[entry.newStatus]}</b><small>{entry.previousStatus ? `from ${statusLabels[entry.previousStatus]}` : "Application received"} · {new Date(entry.changedAt).toLocaleString("en-GH")}</small>{entry.reason && <small>{entry.reason}</small>}</div>)}</div><h3>Internal notes</h3>{selected.notes.length ? selected.notes.map((item)=><div className="admin-history" key={item.createdAt}><b>{item.author.fullName}</b><small>{new Date(item.createdAt).toLocaleString("en-GH")}{item.followUpAt ? ` · follow-up ${new Date(item.followUpAt).toLocaleDateString("en-GH")}` : ""}</small><small>{item.body}</small></div>) : <p className="admin-private-note">No internal notes yet.</p>}</div></div></section>}
    <footer className="admin-footer">Applicant information is confidential. Actions are recorded in the audit history.</footer></section></main>;
}
