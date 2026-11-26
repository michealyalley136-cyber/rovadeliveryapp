#!/usr/bin/env node

import { runRestore } from "./lib.mjs";

try {
  await runRestore({ testPrefix: process.env.BACKUP_TEST_PREFIX });
} catch (error) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      component: "rova-postgres-backup",
      event: "restore_fatal",
      error: error instanceof Error ? error.message : "unknown error",
    }),
  );
  process.exitCode = 1;
}
