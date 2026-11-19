type WindowEntry = { count: number; resetAt: number };
const globalLimiter = globalThis as typeof globalThis & { rovaRateLimit?: Map<string, WindowEntry> };
const entries = globalLimiter.rovaRateLimit ??= new Map<string, WindowEntry>();

export function checkRateLimit(request: Request, action: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const address = request.headers.get("x-real-ip") ?? forwarded ?? "unknown";
  const key = `${action}:${address}`;
  const now = Date.now();
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
