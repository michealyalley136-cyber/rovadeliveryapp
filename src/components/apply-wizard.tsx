"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  applicationFields,
  applicationTypeOptions,
  isApplicationType,
  sharedApplicationFields,
  type ApplicationField,
  type ApplicationType,
} from "@/config/application-types";

type Answers = Record<string, string>;
type Draft = { version: 2; type: ApplicationType | null; step: number; answers: Answers };

const steps = ["Opportunity", "About You", "Location & Experience", "Vehicle / Business Details", "Goals & Availability", "Review & Submit"];
const experienceNames = new Set(["region", "currentlyRides", "experienceYears", "licenceStatus"]);
const goalNames = new Set(["availability", "preferredArea", "workInterests", "serviceInterest", "accessInterest", "vehicleAccess", "vehicleAccessInterest", "depositReadiness", "partnershipInterest", "rovaDeliveryInterest"]);
const icons = ["↗", "⌑", "⇢", "◉", "◌", "▤", "◇", "✳"];

function fieldsForStep(type: ApplicationType | null, step: number): ApplicationField[] {
  if (step === 1) return sharedApplicationFields.filter((field) => field.name !== "city" && field.name !== "area");
  if (!type) return [];
  const fields = applicationFields[type];
  if (step === 2) return [...sharedApplicationFields.filter((field) => field.name === "city" || field.name === "area"), ...fields.filter((field) => experienceNames.has(field.name))];
  if (step === 3) return fields.filter((field) => !experienceNames.has(field.name) && !goalNames.has(field.name));
  if (step === 4) return fields.filter((field) => goalNames.has(field.name));
  return [];
}

