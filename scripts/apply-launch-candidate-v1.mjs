#!/usr/bin/env node
import fs from "node:fs";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, value) { fs.writeFileSync(file, value, "utf8"); }
function replaceExact(file, before, after, label) {
  const current = read(file);
  if (!current.includes(before)) throw new Error(`[${label}] source context not found in ${file}`);
  write(file, current.replace(before, after));
  console.log(`OK  ${label}`);
}
function replaceOnceRegex(file, regex, replacer, label) {
  const current = read(file);
  const matches = [...current.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`[${label}] expected exactly one match in ${file}, found ${matches.length}`);
  write(file, current.replace(regex, replacer));
  console.log(`OK  ${label}`);
}

// ---------------------------------------------------------------------------
// Test commands: Vitest 2.1.9 does not support --grep. Keep named commands real.
// ---------------------------------------------------------------------------
{
  const file = "package.json";
  const pkg = JSON.parse(read(file));
  pkg.scripts["test:security"] = pkg.scripts["test:security:ci"];
  pkg.scripts["test:financial"] = "vitest run src/__tests__/financial.test.ts src/__tests__/spend-tracker.test.ts src/__tests__/reserve.test.ts src/__tests__/reserve-x402.test.ts src/__tests__/authority-rules.test.ts src/__tests__/funding.test.ts";
  write(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log("OK  repair security/financial test commands");
}

// ---------------------------------------------------------------------------
// Launch configuration + verified revenue ledger type.
// ---------------------------------------------------------------------------
replaceExact(
  "src/types.ts",
`  socialRelayUrl?: string;
  treasuryPolicy?: TreasuryPolicy;
  /**
   * Optional DNS resolver override`,
`  socialRelayUrl?: string;
  treasuryPolicy?: TreasuryPolicy;
  /** Safe-by-default pre-launch mode. Dangerous/spend-producing actions are denied. */
  profitLaunchMode?: boolean;
  /** Permit automatic compute topups. Requires allowPaidComputeTopup too. */
  autoTopupEnabled?: boolean;
  /** Master switch for any wallet-funded Conway compute purchase. */
  allowPaidComputeTopup?: boolean;
  /** Maximum permitted paid compute topup in one purchase, in USD. */
  maxPaidComputeTopupUsd?: number;
  /**
   * Optional DNS resolver override`,
  "launch config types",
);
replaceExact(
  "src/types.ts",
`  childSandboxMemoryMb: 1024,
  socialRelayUrl: "https://social.conway.tech",
};`,
`  childSandboxMemoryMb: 1024,
  socialRelayUrl: "https://social.conway.tech",
  profitLaunchMode: true,
  autoTopupEnabled: false,
  allowPaidComputeTopup: false,
  maxPaidComputeTopupUsd: 5,
};`,
  "safe launch defaults",
);
replaceExact(
  "src/types.ts",
`  | "tool_use"
  | "transfer_in"`,
`  | "tool_use"
  | "earned_revenue"
  | "transfer_in"`,
  "verified earned revenue transaction type",
);

// ---------------------------------------------------------------------------
// Central policy wall: launch mode refuses dangerous or explicit spend tools.
// ---------------------------------------------------------------------------
replaceExact(
  "src/agent/policy-rules/financial.ts",
`function deny(
  rule: string,
  reasonCode: string,
  humanMessage: string,
): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}
`,
`function deny(
  rule: string,
  reasonCode: string,
  humanMessage: string,
): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}

const PROFIT_LAUNCH_BLOCKED_TOOLS = new Set([
  "topup_credits",
  "transfer_credits",
  "fund_child",
  "x402_fetch",
  "create_sandbox",
  "spawn_child",
  "register_domain",
  "give_feedback",
]);

/**
 * Launch candidate is earn-first. A model can research, build, contact and
 * receive funds, but cannot autonomously create an irreversible/high-risk
 * side effect. This is deliberately above the normal spend rules so a later
 * tool cannot accidentally bypass a zero-value cap by omitting an amount.
 */
function createProfitLaunchLockRule(): PolicyRule {
  return {
    id: "financial.profit_launch_lock",
    description: "Deny dangerous and spend-producing actions while profitLaunchMode is enabled",
    priority: 1000,
    appliesTo: { by: "all" },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      if (request.context.config.profitLaunchMode !== true) return null;
      if (
        request.tool.riskLevel !== "dangerous" &&
        !PROFIT_LAUNCH_BLOCKED_TOOLS.has(request.tool.name)
      ) {
        return null;
      }
      return deny(
        "financial.profit_launch_lock",
        "PROFIT_LAUNCH_SPEND_LOCK",
        `Blocked in profit launch mode: ${request.tool.name}. Disable profitLaunchMode only after explicit live-spend validation.`,
      );
    },
  };
}
`,
  "central launch spend lock",
);
replaceExact(
  "src/agent/policy-rules/financial.ts",
`  return [
    createX402MaxSingleRule(treasuryPolicy),`,
`  return [
    createProfitLaunchLockRule(),
    createX402MaxSingleRule(treasuryPolicy),`,
  "activate launch spend lock",
);

// ---------------------------------------------------------------------------
// Runtime treasury policy: zero autonomous transfers/x402 while launch mode.
// ---------------------------------------------------------------------------
replaceExact(
  "src/index.ts",
`  const treasuryPolicy = config.treasuryPolicy ?? DEFAULT_TREASURY_POLICY;
  const rules = createDefaultRules(treasuryPolicy);`,
`  const configuredTreasuryPolicy = config.treasuryPolicy ?? DEFAULT_TREASURY_POLICY;
  const treasuryPolicy = config.profitLaunchMode === true
    ? {
        ...configuredTreasuryPolicy,
        maxSingleTransferCents: 0,
        maxHourlyTransferCents: 0,
        maxDailyTransferCents: 0,
        maxX402PaymentCents: 0,
        x402AllowedDomains: [],
        maxTransfersPerTurn: 0,
        requireConfirmationAboveCents: 0,
      }
    : configuredTreasuryPolicy;
  const rules = createDefaultRules(treasuryPolicy);`,
  "zero-spend launch treasury policy",
);
replaceExact(
  "src/index.ts",
`  // Bootstrap topup: buy minimum credits ($5) from USDC so the agent can start.
  // The agent decides larger topups itself via the topup_credits tool.
  try {`,
`  // Wallet-funded compute is opt-in and never runs in profit launch mode.
  if (
    config.profitLaunchMode !== true &&
    config.autoTopupEnabled === true &&
    config.allowPaidComputeTopup === true
  ) {
  try {`,
  "gate startup bootstrap topup",
);
replaceExact(
  "src/index.ts",
`  } catch (err: any) {
    logger.warn(\`[\${new Date().toISOString()}] Bootstrap topup skipped: \${err.message}\`);
  }

  // Start heartbeat daemon`,
`  } catch (err: any) {
    logger.warn(\`[\${new Date().toISOString()}] Bootstrap topup skipped: \${err.message}\`);
  }
  } else {
    logger.info(\`[\${new Date().toISOString()}] Paid compute topups disabled by launch policy.\`);
  }

  // Start heartbeat daemon`,
  "close startup topup gate",
);

// ---------------------------------------------------------------------------
// Agent loop: bounded inference, local-only workers, all automatic topups gated.
// ---------------------------------------------------------------------------
replaceExact(
  "src/agent/loop.ts",
`const MAX_REPETITIVE_TURNS = 3;`,
`const MAX_REPETITIVE_TURNS = 3;
let localWorkerRecoveryDone = false;`,
  "local worker recovery process guard",
);
replaceExact(
  "src/agent/loop.ts",
`  const modelStrategyConfig: ModelStrategyConfig = {
    ...DEFAULT_MODEL_STRATEGY_CONFIG,
    ...(config.modelStrategy ?? {}),
  };`,
`  const modelStrategyConfig: ModelStrategyConfig = {
    ...DEFAULT_MODEL_STRATEGY_CONFIG,
    ...(config.modelStrategy ?? {}),
  };
  if (config.profitLaunchMode === true) {
    const cap = (configured: number, ceiling: number) =>
      configured > 0 ? Math.min(configured, ceiling) : ceiling;
    modelStrategyConfig.hourlyBudgetCents = cap(modelStrategyConfig.hourlyBudgetCents, 200);
    modelStrategyConfig.sessionBudgetCents = cap(modelStrategyConfig.sessionBudgetCents, 100);
    modelStrategyConfig.perCallCeilingCents = cap(modelStrategyConfig.perCallCeilingCents, 25);
  }`,
  "bounded launch inference budgets",
);
replaceExact(
  "src/agent/loop.ts",
`          spawnAgent: async (task: any) => {
            // Try Conway sandbox spawn first (production)
            try {`,
`          spawnAgent: async (task: any) => {
            // Launch mode uses in-process workers only: no paid sandbox creation.
            if (config.profitLaunchMode === true) {
              return initializedWorkerPool.spawn(task);
            }

            // Try Conway sandbox spawn first (production)
            try {`,
  "local-only workers in launch mode",
);
replaceExact(
  "src/agent/loop.ts",
`              if (is402) {`,
`              if (
                is402 &&
                config.autoTopupEnabled === true &&
                config.allowPaidComputeTopup === true
              ) {`,
  "gate sandbox recovery topup",
);
replaceExact(
  "src/agent/loop.ts",
`        if ((tier === "critical" || tier === "low_compute") && financial.usdcBalance >= 5) {`,
`        if (
          config.profitLaunchMode !== true &&
          config.autoTopupEnabled === true &&
          config.allowPaidComputeTopup === true &&
          (tier === "critical" || tier === "low_compute") &&
          financial.usdcBalance >= 5
        ) {`,
  "gate inline auto-topup",
);
replaceExact(
  "src/agent/loop.ts",
`  // Set start time
  if (!db.getKV("start_time")) {`,
`  // Local workers die with the process. Recover only once at process startup;
  // never treat a completed in-process worker as a dead remote worker per tick.
  if (!localWorkerRecoveryDone && hasTable(db.raw, "task_graph")) {
    localWorkerRecoveryDone = true;
    const staleLocalTasks = db.raw.prepare(
      "SELECT id, assigned_to FROM task_graph WHERE status = 'assigned' AND assigned_to LIKE 'local://%'",
    ).all() as { id: string; assigned_to: string }[];
    for (const task of staleLocalTasks) {
      db.raw.prepare(
        "UPDATE task_graph SET status = 'pending', assigned_to = NULL, started_at = NULL WHERE id = ?",
      ).run(task.id);
      logger.info("Reset stale local worker assignment from previous process", {
        taskId: task.id,
        worker: task.assigned_to,
      });
    }
  }

  // Set start time
  if (!db.getKV("start_time")) {`,
  "one-time stale local worker recovery",
);

// ---------------------------------------------------------------------------
// Heartbeat: no auto topup in launch mode; financially correct reporting.
// ---------------------------------------------------------------------------
replaceExact(
  "src/heartbeat/tasks.ts",
`    const MIN_TOPUP_USD = 5;
    if (balance >= MIN_TOPUP_USD && (ctx.survivalTier === "critical" || ctx.survivalTier === "dead")) {`,
`    if (
      taskCtx.config.profitLaunchMode === true ||
      taskCtx.config.autoTopupEnabled !== true ||
      taskCtx.config.allowPaidComputeTopup !== true
    ) {
      return { shouldWake: false };
    }

    const MIN_TOPUP_USD = 5;
    if (balance >= MIN_TOPUP_USD && (ctx.survivalTier === "critical" || ctx.survivalTier === "dead")) {`,
  "gate heartbeat auto-topup",
);
replaceExact(
  "src/heartbeat/tasks.ts",
`      const transactions = taskCtx.db.getRecentTransactions(5000);
      let revenueCents = 0;
      let expenseCents = 0;

      for (const tx of transactions) {
        const amount = Math.max(0, Math.floor(tx.amountCents ?? 0));
        if (amount === 0) continue;

        if (tx.type === "transfer_in" || tx.type === "credit_purchase") {
          revenueCents += amount;
          continue;
        }

        if (
          tx.type === "inference"
          || tx.type === "tool_use"
          || tx.type === "transfer_out"
          || tx.type === "funding_request"
        ) {
          expenseCents += amount;
        }
      }`,
`      const transactions = taskCtx.db.getRecentTransactions(5000);
      let earnedRevenueCents = 0;
      let inflowCents = 0;
      let expenseCents = 0;
      let computeTopupCents = 0;

      for (const tx of transactions) {
        const amount = Math.max(0, Math.floor(tx.amountCents ?? 0));
        if (amount === 0) continue;

        if (tx.type === "earned_revenue") {
          earnedRevenueCents += amount;
          continue;
        }
        if (tx.type === "transfer_in") {
          inflowCents += amount;
          continue;
        }
        if (tx.type === "credit_purchase") {
          computeTopupCents += amount;
          expenseCents += amount;
          continue;
        }
        if (
          tx.type === "inference"
          || tx.type === "tool_use"
          || tx.type === "transfer_out"
          || tx.type === "funding_request"
        ) {
          expenseCents += amount;
        }
      }`,
  "correct revenue/cashflow classification",
);
replaceExact(
  "src/heartbeat/tasks.ts",
`      const report = {
        timestamp: new Date().toISOString(),
        revenueCents,
        expenseCents,
        netCents: revenueCents - expenseCents,`,
`      const operatingProfitCents = earnedRevenueCents - expenseCents;
      const netCashflowCents = earnedRevenueCents + inflowCents - expenseCents;
      const report = {
        timestamp: new Date().toISOString(),
        earnedRevenueCents,
        inflowCents,
        expenseCents,
        computeTopupCents,
        operatingProfitCents,
        netCashflowCents,
        // Backward-compatible names now have strict economic meaning.
        revenueCents: earnedRevenueCents,
        netCents: operatingProfitCents,`,
  "strict financial report",
);

// ---------------------------------------------------------------------------
// Tool-level defense: paid topups stay off unless launch mode is explicitly off.
// Goal economics become first-class.
// ---------------------------------------------------------------------------
replaceExact(
  "src/agent/tools.ts",
`        const { topupCredits, TOPUP_TIERS } =
          await import("../conway/topup.js");
        const amountUsd = args.amount_usd as number;

        if (!TOPUP_TIERS.includes(amountUsd)) {`,
`        if (
          ctx.config.profitLaunchMode === true ||
          ctx.config.allowPaidComputeTopup !== true
        ) {
          return "Blocked: paid Conway compute topups are disabled by launch policy.";
        }

        const { topupCredits, TOPUP_TIERS } =
          await import("../conway/topup.js");
        const amountUsd = args.amount_usd as number;
        const maxTopupUsd = Number.isFinite(ctx.config.maxPaidComputeTopupUsd)
          ? Math.max(0, Number(ctx.config.maxPaidComputeTopupUsd))
          : 5;

        if (!TOPUP_TIERS.includes(amountUsd)) {`,
  "tool-level paid topup lock",
);
replaceExact(
  "src/agent/tools.ts",
`        if (!TOPUP_TIERS.includes(amountUsd)) {
          return \`Invalid tier. Valid amounts (USD): \${TOPUP_TIERS.join(", ")}\`;
        }

        // Check USDC balance first`,
`        if (!TOPUP_TIERS.includes(amountUsd)) {
          return \`Invalid tier. Valid amounts (USD): \${TOPUP_TIERS.join(", ")}\`;
        }
        if (amountUsd > maxTopupUsd) {
          return \`Blocked: requested $\${amountUsd} topup exceeds configured $\${maxTopupUsd} cap.\`;
        }

        // Check USDC balance first`,
  "paid topup amount cap",
);
replaceExact(
  "src/agent/tools.ts",
`          strategy: {
            type: "string",
            description:
              "Optional strategic guidance for the planner (e.g., 'prioritize speed over cost')",
          },
        },
        required: ["title", "description"],`,
`          strategy: {
            type: "string",
            description:
              "Optional strategic guidance for the planner (e.g., 'prioritize speed over cost')",
          },
          expected_revenue_cents: {
            type: "number",
            description:
              "Conservative externally earned revenue expected if this goal succeeds, in cents. Use 0 for maintenance/non-revenue goals.",
          },
        },
        required: ["title", "description", "expected_revenue_cents"],`,
  "goal expected revenue schema",
);
replaceExact(
  "src/agent/tools.ts",
`        const strategy =
          typeof args.strategy === "string" ? args.strategy.trim() : undefined;

        if (!title) return "Error: goal title cannot be empty.";
        if (!description) return "Error: goal description cannot be empty.";`,
`        const strategy =
          typeof args.strategy === "string" ? args.strategy.trim() : undefined;
        const expectedRevenueCents = Number(args.expected_revenue_cents);

        if (!title) return "Error: goal title cannot be empty.";
        if (!description) return "Error: goal description cannot be empty.";
        if (
          !Number.isInteger(expectedRevenueCents) ||
          expectedRevenueCents < 0
        ) {
          return "Error: expected_revenue_cents must be a non-negative integer.";
        }`,
  "goal expected revenue validation",
);
replaceExact(
  "src/agent/tools.ts",
`        const goal = createGoal(ctx.db.raw, title, description, strategy);
        return (
          \`Goal created: "\${goal.title}" (id: \${goal.id}, status: \${goal.status})\\n\` +`,
`        const goal = createGoal(
          ctx.db.raw,
          title,
          description,
          strategy,
          expectedRevenueCents,
        );
        return (
          \`Goal created: "\${goal.title}" (id: \${goal.id}, status: \${goal.status}, expected revenue: \${goal.expectedRevenueCents}c)\\n\` +`,
  "persist expected revenue from tool",
);

// ---------------------------------------------------------------------------
// Goal persistence.
// ---------------------------------------------------------------------------
replaceExact(
  "src/orchestration/task-graph.ts",
`export function createGoal(
  db: Database,
  title: string,
  description: string,
  strategy?: string,
): Goal {`,
`export function createGoal(
  db: Database,
  title: string,
  description: string,
  strategy?: string,
  expectedRevenueCents = 0,
): Goal {`,
  "createGoal expected revenue signature",
);
replaceExact(
  "src/orchestration/task-graph.ts",
`  if (!normalizedDescription) {
    throw new Error("Goal description cannot be empty");
  }

  const id = insertGoal(db, {
    title: normalizedTitle,
    description: normalizedDescription,
    strategy: strategy ?? null,
  });`,
`  if (!normalizedDescription) {
    throw new Error("Goal description cannot be empty");
  }
  if (!Number.isFinite(expectedRevenueCents) || expectedRevenueCents < 0) {
    throw new Error("Expected revenue must be a non-negative number of cents");
  }

  const id = insertGoal(db, {
    title: normalizedTitle,
    description: normalizedDescription,
    strategy: strategy ?? null,
    expectedRevenueCents: Math.floor(expectedRevenueCents),
  });`,
  "createGoal expected revenue persistence",
);

// ---------------------------------------------------------------------------
// Orchestrator: fail closed for revenue goals and enforce >=2x projected ROI.
// Also port upstream #233's local-worker stale-recovery fix.
// ---------------------------------------------------------------------------
replaceExact(
  "src/orchestration/orchestrator.ts",
`      logger.warn("Planner inference failed, falling back to single-task plan", {
        goalId: goal.id,
        error: err.message,
      });
      output = {`,
`      logger.warn("Planner inference failed, falling back to single-task plan", {
        goalId: goal.id,
        error: err.message,
      });
      if (goal.expectedRevenueCents > 0) {
        updateGoalStatus(this.params.db, goal.id, "paused");
        this.params.db.prepare(
          "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        ).run(
          \`orchestrator.review_feedback.\${goal.id}\`,
          \`Revenue goal paused: planner failed closed (\${err.message}).\`,
        );
        return { ...state, phase: "idle", goalId: null };
      }
      output = {`,
  "fail closed when revenue planning fails",
);
replaceExact(
  "src/orchestration/orchestrator.ts",
`    if (output.tasks.length === 0) {
      // Planner returned valid JSON but empty tasks — use fallback single task`,
`    if (output.tasks.length === 0) {
      if (goal.expectedRevenueCents > 0) {
        updateGoalStatus(this.params.db, goal.id, "paused");
        this.params.db.prepare(
          "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        ).run(\`orchestrator.review_feedback.\${goal.id}\`, "Revenue goal paused: planner returned no executable tasks.");
        return { ...state, phase: "idle", goalId: null };
      }
      // Planner returned valid JSON but empty tasks — use fallback single task`,
  "fail closed on empty revenue plan",
);
replaceExact(
  "src/orchestration/orchestrator.ts",
`    if (!state.goalId) {
      return { ...state, phase: "idle" };
    }

    const planKey = \`orchestrator.plan.\${state.goalId}\`;`,
`    if (!state.goalId) {
      return { ...state, phase: "idle" };
    }

    const goal = getGoalById(this.params.db, state.goalId);
    if (!goal) {
      return { ...state, phase: "idle", goalId: null };
    }

    const planKey = \`orchestrator.plan.\${state.goalId}\`;`,
  "load goal economics during plan review",
);
replaceExact(
  "src/orchestration/orchestrator.ts",
`      if (result.approved) {
        // An approved (within-ceiling) plan clears any prior rejection history`,
`      if (result.approved) {
        const estimatedCostCents = Math.max(0, Math.floor(Number((planData as any).estimatedTotalCostCents ?? 0)));
        const MIN_PROJECTED_ROI = 2;
        if (
          goal.expectedRevenueCents > 0 &&
          estimatedCostCents > 0 &&
          goal.expectedRevenueCents / estimatedCostCents < MIN_PROJECTED_ROI
        ) {
          const projectedRoi = goal.expectedRevenueCents / estimatedCostCents;
          const feedback =
            \`Revenue goal paused: projected ROI \${projectedRoi.toFixed(2)}x is below \${MIN_PROJECTED_ROI.toFixed(2)}x \` +
            \`(expected \${goal.expectedRevenueCents}c / cost \${estimatedCostCents}c).\`;
          this.params.db.prepare(
            "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
          ).run(\`orchestrator.review_feedback.\${goal.id}\`, feedback);
          this.params.db.prepare(
            "UPDATE task_graph SET status = 'blocked' WHERE goal_id = ? AND status = 'pending'",
          ).run(goal.id);
          updateGoalStatus(this.params.db, goal.id, "paused");
          return { ...state, phase: "idle", goalId: null };
        }

        // An approved (within-ceiling) plan clears any prior rejection history`,
  "minimum projected ROI gate",
);
replaceExact(
  "src/orchestration/orchestrator.ts",
`      for (const task of assignedTasks) {
        const alive = this.params.isWorkerAlive(task.assignedTo!);`,
`      for (const task of assignedTasks) {
        if (task.assignedTo?.startsWith("local://")) {
          continue;
        }
        const alive = this.params.isWorkerAlive(task.assignedTo!);`,
  "skip per-tick local-worker stale recovery",
);

// ---------------------------------------------------------------------------
// Registry discovery: public Base RPC observed a hard 2,000-block getLogs cap.
// Bound both per-request range and total requests to avoid long zero-result scans.
// ---------------------------------------------------------------------------
replaceExact(
  "src/registry/erc8004.ts",
`    // Paginate backward in ≤10K-block chunks (newest-first).
    // Base public RPC enforces a 10,000-block limit on eth_getLogs.
    const MAX_BLOCK_RANGE = 10_000n;
    const MAX_CONSECUTIVE_FAILURES = 5;`,
`    // Public Base RPC currently rejects eth_getLogs ranges above 2,000 blocks.
    // Keep total scanning bounded as well so discovery cannot burn minutes on RPC retries.
    const MAX_BLOCK_RANGE = 2_000n;
    const MAX_CHUNKS = 25;
    const MAX_CONSECUTIVE_FAILURES = 5;`,
  "bound Base event-scan range",
);
replaceExact(
  "src/registry/erc8004.ts",
`    let scanTo = currentBlock;
    let consecutiveFailures = 0;

    while (scanTo > earliestBlock) {`,
`    let scanTo = currentBlock;
    let consecutiveFailures = 0;
    let chunksScanned = 0;

    while (scanTo > earliestBlock && chunksScanned < MAX_CHUNKS) {
      chunksScanned += 1;`,
  "bound Base event-scan chunk count",
);
replaceExact(
  "src/registry/erc8004.ts",
`logger.info(\`Event scan found \${agents.length} minted agents (scanned \${allLogs.length} Transfer events across \${Math.ceil(Number(currentBlock - earliestBlock) / Number(MAX_BLOCK_RANGE))} chunks)\`);`,
`logger.info(\`Event scan found \${agents.length} minted agents (scanned \${allLogs.length} Transfer events across \${chunksScanned} bounded chunks)\`);`,
  "accurate bounded event-scan logging",
);

console.log("\nlaunch-candidate-v1 economic and reliability safeguards applied.");
