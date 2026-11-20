"use client";

import { useEffect, useState } from "react";
import type { HeritageArtwork } from "@/config/heritage-rotation";

type Settings = { intervalMinutes: number; disabledIds: string[]; artworks: HeritageArtwork[] };

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
      const response = await fetch("/api/admin/heritage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ intervalMinutes: settings.intervalMinutes, disabledIds: settings.disabledIds }) });
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
    {settings && <form onSubmit={save}><label>Rotation interval (minutes) <input type="number" min="1" max="10080" required value={settings.intervalMinutes} onChange={(event) => setSettings({ ...settings, intervalMinutes: Number(event.target.value) })} /></label>
      <fieldset><legend>Enabled artwork</legend>{settings.artworks.map((art) => <label key={art.id}><input type="checkbox" checked={!settings.disabledIds.includes(art.id)} onChange={(event) => setSettings({ ...settings, disabledIds: event.target.checked ? settings.disabledIds.filter((id) => id !== art.id) : [...settings.disabledIds, art.id] })} /> {art.name}</label>)}</fieldset>
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save heritage settings"}</button></form>}
  </section>;
}
