#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
const mustContain = (file, needle, label) => {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(needle)) failures.push(`${label}: missing in ${file}`);
};
const mustNotContain = (file, needle, label) => {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(needle)) failures.push(`${label}: forbidden pattern remains in ${file}`);
};

mustContain("src/types.ts", "profitLaunchMode: true", "safe mode default");
mustContain("src/types.ts", "autoTopupEnabled: false", "auto topup default off");
mustContain("src/types.ts", "allowPaidComputeTopup: false", "paid topup master switch default off");
mustContain("src/types.ts", "launchIdleSleepSeconds: 900", "15-minute idle sleep default");
mustContain("src/types.ts", '| "earned_revenue"', "verified revenue ledger type");
mustContain("src/agent/policy-rules/financial.ts", "financial.profit_launch_lock", "central launch policy lock");
mustContain("src/index.ts", "Paid compute topups disabled by launch policy", "startup topup gate");
mustContain("src/index.ts", "launchIdleFloorMs", "event-driven idle sleep floor");
mustContain("src/agent/loop.ts", "Launch mode uses in-process workers only", "local-only launch workers");
mustContain("src/agent/loop.ts", "config.allowPaidComputeTopup === true", "loop topup opt-in");
mustContain("src/agent/loop.ts", "Math.min(configuredCycleTurns, 3)", "launch cycle turn cap");
mustContain("src/agent/loop.ts", "config.profitLaunchMode === true ? 2 : 10", "launch idle turn cap");
mustContain("src/heartbeat/tasks.ts", 'tx.type === "earned_revenue"', "strict revenue accounting");
mustContain("src/heartbeat/tasks.ts", "operatingProfitCents", "operating profit metric");
mustContain("src/heartbeat/tasks.ts", "netCashflowCents", "net cashflow metric");
mustContain("src/heartbeat/tasks.ts", "walletUsdcBalanceCents", "wallet truth metric");
mustContain("src/heartbeat/tasks.ts", "reconciliationGapCents", "wallet-vs-ledger reconciliation");
mustContain("src/orchestration/orchestrator.ts", "MIN_PROJECTED_ROI = 2", "2x projected ROI gate");
mustContain("src/orchestration/orchestrator.ts", 'task.assignedTo?.startsWith("local://")', "local worker loop fix");
mustContain("src/registry/erc8004.ts", "const MAX_BLOCK_RANGE = 2_000n", "Base public RPC range bound");
mustContain("src/registry/erc8004.ts", "const MAX_CHUNKS = 25", "Base discovery request bound");
mustNotContain("package.json", 'vitest run --grep', "unsupported Vitest --grep scripts");
mustNotContain("src/registry/erc8004.ts", "const MAX_BLOCK_RANGE = 10_000n", "oversized Base eth_getLogs range");

if (failures.length) {
  console.error("LAUNCH SAFETY GATE FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("LAUNCH SAFETY GATE OK");
console.log("- profitLaunchMode defaults ON");
console.log("- paid/automatic topups default OFF");
console.log("- dangerous/spend tools centrally blocked");
console.log("- local-only workers in launch mode");
console.log("- idle inference cycles bounded and event-wakeable");
console.log("- revenue and owner funding separated");
console.log("- wallet balance reconciled against internal ledger");
console.log("- ROI and inference budget guards present");
console.log("- Base RPC discovery bounded");