function normalizePhoneForCheck(value: string) {
  const digits = value.replace(/\D/g, "");
  return (digits.startsWith("233") && digits.length === 12) || (digits.startsWith("0") && digits.length === 10);
}

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
  const [errors, setErrors] = useState<Answers>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reference, setReference] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [saveDraft, setSaveDraft] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const visibleTypes = applicationTypeOptions.filter((item) => !enabledTypes || enabledTypes.includes(item.type));
  const option = applicationTypeOptions.find((item) => item.type === type);

  useEffect(() => {
    const onDraftError = () => setDraftMessage("This browser could not save a local draft. Continue to submit when ready.");
    window.addEventListener("rova-draft-storage-error", onDraftError);
    return () => window.removeEventListener("rova-draft-storage-error", onDraftError);
  }, []);

  useEffect(() => {
    if (!saveDraft || submitted) return;
    try {
      localStorage.setItem("rova-application-draft", JSON.stringify({ version: 2, type, step, answers } satisfies Draft));
    } catch {
      window.dispatchEvent(new Event("rova-draft-storage-error"));
    }
  }, [answers, saveDraft, step, submitted, type]);

  useEffect(() => {
    if (previousStep.current !== step) {
      headingRef.current?.focus();
      previousStep.current = step;
    }
  }, [step]);

  function resumeDraft() {
    try {
      const saved = localStorage.getItem("rova-application-draft");
      if (!saved) {
        setDraftMessage("No saved draft was found on this device.");
        return;
      }
      const draft: unknown = JSON.parse(saved);
      if (!draft || typeof draft !== "object" || !("answers" in draft) || !draft.answers || typeof draft.answers !== "object" || Array.isArray(draft.answers)) throw new Error("Invalid draft");
      const savedAnswers = Object.fromEntries(Object.entries(draft.answers).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      const savedType = "type" in draft && isApplicationType(typeof draft.type === "string" ? draft.type : null) ? draft.type as ApplicationType : null;
      if (savedType && enabledTypes && !enabledTypes.includes(savedType)) {
        setDraftMessage("The opportunity in this draft is currently paused.");
        return;
      }
      const oldStep = "step" in draft && typeof draft.step === "number" && Number.isInteger(draft.step) ? draft.step : 0;
      const savedStep = "version" in draft && draft.version === 2 ? oldStep : [0, 1, 3, 5][Math.min(Math.max(oldStep, 0), 3)];
      setType(savedType);
      setStep(savedType ? Math.min(Math.max(savedStep, 0), 5) : 0);
      setAnswers(savedAnswers);
      setConsent(false);
      setErrors({});
      setError("");
      setSaveDraft(true);
      setDraftMessage("Your locally saved draft is ready to continue.");
    } catch {
      setDraftMessage("The saved draft could not be opened.");
    }
  }

  function updateAnswer(name: string, value: string) {
    setSaveDraft(true);
    setAnswers((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function validateStep(currentStep: number) {
    const nextErrors: Answers = {};
    for (const field of fieldsForStep(type, currentStep)) {
      const value = answers[field.name]?.trim() ?? "";
      if (field.required && !value) nextErrors[field.name] = "This field is required.";
      else if (value && field.kind === "select" && !field.options?.includes(value)) nextErrors[field.name] = "Choose one of the listed options.";
      else if (value && (field.name === "phone" || field.name === "whatsapp") && !normalizePhoneForCheck(value)) nextErrors[field.name] = "Enter a valid Ghana number, for example 024 123 4567.";
      else if (value && field.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) nextErrors[field.name] = "Enter a valid email address.";
    }
    return nextErrors;
  }

  function nextStep() {
    if (step === 0 && !type) {
      setError("Choose how you would like to join ROVA.");
      return;
    }
    const nextErrors = validateStep(step);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Please check the highlighted fields before continuing.");
      return;
    }
    setError("");
    setSaveDraft(true);
    setStep((current) => Math.min(current + 1, 5));
  }

  async function submitApplication() {
    if (!type || (enabledTypes && !enabledTypes.includes(type))) {
      setStep(0);
      setError("Choose an available opportunity.");
      return;
    }
    for (let index = 1; index <= 4; index++) {
      const nextErrors = validateStep(index);
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors);
        setStep(index);
        setError("Please check the highlighted fields before submitting.");
        return;
      }
    }
    if (!consent) {
      setError("Please read and accept the application consent.");
      return;
    }
    setSubmitting(true);
    setError("");
    setDraftMessage("");
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
          data: Object.fromEntries(applicationFields[type].filter((field) => answers[field.name] !== undefined && answers[field.name] !== "").map((field) => [field.name, answers[field.name]])),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We couldn’t submit your application.");
      setReference(typeof result.application?.reference === "string" ? result.application.reference : "");
      setSubmitted(true);
      setSaveDraft(false);
      try {
        localStorage.removeItem("rova-application-draft");
      } catch {
        setDraftMessage("The application was submitted, but the local draft could not be removed from this browser.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t submit your application.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!applicationsEnabled || disabledType) {
    return <main className="apply-page"><ApplyHeader /><section className="application-success"><div className="section-kicker">ROVA GHANA · PRE-LAUNCH</div><h1>Applications for this opportunity are currently paused.</h1><p>We’re preparing the ROVA network and will share updates as opportunities open.</p><Link className="apply-primary" href="/">Return to ROVA <span>↗</span></Link></section><ApplyFooter /></main>;
  }
  if (submitted) {
    return <main className="apply-page"><ApplyHeader /><section className="application-success"><span className="success-icon" aria-hidden="true">✓</span><div className="section-kicker">ROVA GHANA · PRE-LAUNCH</div><h1>Application Received</h1><p>Thank you for your interest in joining the ROVA network. Your application has been received. Our Ghana operations team will review your information and contact you if additional information is required.</p><p>Submitting an application does not guarantee approval, employment or vehicle access.</p>{reference && <div className="reference-card"><small>APPLICATION REFERENCE</small><strong>{reference}</strong></div>}{draftMessage && <p role="status">{draftMessage}</p>}<div className="success-actions"><Link className="apply-primary" href="/application-status">Check Application Status <span>→</span></Link><Link className="wizard-back" href="/">Return to ROVA</Link></div></section><ApplyFooter /></main>;
  }

  const descriptions = [
    "Choose the opportunity that feels right for you.",
    "We’ll use these details to contact you about your interest.",
    "Tell us where you’re based and about your experience.",
    "A few details help us understand your vehicle or business.",
    "Tell us what you’re looking for and when you’re available.",
    "Check your details before sending your application.",
  ];

  return <main className="apply-page">
    <ApplyHeader />
    <section className="apply-intro">
      <div className="section-kicker">ROVA GHANA · PRE-LAUNCH APPLICATION</div>
      <h1>Join the <em>ROVA Network</em></h1>
      <p>Choose how you want to work, earn, grow, or partner with ROVA Ghana. We’ll guide you through the application step by step.</p>
      <ul className="apply-trust"><li>Secure application</li><li>Simple process</li><li>Ghana-focused support</li></ul>
    </section>
    <section className="apply-shell" aria-labelledby="wizard-title">
      <div className="wizard-heading"><div><span className="section-kicker">STEP {step + 1} OF {steps.length}</span><h2 id="wizard-title" ref={headingRef} tabIndex={-1}>{step === 0 ? "How would you like to join ROVA?" : steps[step]}</h2><p>{descriptions[step]}</p></div><button type="button" className="resume-draft" onClick={resumeDraft}>Resume a saved draft</button></div>
      <div className="wizard-progress-wrap">
        <div className="wizard-progress-bar" role="progressbar" aria-label="Application progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
        <ol className="wizard-step-labels">{["Opportunity", "About You", "Experience", "Details", "Goals", "Review"].map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index === step ? "active" : index < step ? "done" : ""}>{label}</li>)}</ol>
      </div>
      <div className="wizard-body">
        {step === 0 && (visibleTypes.length ? <div className="application-type-grid" role="group" aria-label="Application opportunities">{visibleTypes.map((item, index) => <button type="button" aria-pressed={type === item.type} className={type === item.type ? "type-card selected" : "type-card"} key={item.type} onClick={() => {
          if (type !== item.type) {
            setAnswers((current) => Object.fromEntries(sharedApplicationFields.map((field) => [field.name, current[field.name] ?? ""])));
            setConsent(false);
          }
          setType(item.type); setSaveDraft(true); setError(""); setErrors({});
        }}><span className="type-card-icon" aria-hidden="true">{icons[applicationTypeOptions.findIndex((entry) => entry.type === item.type)]}</span><span className="type-card-number">0{index + 1}</span><strong>{item.label}</strong><small>{item.description}</small><i aria-hidden="true">{type === item.type ? "✓" : "＋"}</i></button>)}</div> : <div className="apply-closed">Applications are temporarily paused. Please check back for updates.</div>)}
        {step > 0 && step < 5 && <>
          {type === "VEHICLE_ACCESS" && step === 3 && <p className="application-note">ROVA plans to work with vehicle, financing, and fleet partners to expand access to work-ready vehicles. Availability and approval depend on partner requirements.</p>}
          <div className="application-fields">{fieldsForStep(type, step).map((field) => <Field key={field.name} field={field} value={answers[field.name] ?? ""} error={errors[field.name]} onChange={updateAnswer} />)}</div>
          {fieldsForStep(type, step).length === 0 && <p className="application-note">No additional questions are needed for this opportunity. Continue to review your application.</p>}
        </>}
        {step === 5 && <div className="application-review">
          <div className="review-section"><div className="review-section-heading"><h3>Opportunity</h3><button type="button" onClick={() => setStep(0)}>Edit</button></div><p>{option?.label}</p></div>
          {[1, 2, 3, 4].map((index) => <div className="review-section" key={index}><div className="review-section-heading"><h3>{steps[index]}</h3><button type="button" onClick={() => setStep(index)}>Edit</button></div><dl className="review-summary">{fieldsForStep(type, index).filter((field) => answers[field.name]?.trim()).map((field) => <div key={field.name}><dt>{field.label}</dt><dd>{answers[field.name]}</dd></div>)}</dl></div>)}
          <label className="application-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree that ROVA Ghana may use the information I provide to review this pre-launch application and contact me about relevant opportunities. I understand this is not a service booking and does not guarantee approval, employment or vehicle access. I have read the <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span></label>
        </div>}
      </div>
      {error && <p className="apply-error" role="alert">{error}</p>}
      {draftMessage && <p className="draft-message" role="status">{draftMessage}</p>}
      <div className="wizard-actions"><div>{step > 0 ? <button type="button" className="wizard-back" onClick={() => { setStep((current) => current - 1); setError(""); setErrors({}); setSaveDraft(true); }}>← Back</button> : <Link className="wizard-back" href="/">← Back to ROVA</Link>}<span>Drafts stay in this browser until you submit.</span></div>{step < 5 ? <button type="button" className="apply-primary" onClick={nextStep}>Continue <span>→</span></button> : <button type="button" className="apply-primary" onClick={() => void submitApplication()} disabled={submitting}>{submitting ? "Submitting…" : "Submit Application"} <span>↗</span></button>}</div>
    </section>
    <p className="apply-availability-note">ROVA is preparing for launch. Services are not currently available to book. Vehicle access is subject to qualification, availability and partner approval.</p>
    <ApplyFooter />
  </main>;
}

