"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallNavigator = Navigator & {
  install?: () => Promise<unknown>;
  standalone?: boolean;
};

function subscribeDisplayChange(callback: () => void) {
  const display = window.matchMedia("(display-mode: standalone)");
  display.addEventListener("change", callback);
  return () => display.removeEventListener("change", callback);
}

function platformSnapshot() {
  const browser = navigator as InstallNavigator;
  if (window.matchMedia("(display-mode: standalone)").matches || browser.standalone === true) return "standalone";
  if (/iPad|iPhone|iPod/.test(browser.userAgent) || (browser.platform === "MacIntel" && browser.maxTouchPoints > 1)) return "ios";
  return "browser";
}

export function InstallRova() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [error, setError] = useState("");
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const platform = useSyncExternalStore(subscribeDisplayChange, platformSnapshot, () => "standalone");
  const ios = platform === "ios";

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }
    function onInstalled() { setPrompt(null); setError(""); setHelp(false); setInstalled(true); }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    setError("");
    const browser = navigator as InstallNavigator;
    if (ios) { setHelp(true); return; }
    if (typeof browser.install !== "function" && !prompt) { setHelp(true); return; }
    try {
      if (typeof browser.install === "function") {
        await browser.install();
      } else if (prompt) {
        setPrompt(null);
        await prompt.prompt();
        await prompt.userChoice;
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError("Installation could not be started. Use your browser's install menu to try again.");
      setHelp(true);
    }
  }

  if (installed || platform === "standalone") return null;
  return <div className="install-rova">
    <button type="button" aria-expanded={help} aria-controls="install-rova-help" onClick={() => void install()}>Install ROVA</button>
    {help && <div id="install-rova-help" className="install-rova-help" role="region" aria-label="Install ROVA instructions">
      <strong>{ios ? "Install ROVA on your iPhone or iPad" : "Install ROVA"}</strong>
      {error && <p role="alert">{error}</p>}
      <p>{ios ? "Tap the Share button, then choose Add to Home Screen." : "Open your browser menu and look for Install app or Add to Home Screen. Availability depends on your browser."}</p>
      <button type="button" onClick={() => { setHelp(false); setError(""); }}>Close</button>
    </div>}
  </div>;
}
