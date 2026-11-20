"use client";

import { useEffect, useState } from "react";
import { rotationIntervals, type HeritageArtwork } from "@/config/heritage-rotation";

type Settings = { intervalSeconds: number; disabledIds: string[]; artworks: HeritageArtwork[] };
const intervalLabels: Record<number, string> = { 15: "15 seconds", 30: "30 seconds", 60: "60 seconds", 120: "2 minutes", 300: "5 minutes", 900: "15 minutes", 1800: "30 minutes", 3600: "1 hour", 10800: "3 hours" };

export function HeritageAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/admin/heritage", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load heritage settings.");
        if (active) setSettings(result);
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "Could not load heritage settings."); }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/heritage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ intervalSeconds: settings.intervalSeconds, disabledIds: settings.disabledIds }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save heritage settings.");
      setMessage("Heritage settings saved. Active dashboards update within about a minute.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save heritage settings."); }
    finally { setBusy(false); }
  }
  return <section id="heritage" className="heritage-admin">
    <h2>Heritage banner</h2><p>AI-generated artistic interpretations. Rotation uses fixed UTC time windows.</p>
    {!settings && !message && <p>Loading settings…</p>}
    {message && <p role="status">{message}</p>}
    {settings && <form onSubmit={save}><label>Rotation interval <select value={settings.intervalSeconds} onChange={(event) => setSettings({ ...settings, intervalSeconds: Number(event.target.value) })}>
      {!(rotationIntervals as readonly number[]).includes(settings.intervalSeconds) && <option value={settings.intervalSeconds}>Existing interval: {settings.intervalSeconds} seconds</option>}
      {rotationIntervals.map((seconds) => <option key={seconds} value={seconds}>{intervalLabels[seconds]}</option>)}
    </select></label>
      <fieldset><legend>Enabled artwork</legend>{settings.artworks.map((art) => <label key={art.id}><input type="checkbox" checked={!settings.disabledIds.includes(art.id)} onChange={(event) => setSettings({ ...settings, disabledIds: event.target.checked ? settings.disabledIds.filter((id) => id !== art.id) : [...settings.disabledIds, art.id] })} /> {art.name}</label>)}</fieldset>
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save heritage settings"}</button></form>}
  </section>;
}