function Field({ field, value, error, onChange }: { field: ApplicationField; value: string; error?: string; onChange: (name: string, value: string) => void }) {
  const controlId = `application-${field.name}`;
  const hint = field.name === "phone" ? "Example: 024 123 4567" : field.hint;
  const describedBy = [hint && `${controlId}-hint`, error && `${controlId}-error`].filter(Boolean).join(" ") || undefined;
  const props = { id: controlId, name: field.name, value, required: Boolean(field.required), "aria-invalid": Boolean(error), "aria-describedby": describedBy, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(field.name, event.target.value) };
  const maxLength = field.name === "firstName" || field.name === "lastName" ? 80 : field.name === "area" ? 120 : field.kind === "tel" ? 24 : field.kind === "text" ? 1000 : undefined;
  return <label className={`application-field ${field.kind === "textarea" ? "field-wide" : ""}`} htmlFor={controlId}><span>{field.label}{field.required && <i> *</i>}</span>{field.kind === "select" ? <select {...props}><option value="">Select an option</option>{field.options?.map((item) => <option key={item}>{item}</option>)}</select> : field.kind === "textarea" ? <textarea {...props} rows={3} maxLength={1000} /> : <input {...props} type={field.kind} maxLength={maxLength} autoComplete={field.name === "phone" || field.name === "whatsapp" ? "tel" : field.kind === "email" ? "email" : undefined} />}{hint && <small id={`${controlId}-hint`}>{hint}</small>}{error && <small className="field-error" id={`${controlId}-error`}>{error}</small>}</label>;
}

function ApplyHeader() {
  return <header className="apply-header"><Link className="apply-brand" href="/">ROVA<span>.</span></Link><span>GHANA · PRE-LAUNCH</span><Link href="/application-status">Check your status</Link></header>;
}

function ApplyFooter() {
  return <footer className="apply-footer"><span>© ROVA Ghana. All rights reserved.</span><Link href="/privacy">Privacy notice</Link><span>Move. Deliver. Earn. With ROVA.</span></footer>;
}
