#!/usr/bin/env node
import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceExact(file, before, after, label) {
  const current = read(file);
  const count = current.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] expected exactly one source match in ${file}, found ${count}`);
  }
  write(file, current.replace(before, after));
  console.log(`OK  ${label}`);
}

function assertAbsent(file, needle, label) {
  if (read(file).includes(needle)) {
    throw new Error(`[${label}] unexpected pre-existing content in ${file}`);
  }
}

// ---------------------------------------------------------------------------
// 1) Launch configuration: fail-closed by default on this candidate branch.
// ---------------------------------------------------------------------------
replaceExact(
  "src/types.ts",
  `  socialRelayUrl?: string;\n  treasuryPolicy?: TreasuryPolicy;\n  /**\n   * Allow the runtime to automatically spend wallet USDC on Conway compute.`,
  `  socialRelayUrl?: string;\n  treasuryPolicy?: TreasuryPolicy;\n  /**\n   * Safe launch-candidate mode. While true, irreversible/spend-producing\n   * external actions are denied and compute is capped. The launch candidate\n   * refuses autonomous startup when this is not explicitly true.\n   */\n  profitLaunchMode?: boolean;\n  /**\n   * Allow the runtime to automatically spend wallet USDC on Conway compute.`,
  "add profitLaunchMode config",
);

replaceExact(
  "src/types.ts",
  `  socialRelayUrl: "https://social.conway.tech",\n  autoTopupEnabled: false,`,
  `  socialRelayUrl: "https://social.conway.tech",\n  profitLaunchMode: true,\n  autoTopupEnabled: false,`,
  "safe launch mode default",
);

replaceExact(
  "src/types.ts",
  `  | "tool_use"\n  | "transfer_in"`,
  `  | "tool_use"\n  | "earned_revenue"\n  | "transfer_in"`,
  "verified earned revenue transaction type",
);

replaceExact(
  "src/config.ts",
  `    maxChildren: DEFAULT_CONFIG.maxChildren || 3,\n    parentAddress: params.parentAddress,\n    treasuryPolicy: params.treasuryPolicy ?? DEFAULT_TREASURY_POLICY,`,
  `    maxChildren: DEFAULT_CONFIG.maxChildren || 3,\n    parentAddress: params.parentAddress,\n    treasuryPolicy: params.treasuryPolicy ?? DEFAULT_TREASURY_POLICY,\n    profitLaunchMode: true,\n    autoTopupEnabled: false,\n    allowPaidComputeTopup: false,\n    maxPaidComputeTopupUsd: 5,`,
  "fresh setup persists launch-safe settings",
);

// ---------------------------------------------------------------------------
// 2) Pure launch safety module: easy to audit and test independently.
// ---------------------------------------------------------------------------
fs.mkdirSync("src/launch", { recursive: true });
const safetyModule = `/**\n * Profit launch-candidate safety invariants.\n *\n * This module deliberately contains only deterministic policy/config helpers.\n * No network access, wallet access, or model reasoning can weaken these limits.\n */\n\nimport type { AutomatonConfig, ModelStrategyConfig, TreasuryPolicy } from "../types.js";\n\nexport const PROFIT_LAUNCH_INFERENCE_CAPS = Object.freeze({\n  hourlyBudgetCents: 200,\n  sessionBudgetCents: 100,\n  perCallCeilingCents: 25,\n  maxTurnsPerCycle: 10,\n});\n\n/**\n * Tools that are not necessarily marked dangerous but still create an\n * external, paid, or irreversible side effect. All dangerous tools are also\n * denied by the policy rule while launch mode is enabled.\n */\nexport const PROFIT_LAUNCH_BLOCKED_TOOLS = new Set<string>([\n  "topup_credits",\n  "transfer_credits",\n  "fund_child",\n  "x402_fetch",\n  "create_sandbox",\n  "spawn_child",\n  "start_child",\n  "register_domain",\n  "manage_dns",\n  "register_erc8004",\n  "give_feedback",\n  "expose_port",\n  "remove_port",\n  "send_message",\n  "message_child",\n  "git_push",\n]);\n\nexport function assertLaunchCandidateConfig(config: AutomatonConfig): void {\n  const problems: string[] = [];\n  if (config.profitLaunchMode !== true) {\n    problems.push("profitLaunchMode must be true");\n  }\n  if (config.autoTopupEnabled === true) {\n    problems.push("autoTopupEnabled must be false");\n  }\n  if (config.allowPaidComputeTopup === true) {\n    problems.push("allowPaidComputeTopup must be false");\n  }\n  if (problems.length > 0) {\n    throw new Error(\n      \`Launch-candidate safety preflight failed: \${problems.join("; ")}. Refusing autonomous startup.\`,\n    );\n  }\n}\n\nfunction capped(configured: number, ceiling: number): number {\n  if (!Number.isFinite(configured) || configured <= 0) return ceiling;\n  return Math.min(configured, ceiling);\n}\n\nexport function applyLaunchInferenceCaps(\n  strategy: ModelStrategyConfig,\n): ModelStrategyConfig {\n  return {\n    ...strategy,\n    hourlyBudgetCents: capped(strategy.hourlyBudgetCents, PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents),\n    sessionBudgetCents: capped(strategy.sessionBudgetCents, PROFIT_LAUNCH_INFERENCE_CAPS.sessionBudgetCents),\n    perCallCeilingCents: capped(strategy.perCallCeilingCents, PROFIT_LAUNCH_INFERENCE_CAPS.perCallCeilingCents),\n  };\n}\n\nexport function capLaunchCycleTurns(configured: number | undefined): number {\n  const normalized = Number.isFinite(configured) && Number(configured) > 0\n    ? Math.floor(Number(configured))\n    : PROFIT_LAUNCH_INFERENCE_CAPS.maxTurnsPerCycle;\n  return Math.min(normalized, PROFIT_LAUNCH_INFERENCE_CAPS.maxTurnsPerCycle);\n}\n\nexport function applyLaunchTreasuryLock(policy: TreasuryPolicy): TreasuryPolicy {\n  return {\n    ...policy,\n    maxSingleTransferCents: 0,\n    maxHourlyTransferCents: 0,\n    maxDailyTransferCents: 0,\n    maxX402PaymentCents: 0,\n    x402AllowedDomains: [],\n    maxTransfersPerTurn: 0,\n    requireConfirmationAboveCents: 0,\n    maxInferenceDailyCents: Math.min(\n      policy.maxInferenceDailyCents > 0 ? policy.maxInferenceDailyCents : PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents,\n      PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents,\n    ),\n  };\n}\n`;
write("src/launch/safety.ts", safetyModule);
console.log("OK  create launch safety module");

// ---------------------------------------------------------------------------
// 3) Central policy wall. Kernel gate remains higher authority; this is the
//    launch-specific deny layer for spend/external effects.
// ---------------------------------------------------------------------------
replaceExact(
  "src/agent/policy-rules/financial.ts",
  `} from "../../types.js";\n\nfunction deny(`,
  `} from "../../types.js";\nimport { PROFIT_LAUNCH_BLOCKED_TOOLS } from "../../launch/safety.js";\n\nfunction deny(`,
  "import launch blocked-tool set",
);

replaceExact(
  "src/agent/policy-rules/financial.ts",
  `function deny(\n  rule: string,\n  reasonCode: string,\n  humanMessage: string,\n): PolicyRuleResult {\n  return { rule, action: "deny", reasonCode, humanMessage };\n}\n`,
  `function deny(\n  rule: string,\n  reasonCode: string,\n  humanMessage: string,\n): PolicyRuleResult {\n  return { rule, action: "deny", reasonCode, humanMessage };\n}\n\nfunction createProfitLaunchLockRule(): PolicyRule {\n  return {\n    id: "financial.profit_launch_lock",\n    description: "Deny dangerous and external/spend-producing actions in launch mode",\n    priority: 25,\n    appliesTo: { by: "all" },\n    evaluate(request: PolicyRequest): PolicyRuleResult | null {\n      if (request.context.config.profitLaunchMode !== true) return null;\n      if (\n        request.tool.riskLevel !== "dangerous" &&\n        !PROFIT_LAUNCH_BLOCKED_TOOLS.has(request.tool.name)\n      ) {\n        return null;\n      }\n      return deny(\n        "financial.profit_launch_lock",\n        "PROFIT_LAUNCH_LOCK",\n        \`Blocked in profit launch mode: \${request.tool.name}. This candidate permits analysis/build work but no autonomous irreversible or paid external action.\`,\n      );\n    },\n  };\n}\n`,
  "central launch lock rule",
);

replaceExact(
  "src/agent/policy-rules/financial.ts",
  `  return [\n    createX402MaxSingleRule(treasuryPolicy),`,
  `  return [\n    createProfitLaunchLockRule(),\n    createX402MaxSingleRule(treasuryPolicy),`,
  "activate launch lock rule",
);

// ---------------------------------------------------------------------------
// 4) Startup preflight and zero-spend treasury lock BEFORE network work.
// ---------------------------------------------------------------------------
replaceExact(
  "src/index.ts",
  `import { randomUUID } from "crypto";`,
  `import { randomUUID } from "crypto";\nimport { assertLaunchCandidateConfig, applyLaunchTreasuryLock } from "./launch/safety.js";`,
  "import launch preflight helpers",
);

replaceExact(
  "src/index.ts",
  `  if (!config) {\n    const { runSetupWizard } = await import("./setup/wizard.js");\n    config = await runSetupWizard();\n  }\n\n  // Load wallet (chain-aware)`,
  `  if (!config) {\n    const { runSetupWizard } = await import("./setup/wizard.js");\n    config = await runSetupWizard();\n  }\n\n  // Launch-candidate safety is checked before wallet, network, or database work.\n  assertLaunchCandidateConfig(config);\n\n  // Load wallet (chain-aware)`,
  "fail-closed launch preflight before wallet/network",
);

replaceExact(
  "src/index.ts",
  `  const treasuryPolicy = config.treasuryPolicy ?? DEFAULT_TREASURY_POLICY;\n  const rules = createDefaultRules(treasuryPolicy);`,
  `  const configuredTreasuryPolicy = config.treasuryPolicy ?? DEFAULT_TREASURY_POLICY;\n  const treasuryPolicy = config.profitLaunchMode === true\n    ? applyLaunchTreasuryLock(configuredTreasuryPolicy)\n    : configuredTreasuryPolicy;\n  const rules = createDefaultRules(treasuryPolicy);`,
  "zero-spend effective treasury policy",
);

// ---------------------------------------------------------------------------
// 5) Compute limits + local-only orchestration in launch mode.
// ---------------------------------------------------------------------------
replaceExact(
  "src/agent/loop.ts",
  `import { isIdleOnlyTool } from "./idle-only-tools.js";`,
  `import { isIdleOnlyTool } from "./idle-only-tools.js";\nimport { applyLaunchInferenceCaps, capLaunchCycleTurns } from "../launch/safety.js";`,
  "import launch compute limits",
);

replaceExact(
  "src/agent/loop.ts",
  `  const modelStrategyConfig: ModelStrategyConfig = {\n    ...DEFAULT_MODEL_STRATEGY_CONFIG,\n    ...(config.modelStrategy ?? {}),\n  };`,
  `  const configuredModelStrategy: ModelStrategyConfig = {\n    ...DEFAULT_MODEL_STRATEGY_CONFIG,\n    ...(config.modelStrategy ?? {}),\n  };\n  const modelStrategyConfig = config.profitLaunchMode === true\n    ? applyLaunchInferenceCaps(configuredModelStrategy)\n    : configuredModelStrategy;`,
  "hard cap launch inference budgets",
);

replaceExact(
  "src/agent/loop.ts",
  `          spawnAgent: async (task: any) => {\n            // Try Conway sandbox spawn first (production)\n            try {`,
  `          spawnAgent: async (task: any) => {\n            // Launch candidate never provisions a paid remote sandbox.\n            if (config.profitLaunchMode === true) {\n              return initializedWorkerPool.spawn(task);\n            }\n\n            // Try Conway sandbox spawn first (production)\n            try {`,
  "launch mode uses local workers only",
);

replaceExact(
  "src/agent/loop.ts",
  `  const maxCycleTurns = config.maxTurnsPerCycle ?? 25;`,
  `  const maxCycleTurns = config.profitLaunchMode === true\n    ? capLaunchCycleTurns(config.maxTurnsPerCycle)\n    : (config.maxTurnsPerCycle ?? 25);`,
  "cap launch cycle turns",
);

// ---------------------------------------------------------------------------
// 6) Strict economics: funding != earned revenue; compute purchase = expense.
//    No model-facing tool can create an earned_revenue transaction.
// ---------------------------------------------------------------------------
replaceExact(
  "src/heartbeat/tasks.ts",
  `  colony_financial_report: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {`,
  `  colony_financial_report: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {`,
  "financial report receives wallet snapshot",
);

replaceExact(
  "src/heartbeat/tasks.ts",
  `      let inflowCents = 0;\n      let expenseCents = 0;\n      let computeTopupCents = 0;`,
  `      let earnedRevenueCents = 0;\n      let inflowCents = 0;\n      let expenseCents = 0;\n      let computeTopupCents = 0;`,
  "separate earned revenue accumulator",
);

replaceExact(
  "src/heartbeat/tasks.ts",
  `        // transfer_in is cash/credit inflow, but not necessarily earned revenue:\n        // it can also be creator funding or recalled child funds.\n        if (tx.type === "transfer_in") {`,
  `        // Only a trusted attribution path may write earned_revenue. There is\n        // intentionally no model-facing tool that can self-declare this type.\n        if (tx.type === "earned_revenue") {\n          earnedRevenueCents += amount;\n          continue;\n        }\n\n        // transfer_in is funding/inflow, not earned revenue.\n        if (tx.type === "transfer_in") {`,
  "classify verified earned revenue separately",
);

replaceExact(
  "src/heartbeat/tasks.ts",
  `      const report = {\n        timestamp: new Date().toISOString(),\n        // Do not label generic incoming transfers as earned revenue.\n        inflowCents,\n        expenseCents,\n        computeTopupCents,\n        netCashflowCents: inflowCents - expenseCents,\n        // Backward-compatible fields. "revenueCents" now excludes credit purchases.\n        revenueCents: inflowCents,\n        netCents: inflowCents - expenseCents,`,
  `      const operatingProfitCents = earnedRevenueCents - expenseCents;\n      const netCashflowCents = earnedRevenueCents + inflowCents - expenseCents;\n      const walletUsdcBalanceCents = Math.round(ctx.usdcBalance * 100);\n      const baselineKey = "profit_launch.wallet_usdc_baseline_cents";\n      const storedBaseline = Number(taskCtx.db.getKV(baselineKey));\n      const walletUsdcBaselineCents = Number.isFinite(storedBaseline)\n        ? storedBaseline\n        : walletUsdcBalanceCents;\n      if (!Number.isFinite(storedBaseline)) {\n        taskCtx.db.setKV(baselineKey, String(walletUsdcBaselineCents));\n      }\n\n      const report = {\n        timestamp: new Date().toISOString(),\n        earnedRevenueCents,\n        inflowCents,\n        expenseCents,\n        computeTopupCents,\n        operatingProfitCents,\n        netCashflowCents,\n        walletUsdcBalanceCents,\n        walletUsdcBaselineCents,\n        walletUsdcDeltaCents: walletUsdcBalanceCents - walletUsdcBaselineCents,\n        // Backward-compatible fields now use strict economic definitions.\n        revenueCents: earnedRevenueCents,\n        netCents: operatingProfitCents,`,
  "strict profit report and wallet baseline",
);

// ---------------------------------------------------------------------------
// 7) Expand the protected kernel to include the actual launch enforcement path.
// ---------------------------------------------------------------------------
const extraKernelFiles = [
  "scripts/check-kernel-manifest.mjs",
  "scripts/generate-kernel-manifest.mjs",
  "src/index.ts",
  "src/types.ts",
  "src/config.ts",
  "src/launch/safety.ts",
  "src/agent/loop.ts",
  "src/agent/tools.ts",
  "src/heartbeat/tasks.ts",
  "src/inference/budget.ts",
  "src/inference/router.ts",
  "src/orchestration/orchestrator.ts",
  "src/orchestration/plan-mode.ts",
  "src/orchestration/local-worker.ts",
  "src/conway/topup.ts",
  "src/conway/reserve.ts",
];

for (const file of [
  "src/governance/kernel.ts",
  "scripts/generate-kernel-manifest.mjs",
  "scripts/check-kernel-manifest.mjs",
]) {
  let current = read(file);
  for (const rel of extraKernelFiles) {
    if (current.includes(`  "${rel}",`)) continue;
    const marker = `  "src/governance/kernel.ts",`;
    if (!current.includes(marker)) {
      throw new Error(`[kernel expansion] marker missing in ${file}`);
    }
    current = current.replace(marker, `${marker}\n  "${rel}",`);
  }
  write(file, current);
  console.log(`OK  expand protected kernel: ${file}`);
}

// ---------------------------------------------------------------------------
// 8) Regression tests for pure launch invariants + central policy rule.
// ---------------------------------------------------------------------------
const launchTest = `import { describe, expect, it } from "vitest";\nimport type { AutomatonConfig, ModelStrategyConfig, PolicyRequest } from "../types.js";\nimport { DEFAULT_CONFIG, DEFAULT_MODEL_STRATEGY_CONFIG, DEFAULT_TREASURY_POLICY } from "../types.js";\nimport { createFinancialRules } from "../agent/policy-rules/financial.js";\nimport {\n  PROFIT_LAUNCH_BLOCKED_TOOLS,\n  PROFIT_LAUNCH_INFERENCE_CAPS,\n  applyLaunchInferenceCaps,\n  applyLaunchTreasuryLock,\n  assertLaunchCandidateConfig,\n  capLaunchCycleTurns,\n} from "../launch/safety.js";\n\nfunction config(overrides: Partial<AutomatonConfig> = {}): AutomatonConfig {\n  return {\n    ...(DEFAULT_CONFIG as AutomatonConfig),\n    name: "test",\n    genesisPrompt: "test",\n    creatorAddress: "0xcreator",\n    registeredWithConway: false,\n    sandboxId: "sandbox",\n    conwayApiKey: "key",\n    walletAddress: "0xwallet",\n    ...overrides,\n  };\n}\n\nfunction request(toolName: string, riskLevel: "safe" | "caution" | "dangerous"): PolicyRequest {\n  return {\n    tool: {\n      name: toolName,\n      description: "test",\n      category: "financial",\n      riskLevel,\n      parameters: {},\n      execute: async () => "ok",\n    },\n    args: {},\n    context: { config: config() } as PolicyRequest["context"],\n    turnContext: {\n      inputSource: "agent",\n      turnToolCallCount: 0,\n      sessionSpend: {} as PolicyRequest["turnContext"]["sessionSpend"],\n    },\n  };\n}\n\ndescribe("profit launch v2 safety", () => {\n  it("defaults to fail-closed launch mode with paid topups off", () => {\n    expect(DEFAULT_CONFIG.profitLaunchMode).toBe(true);\n    expect(DEFAULT_CONFIG.autoTopupEnabled).toBe(false);\n    expect(DEFAULT_CONFIG.allowPaidComputeTopup).toBe(false);\n  });\n\n  it("refuses startup when launch mode is disabled", () => {\n    expect(() => assertLaunchCandidateConfig(config({ profitLaunchMode: false }))).toThrow(/profitLaunchMode/);\n  });\n\n  it("refuses startup when any wallet-funded compute automation is enabled", () => {\n    expect(() => assertLaunchCandidateConfig(config({ autoTopupEnabled: true }))).toThrow(/autoTopupEnabled/);\n    expect(() => assertLaunchCandidateConfig(config({ allowPaidComputeTopup: true }))).toThrow(/allowPaidComputeTopup/);\n  });\n\n  it("turns unlimited or excessive inference budgets into hard micro-budget caps", () => {\n    const unlimited: ModelStrategyConfig = { ...DEFAULT_MODEL_STRATEGY_CONFIG };\n    const capped = applyLaunchInferenceCaps(unlimited);\n    expect(capped.hourlyBudgetCents).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents);\n    expect(capped.sessionBudgetCents).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.sessionBudgetCents);\n    expect(capped.perCallCeilingCents).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.perCallCeilingCents);\n\n    const cheaper = applyLaunchInferenceCaps({\n      ...unlimited,\n      hourlyBudgetCents: 50,\n      sessionBudgetCents: 40,\n      perCallCeilingCents: 5,\n    });\n    expect(cheaper.hourlyBudgetCents).toBe(50);\n    expect(cheaper.sessionBudgetCents).toBe(40);\n    expect(cheaper.perCallCeilingCents).toBe(5);\n  });\n\n  it("caps cycle turns and zeroes autonomous transfer/x402 authority", () => {\n    expect(capLaunchCycleTurns(100)).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.maxTurnsPerCycle);\n    const policy = applyLaunchTreasuryLock(DEFAULT_TREASURY_POLICY);\n    expect(policy.maxSingleTransferCents).toBe(0);\n    expect(policy.maxHourlyTransferCents).toBe(0);\n    expect(policy.maxDailyTransferCents).toBe(0);\n    expect(policy.maxX402PaymentCents).toBe(0);\n    expect(policy.x402AllowedDomains).toEqual([]);\n    expect(policy.maxTransfersPerTurn).toBe(0);\n  });\n\n  it("launch policy denies every dangerous tool plus explicit external-effect tools", () => {\n    const rule = createFinancialRules(DEFAULT_TREASURY_POLICY).find((r) => r.id === "financial.profit_launch_lock");\n    expect(rule).toBeDefined();\n    expect(rule!.evaluate(request("edit_own_file", "dangerous"))?.action).toBe("deny");\n    for (const name of PROFIT_LAUNCH_BLOCKED_TOOLS) {\n      expect(rule!.evaluate(request(name, "caution"))?.action, name).toBe("deny");\n    }\n    expect(rule!.evaluate(request("read_file", "safe"))).toBeNull();\n  });\n});\n`;
write("src/__tests__/profit-launch-v2.test.ts", launchTest);
console.log("OK  create launch v2 regression tests");

// Sanity: no model-facing tool may directly mention the earned_revenue type.
assertAbsent("src/agent/tools.ts", `type: "earned_revenue"`, "model cannot self-declare revenue");

console.log("Launch candidate v2 codemod applied.");
