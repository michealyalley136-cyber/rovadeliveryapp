"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "@/app/login/login.module.css";

type Props =
  | { mode: "activate" | "reset"; token: string }
  | { mode: "request-reset"; token?: never };

export function CustomerSecurityForm(props: Props) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (props.mode !== "request-reset" && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(props.mode === "request-reset"
        ? "/api/customer/password-reset"
        : props.mode === "activate"
          ? "/api/customer/activation"
          : "/api/customer/password-reset", {
        method: props.mode === "reset" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(props.mode === "request-reset"
          ? { identifier }
          : { token: props.token, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The secure account request could not be completed.");
      setMessage(result.message ?? (props.mode === "activate"
        ? "Your customer account is active."
        : "Your password was updated."));
      setPassword("");
      setConfirmPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The secure account request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (message) return <div className={styles.success} role="status">
    <h2>Request complete</h2>
    <p>{message}</p>
    {props.mode === "request-reset"
      ? <Link href="/login">Return to customer sign-in</Link>
      : <Link href="/customer">Open customer dashboard</Link>}
  </div>;

  return <form className={styles.form} onSubmit={submit}>
    {props.mode === "request-reset" ? <>
      <label htmlFor="reset-identity">Phone number or email</label>
      <input
        id="reset-identity"
        type="text"
        autoComplete="username"
        minLength={5}
        maxLength={254}
        required
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
      />
    </> : <>
      <label htmlFor="customer-password">Password</label>
      <input
        id="customer-password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <label htmlFor="customer-password-confirm">Confirm password</label>
      <input
        id="customer-password-confirm"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
      <p className={styles.passwordHint}>Use at least 12 characters with uppercase, lowercase and a number.</p>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button type="submit" disabled={busy}>
      {busy
        ? "Securing account…"
        : props.mode === "request-reset"
          ? "Send reset link"
          : props.mode === "activate"
            ? "Activate customer account"
            : "Set new password"}
    </button>
  </form>;
}
