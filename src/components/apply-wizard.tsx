"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  applicationFields,
  applicationTypeOptions,
  isApplicationType,
  sharedApplicationFields,
  type ApplicationField,
  type ApplicationType,
} from "@/config/application-types";

type Answers = Record<string, string>;
type Draft = { type: ApplicationType | null; step: number; answers: Answers };

export function ApplyWizard({ initialType, applicationsEnabled, disabledType, enabledTypes }: {
  initialType: ApplicationType | null;
  applicationsEnabled: boolean;
  disabledType: boolean;
  enabledTypes?: ApplicationType[];
}) {
  const [type, setType] = useState<ApplicationType | null>(initialType);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [restoreEnabled, setRestoreEnabled] = useState(false);

  useEffect(() => {
    const onDraftError = () => setDraftMessage("This browser could not save a local draft. Continue to submit when ready.");
    window.addEventListener("rova-draft-storage-error", onDraftError);
    return () => window.removeEventListener("rova-draft-storage-error", onDraftError);
  }, []);

  useEffect(() => {
    if (!restoreEnabled) return;
    try {
      localStorage.setItem("rova-application-draft", JSON.stringify({ type, step, answers } satisfies Draft));
    } catch {
      window.dispatchEvent(new Event("rova-draft-storage-error"));
    }
  }, [answers, restoreEnabled, step, type]);

  function resumeDraft() {
    try {
      const saved = localStorage.getItem("rova-application-draft");
      if (!saved) {
        setDraftMessage("No saved draft was found on this device.");
        return;
      }
      const draft = JSON.parse(saved) as Partial<Draft>;
      if (typeof draft.answers !== "object" || draft.answers === null) throw new Error("Invalid draft");
      setType(isApplicationType(draft.type) ? draft.type : null);
      setStep(Number.isInteger(draft.step) ? Math.min(Math.max(draft.step ?? 0, 0), 3) : 0);
      setAnswers(draft.answers);
      setRestoreEnabled(true);
      setDraftMessage("Your locally saved draft is ready to continue.");
    } catch {
      setDraftMessage("The saved draft could not be opened.");
    }
  }

  function updateAnswer(name: string, value: string) {
    setRestoreEnabled(true);
    setAnswers((current) => ({ ...current, [name]: value }));
  }

  function stepError() {
    if (step === 0 && !type) return "Choose how you would like to join ROVA.";
    if (step === 1) {
      const missing = sharedApplicationFields.find((field) => field.required && !answers[field.name]?.trim());
      if (missing) return `Please enter your ${missing.label.toLocaleLowerCase("en")}.`;
      if (!normalizePhoneForCheck(answers.phone ?? "")) return "Enter a valid Ghana phone number (+233 or local 0-prefixed format).";
      if (answers.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.email)) return "Enter a valid email address or leave it blank.";
      if (answers.whatsapp && !normalizePhoneForCheck(answers.whatsapp)) return "Enter a valid Ghana WhatsApp number or leave it blank.";
    }
    if (step === 2 && type) {
      const missing = applicationFields[type].find((field) => field.required && !answers[field.name]?.trim());
      if (missing) return `Please complete “${missing.label}”.`;
    }
    if (step === 3 && !consent) return "Please read and accept the application consent to continue.";
    return "";
  }

  function nextStep() {
    const problem = stepError();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setRestoreEnabled(true);
    setStep((current) => Math.min(current + 1, 3));
  }

  async function submitApplication() {
    const problem = stepError();
    if (problem || !type) {
      setError(problem || "Choose an application type.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          firstName: answers.firstName,
          lastName: answers.lastName,
          phone: answers.phone,
          whatsapp: answers.whatsapp ?? "",
          email: answers.email ?? "",
          city: answers.city,
          area: answers.area ?? "",
          consent,
          data: Object.fromEntries(
            [...applicationFields[type].map((field) => field.name), "availability", "preferredArea"]
              .filter((name) => answers[name] !== undefined)
              .map((name) => [name, answers[name]]),
          ),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We couldn’t submit your application.");
      setReference(result.application.reference);
      try { localStorage.removeItem("rova-application-draft"); } catch { /* local draft is optional */ }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t submit your application.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleTypes = applicationTypeOptions.filter((item) => !enabledTypes || enabledTypes.includes(item.type));
  const option = applicationTypeOptions.find((item) => item.type === type);
  if (!applicationsEnabled || disabledType) {
    return <main className="apply-page"><ApplyHeader /><section className="application-success"><div className="section-kicker">ROVA GHANA · PRE-LAUNCH</div><h1>Applications for this opportunity are currently paused.</h1><p>We’re preparing the ROVA network and will share updates as opportunities open.</p><Link className="apply-primary" href="/">Return to ROVA <span>↗</span></Link></section><ApplyFooter /></main>;
  }
  if (reference) {
    return <main className="apply-page"><ApplyHeader /><section className="application-success"><span className="success-icon">✓</span><div className="section-kicker">APPLICATION RECEIVED</div><h1>Welcome to the<br /><em>ROVA journey.</em></h1><p>Thank you for your interest in joining ROVA Ghana. Your details have been received as we prepare our initial network. The team will review your application; submission does not guarantee approval.</p><div className="reference-card"><small>YOUR APPLICATION REFERENCE</small><strong>{reference}</strong><button onClick={() => void navigator.clipboard?.writeText(reference)}>Copy reference</button></div><div className="success-actions"><Link className="apply-primary" href="/">Return home <span>↗</span></Link><Link href="/application-status">Check application status</Link></div></section><ApplyFooter /></main>;
  }

  return <main className="apply-page">
    <ApplyHeader />
    <section className="apply-intro"><div className="section-kicker">ROVA GHANA · PRE-LAUNCH APPLICATIONS</div><h1>Join the <em>ROVA</em><br />network.</h1><p>Tell us how you’d like to be part of what we’re building. Applications are an expression of interest, not a guarantee of work, approval or vehicle access.</p></section>
    <section className="apply-shell">
      <div className="wizard-heading"><div><span className="section-kicker">YOUR APPLICATION</span><h2>{step === 0 ? "How would you like to join ROVA?" : step === 1 ? "A little about you." : step === 2 ? `Your ${option?.label.toLocaleLowerCase("en") ?? "application"}.` : "A final step."}</h2><p>{step === 0 ? "Choose the opportunity that feels right." : step === 1 ? "We’ll use these details to contact you about your interest." : step === 2 ? "A few details help our team understand what you’re looking for." : "Review the privacy note and submit your interest."}</p></div><button className="resume-draft" onClick={resumeDraft}>Resume a saved draft</button></div>
      <div className="wizard-progress" aria-label={`Step ${step + 1} of 4`}>{["Interest", "About you", "Details", "Consent"].map((item, index)=><div className={index === step ? "active" : index < step ? "done" : ""} key={item}><span>{index < step ? "✓" : `0${index+1}`}</span><small>{item}</small></div>)}</div>
      <div className="wizard-body">
        {step === 0 && (visibleTypes.length ? <div className="application-type-grid">{visibleTypes.map((item, index)=><button type="button" className={type === item.type ? "type-card selected" : "type-card"} key={item.type} onClick={() => { setType(item.type); setRestoreEnabled(true); }}><span className="type-card-icon">{["↗","⌑","⇢","◉","◌","▤","◇","✳"][applicationTypeOptions.findIndex((option) => option.type === item.type)]}</span><span className="type-card-number">0{index+1}</span><strong>{item.label}</strong><small>{item.description}</small><i>{type === item.type ? "✓" : "＋"}</i></button>)}</div> : <div className="apply-closed">Applications are temporarily paused. Please check back for updates.</div>)}
        {step === 1 && <div className="application-fields">{sharedApplicationFields.map((field) => <Field key={field.name} field={field} value={answers[field.name] ?? ""} onChange={updateAnswer} />)}</div>}
        {step === 2 && type && <div className="application-fields">{applicationFields[type].map((field) => <Field key={field.name} field={field} value={answers[field.name] ?? ""} onChange={updateAnswer} />)}</div>}
        {step === 3 && <div className="application-review"><div className="review-type"><span>YOUR INTEREST</span><b>{option?.label}</b><button onClick={() => setStep(0)}>Change</button></div><div className="review-summary"><div><span>Applicant</span><b>{answers.firstName} {answers.lastName}</b></div><div><span>Contact</span><b>{answers.phone}{answers.email ? ` · ${answers.email}` : ""}</b></div><div><span>City</span><b>{answers.city}</b></div></div><label className="application-consent"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setRestoreEnabled(true); }} /><span>I agree that ROVA Ghana may use the information I provide to review this pre-launch application and contact me about relevant opportunities. I understand this is not a service booking and does not guarantee approval, employment or vehicle access. I have read the <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span></label></div>}
      </div>
      {error && <p className="apply-error" role="alert">{error}</p>}
      {draftMessage && <p className="draft-message" role="status">{draftMessage}</p>}
      <div className="wizard-actions"><div>{step > 0 && <button className="wizard-back" onClick={() => { setStep((current) => current - 1); setRestoreEnabled(true); }}>← Previous step</button>}<Link href="/">← Back to ROVA</Link><span>Drafts stay in this browser until you submit.</span></div>{step < 3 ? <button className="apply-primary" onClick={nextStep}>Continue <span>→</span></button> : <button className="apply-primary" onClick={() => void submitApplication()} disabled={submitting || !consent}>{submitting ? "Submitting…" : "Submit application"} <span>↗</span></button>}</div>
    </section>
    <p className="apply-availability-note">ROVA is preparing for launch. Services are not currently available to book. Mention of vehicle access is subject to qualification, availability and partner approval.</p>
    <ApplyFooter />
  </main>;
}

