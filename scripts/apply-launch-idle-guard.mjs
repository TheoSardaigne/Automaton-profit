#!/usr/bin/env node
import fs from "node:fs";

function replaceExact(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  if (!current.includes(before)) throw new Error(`[${label}] source context not found in ${file}`);
  fs.writeFileSync(file, current.replace(before, after), "utf8");
  console.log(`OK  ${label}`);
}

replaceExact(
  "src/types.ts",
`  /** Maximum permitted paid compute topup in one purchase, in USD. */
  maxPaidComputeTopupUsd?: number;
  /**
   * Optional DNS resolver override`,
`  /** Maximum permitted paid compute topup in one purchase, in USD. */
  maxPaidComputeTopupUsd?: number;
  /** Minimum idle sleep in seconds when launch mode has no active task work. */
  launchIdleSleepSeconds?: number;
  /**
   * Optional DNS resolver override`,
  "idle sleep config type",
);

replaceExact(
  "src/types.ts",
`  allowPaidComputeTopup: false,
  maxPaidComputeTopupUsd: 5,
};`,
`  allowPaidComputeTopup: false,
  maxPaidComputeTopupUsd: 5,
  launchIdleSleepSeconds: 900,
};`,
  "15-minute launch idle default",
);

replaceExact(
  "src/agent/loop.ts",
`  const MAX_IDLE_TURNS = 10; // Force sleep after N turns with no real work
  let idleTurnCount = 0;

  const maxCycleTurns = config.maxTurnsPerCycle ?? 25;`,
`  const MAX_IDLE_TURNS = config.profitLaunchMode === true ? 2 : 10;
  let idleTurnCount = 0;

  const configuredCycleTurns = config.maxTurnsPerCycle ?? 25;
  const maxCycleTurns = config.profitLaunchMode === true
    ? Math.min(configuredCycleTurns, 3)
    : configuredCycleTurns;`,
  "short launch inference cycles",
);

replaceExact(
  "src/index.ts",
`      if (state === "sleeping") {
        const sleepUntilStr = db.getKV("sleep_until");
        const sleepUntil = sleepUntilStr
          ? new Date(sleepUntilStr).getTime()
          : Date.now() + 60_000;
        const sleepMs = Math.max(sleepUntil - Date.now(), 10_000);`,
`      if (state === "sleeping") {
        const sleepUntilStr = db.getKV("sleep_until");
        const requestedSleepUntil = sleepUntilStr
          ? new Date(sleepUntilStr).getTime()
          : Date.now() + 60_000;

        let hasActiveTaskWork = false;
        try {
          const active = db.raw.prepare(
            "SELECT 1 FROM task_graph WHERE status IN ('pending', 'assigned', 'running', 'blocked') LIMIT 1",
          ).get();
          hasActiveTaskWork = Boolean(active);
        } catch {
          // Older/partial schemas: treat as no active task work and conserve compute.
        }

        const launchIdleFloorMs =
          config.profitLaunchMode === true && !hasActiveTaskWork
            ? Math.max(60, config.launchIdleSleepSeconds ?? 900) * 1000
            : 0;
        const sleepUntil = Math.max(requestedSleepUntil, Date.now() + launchIdleFloorMs);
        const sleepMs = Math.max(sleepUntil - Date.now(), 10_000);`,
  "event-driven launch idle sleep floor",
);

console.log("launch idle-cost guard applied.");
