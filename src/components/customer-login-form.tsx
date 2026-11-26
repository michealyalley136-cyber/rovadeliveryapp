"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/app/login/login.module.css";

export function CustomerLoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/customer/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to sign in.");
      router.replace("/customer");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <label htmlFor="login-identity">Phone number or email</label>
    <input
      id="login-identity"
      type="text"
      autoComplete="username"
      placeholder="Phone number or email"
      minLength={5}
      maxLength={254}
      required
      value={identifier}
      onChange={(event) => setIdentifier(event.target.value)}
    />
    <label htmlFor="login-password">Password</label>
    <input
      id="login-password"
      type="password"
      autoComplete="current-password"
      placeholder="Password"
      minLength={1}
      maxLength={128}
      required
      value={password}
      onChange={(event) => setPassword(event.target.value)}
    />
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}