function Field({ field, value, onChange }: { field: ApplicationField; value: string; onChange: (name: string, value: string) => void }) {
  const controlId = `application-${field.name}`;
  const props = { id: controlId, name: field.name, value, required: Boolean(field.required), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(field.name, event.target.value) };
  return <label className={`application-field ${field.kind === "textarea" ? "field-wide" : ""}`} htmlFor={controlId}><span>{field.label}{field.required && <i> *</i>}</span>{field.kind === "select" ? <select {...props}><option value="">Select an option</option>{field.options?.map((item)=><option key={item}>{item}</option>)}</select> : field.kind === "textarea" ? <textarea {...props} rows={3} maxLength={1000} /> : <input {...props} type={field.kind} min={field.kind === "number" ? 0 : undefined} max={field.kind === "number" ? 80 : undefined} autoComplete={field.name === "phone" || field.name === "whatsapp" ? "tel" : field.kind === "email" ? "email" : undefined} />}{field.hint && <small>{field.hint}</small>}</label>;
}

function ApplyHeader() {
  return <header className="apply-header"><Link className="apply-brand" href="/">ROVA<span>.</span></Link><span>GHANA · PRE-LAUNCH</span><Link href="/application-status">Check your status</Link></header>;
}

function ApplyFooter() {
  return <footer className="apply-footer"><span>© ROVA Ghana. All rights reserved.</span><Link href="/privacy">Privacy notice</Link><span>Move. Deliver. Earn. With ROVA.</span></footer>;
}

function normalizePhoneForCheck(value: string) {
  const digits = value.replace(/\D/g, "");
  return (digits.startsWith("233") && digits.length === 12) || (digits.startsWith("0") && digits.length === 10);
}
