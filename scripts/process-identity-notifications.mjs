import { runIdentityNotificationProcessor } from "./identity-notification-transport.mjs";

try {
  const result = await runIdentityNotificationProcessor();
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Identity notification processing request failed.",
  );
  process.exitCode = 1;
}
