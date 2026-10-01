#!/usr/bin/env node
import fs from "node:fs";

function replaceExact(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  if (!current.includes(before)) {
    throw new Error(`[${label}] Source context not found in ${file}. Aborting without guessing.`);
  }
  fs.writeFileSync(file, current.replace(before, after), "utf8");
  console.log(`OK  ${label}`);
}

// Add explicit paid-topup controls after profit-engine-v1 has added autoTopupEnabled.
replaceExact(
  "src/types.ts",
`  autoTopupEnabled?: boolean;
  // Phase 2 config additions`,
`  autoTopupEnabled?: boolean;
  /**
   * Master switch for any USDC -> Conway compute purchase. Default false.
   * This blocks startup bootstrap purchases and the topup_credits tool until
   * the operator explicitly opts in after a controlled health check.
   */
  allowPaidComputeTopup?: boolean;
  /** Maximum autonomous/manual Conway compute topup allowed in one purchase. */
  maxPaidComputeTopupUsd?: number;
  // Phase 2 config additions`,
  "paid topup config types",
);

replaceExact(
  "src/types.ts",
`  socialRelayUrl: "https://social.conway.tech",
  autoTopupEnabled: false,
};`,
`  socialRelayUrl: "https://social.conway.tech",
  autoTopupEnabled: false,
  allowPaidComputeTopup: false,
  maxPaidComputeTopupUsd: 5,
};`,
  "paid topup defaults",
);

// Gate the startup $5 bootstrap purchase. This closes the third topup path
// called out in upstream issues #202/#236/#278/#288/#393/#408.
replaceExact(
  "src/index.ts",
`  // Bootstrap topup: buy minimum credits ($5) from USDC so the agent can start.
  // The agent decides larger topups itself via the topup_credits tool.
  try {`,
`  // Bootstrap topup is opt-in. Community reports document real USDC debits
  // without corresponding credits and duplicate topups during low-credit loops.
  // Never move wallet funds at startup unless the operator explicitly enables it.
  if (config.autoTopupEnabled === true && config.allowPaidComputeTopup === true) {
  try {`,
  "gate startup bootstrap topup",
);

replaceExact(
  "src/index.ts",
`  } catch (err: any) {
    logger.warn(\`[\${new Date().toISOString()}] Bootstrap topup skipped: \${err.message}\`);
  }

  // Start heartbeat daemon (Phase 1.1: DurableScheduler)`,
`  } catch (err: any) {
    logger.warn(\`[\${new Date().toISOString()}] Bootstrap topup skipped: \${err.message}\`);
  }
  } else {
    logger.info(
      \`[\${new Date().toISOString()}] Paid Conway compute topups disabled by configuration.\`,
    );
  }

  // Start heartbeat daemon (Phase 1.1: DurableScheduler)`,
  "close startup topup gate",
);

// The model itself must not be able to spend USDC on compute unless explicitly enabled.
replaceExact(
  "src/agent/tools.ts",
`      execute: async (args, ctx) => {
        // Solana guard: x402 topup is EVM-only`,
`      execute: async (args, ctx) => {
        if (ctx.config.allowPaidComputeTopup !== true) {
          return "Blocked: paid Conway compute topups are disabled by configuration. This is a launch-safety guard; enable allowPaidComputeTopup only after a controlled service health check.";
        }

        // Solana guard: x402 topup is EVM-only`,
  "block topup_credits by default",
);

replaceExact(
  "src/agent/tools.ts",
`        const amountUsd = args.amount_usd as number;

        if (!TOPUP_TIERS.includes(amountUsd)) {`,
`        const amountUsd = args.amount_usd as number;
        const configuredMaxTopup = Number.isFinite(ctx.config.maxPaidComputeTopupUsd)
          ? Math.max(0, Number(ctx.config.maxPaidComputeTopupUsd))
          : 5;

        if (!TOPUP_TIERS.includes(amountUsd)) {`,
  "resolve paid topup cap",
);

replaceExact(
  "src/agent/tools.ts",
`        if (!TOPUP_TIERS.includes(amountUsd)) {
          return \`Invalid tier. Valid amounts (USD): \${TOPUP_TIERS.join(", ")}\`;
        }

        // Check USDC balance first (EVM-only path after Solana guard above)`,
`        if (!TOPUP_TIERS.includes(amountUsd)) {
          return \`Invalid tier. Valid amounts (USD): \${TOPUP_TIERS.join(", ")}\`;
        }
        if (amountUsd > configuredMaxTopup) {
          return \`Blocked: requested $\${amountUsd} compute topup exceeds configured per-purchase cap of $\${configuredMaxTopup}.\`;
        }

        // Check USDC balance first (EVM-only path after Solana guard above)`,
  "enforce paid topup cap",
);

console.log("\nprofit-engine-safety-v1 edits applied.");
