"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignIn } from "@/components/sign-in";

const steps = [
  { title: "Account", detail: "Confirm your application profile." },
  { title: "Identity", detail: "Prepare an approved identity document." },
  { title: "Licence", detail: "Confirm you hold a current licence." },
  { title: "Vehicle", detail: "Tell us how you plan to access a vehicle." },
  { title: "Documents", detail: "Documents are verified before activation." },
  { title: "Training", detail: "Complete required operator training." },
  { title: "Agreements", detail: "Review and acknowledge operator terms." },
  { title: "Review", detail: "Submit for an operations review." },
];

export function Onboarding({ signedIn }: { signedIn: boolean }) {
  const [step, setStep] = useState(0);
  const [needsVehicle, setNeedsVehicle] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  if (!signedIn) return <main className="signin-page"><Link href="/" className="wordmark">ROVA<span>.</span></Link><SignIn role="OPERATOR" /><Link className="back-home" href="/driver">← Back to driver app</Link></main>;

  async function submitApplication() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/operator/application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalNameConfirmed: true,
          identityDocumentAvailable: true,
          licenceAvailable: true,
          vehiclePlan: needsVehicle ? "NEED_VEHICLE" : "OWN_VEHICLE",
          trainingAcknowledged: true,
          agreementsAcknowledged: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to submit your application.");
      setSubmitted(true);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit your application.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="onboarding-page">
    <header className="onboarding-header"><Link className="wordmark" href="/">ROVA<span>.</span></Link><Link href="/driver">← Driver workspace</Link></header>
    <div className="onboarding-wrap">
      <div className="eyebrow dark-eyebrow">ROVA OPERATOR NETWORK</div><h1>Start your journey<br />with <span>ROVA.</span></h1>
      <p className="onboarding-intro">Every operator is reviewed and verified before activation. No document, no activation.</p>
      <div className="onboarding-stepper" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((item, index) => <div key={item.title} className={`step-node ${index === step ? "current" : index < step ? "done" : ""}`}><span>{index < step ? "✓" : `0${index + 1}`}</span><small>{item.title}</small></div>)}
      </div>
      <section className="onboarding-card">
        {submitted ? <div className="application-success"><span>✓</span><div className="eyebrow dark-eyebrow">APPLICATION SUBMITTED</div><h2>Thanks for taking<br />the first step.</h2><p>Your application is now in the review queue. Submission does not guarantee approval, vehicle access, or activation.</p><Link className="button button-dark" href="/driver">Return to driver app <span>→</span></Link></div> : <>
          <div className="onboarding-card-heading"><div><span className="eyebrow dark-eyebrow">STEP {String(step + 1).padStart(2, "0")} / 08</span><h2>{steps[step].title}</h2><p>{steps[step].detail}</p></div><span className="step-count">0{step + 1} <i>/ 08</i></span></div>
          <div className="onboarding-form">
            {step === 0 && <><div className="onboarding-info"><span>01</span><div><b>Demo operator profile</b><p>This fictional pilot account represents Kojo Asare. In production, identity, contact, address and emergency-contact details must be collected securely and verified.</p></div></div><Confirm checked={acknowledged} onChange={setAcknowledged}>I confirm this profile represents my operator application.</Confirm></>}
            {step === 1 && <><div className="onboarding-info"><span>02</span><div><b>Identity verification</b><p>Have an approved identity document ready. Do not enter Ghana Card numbers in this demo.</p></div></div><Confirm checked={acknowledged} onChange={setAcknowledged}>I can provide an approved identity document for review.</Confirm></>}
            {step === 2 && <><div className="onboarding-info"><span>03</span><div><b>Licence verification</b><p>Current licence type, number and expiry will be securely collected for review in a production onboarding flow.</p></div></div><Confirm checked={acknowledged} onChange={setAcknowledged}>I can provide a current licence for verification.</Confirm></>}
            {step === 3 && <div className="vehicle-choice"><button className={!needsVehicle ? "chosen" : ""} onClick={() => setNeedsVehicle(false)}><b>I own my vehicle</b><small>Use a vehicle I own and can document.</small></button><button className={needsVehicle ? "chosen" : ""} onClick={() => setNeedsVehicle(true)}><b>I need vehicle access</b><small>Request fleet or partner options. Approval is not guaranteed.</small></button></div>}
            {step === 4 && <><div className="onboarding-info"><span>04</span><div><b>Required documents</b><p>Identity, licence, registration and insurance are reviewed before an operator can go online. This demo does not accept or store uploads.</p></div></div><Confirm checked={acknowledged} onChange={setAcknowledged}>I understand documents must be approved before activation.</Confirm></>}
            {step === 5 && <><div className="onboarding-info"><span>05</span><div><b>Training required</b><p>Safety and service training must be completed and approved before activation.</p></div></div><Confirm checked={acknowledged} onChange={setAcknowledged}>I understand required training must be completed.</Confirm></>}
            {step === 6 && <Confirm checked={acknowledged} onChange={setAcknowledged}>I understand ROVA will verify my documents, training and agreements before I can be activated.</Confirm>}
            {step === 7 && <div className="review-summary"><div><span>Profile</span><b>Kojo Asare · ROVA demo account</b></div><div><span>Vehicle plan</span><b>{needsVehicle ? "Request vehicle access" : "I own a vehicle"}</b></div><div><span>Application state</span><b className="status-text">Submitted for review</b></div><p>Operations review is required. Submission does not guarantee approval.</p></div>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="onboarding-actions"><button className="back-step" onClick={() => { setStep(Math.max(0, step - 1)); setAcknowledged(false); }} disabled={step === 0}>← Back</button>{step < 7 ? <button className="button button-dark" onClick={() => { setStep(Math.min(7, step + 1)); setAcknowledged(false); }} disabled={[0, 1, 2, 4, 5, 6].includes(step) && !acknowledged}>Continue <span>→</span></button> : <button className="button button-dark" onClick={() => void submitApplication()} disabled={busy}>{busy ? "Submitting…" : "Submit for review"}<span>→</span></button>}</div>
          <p className="onboarding-privacy">Your sensitive identity documents are not collected in this demo.</p>
        </>}
      </section>
    </div>
  </main>;
}

function Confirm({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: string }) {
  return <label className="acknowledgement"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{children}</span></label>;
}
