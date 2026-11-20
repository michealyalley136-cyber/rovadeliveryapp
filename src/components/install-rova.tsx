"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallRova() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }
    function onInstalled() { setPrompt(null); setError(""); }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setPrompt(null);
    setError("");
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setError("Installation could not be started. Use your browser's install menu to try again.");
    }
  }

  if ((pathname !== "/apply" && pathname !== "/application-status") || (!prompt && !error)) return null;
  return <div className="install-rova">
    {prompt && <button type="button" onClick={() => void install()}>Install ROVA</button>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
