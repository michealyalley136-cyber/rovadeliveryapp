#!/usr/bin/env node

import { runBackup, validateStagingConfiguration } from "./lib.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(JSON.stringify({ component: "rova-postgres-backup", event: "idle_no_backup" }));
  } else if (args.length === 1 && args[0] === "--verify") {
    validateStagingConfiguration();
    console.log(JSON.stringify({ component: "rova-postgres-backup", event: "configuration_valid" }));
  } else if (args.length === 1 && args[0] === "--execute-staging") {
    await runBackup();
  } else {
    throw new Error("Use --verify or --execute-staging");
  }
} catch (error) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      component: "rova-postgres-backup",
      event: "fatal",
      error: error instanceof Error ? error.message : "unknown error",
    }),
  );
  process.exitCode = 1;
}
