import { MapProviderError } from "./errors";

export async function fetchMapProvider(url: URL, signal?: AbortSignal, timeoutMs = 8000) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const linked = () => timeout.abort();
  signal?.addEventListener("abort", linked, { once: true });
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: timeout.signal,
    });
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 502;
      throw new MapProviderError(`The map provider rejected the request (${response.status}).`, status);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", linked);
  }
}
