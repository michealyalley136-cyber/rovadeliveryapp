const baseUrl = process.env.IDENTITY_NOTIFICATION_WORKER_URL;
const secret = process.env.IDENTITY_NOTIFICATION_WORKER_SECRET;

if (!baseUrl || !secret) {
  console.error("Identity notification worker URL and secret must be configured.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(
      new URL("/api/internal/identity-notifications/process", baseUrl),
      {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      console.error(`Identity notification processing failed with status ${response.status}.`);
      process.exitCode = 1;
    } else {
      const result = await response.json();
      console.log(JSON.stringify({ processed: result.processed }));
    }
  } catch {
    console.error("Identity notification processing request failed.");
    process.exitCode = 1;
  }
}
