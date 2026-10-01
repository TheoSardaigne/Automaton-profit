#!/usr/bin/env node
/**
 * Automaton-profit — profit-engine-v1 codemod
 * Base expected: Conway/Automaton commit d8f816881fd24b6f5e3d616e59edec387a447667
 *
 * Run from repository root:
 *   node scripts/apply-profit-engine-v1.mjs
 *
 * The script uses exact source replacements and aborts on any mismatch.
 */
import fs from "node:fs";

function replaceExact(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  if (!current.includes(before)) {
    throw new Error(`[${label}] Source context not found in ${file}. Aborting without guessing.`);
  }
  const next = current.replace(before, after);
  fs.writeFileSync(file, next, "utf8");
  console.log(`OK  ${label}`);
}

function replaceOnce(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  const first = current.indexOf(before);
  if (first === -1) {
    throw new Error(`[${label}] Source context not found in ${file}.`);
  }
  if (current.indexOf(before, first + before.length) !== -1) {
    throw new Error(`[${label}] Source context occurs more than once in ${file}; refusing ambiguous edit.`);
  }
  fs.writeFileSync(file, current.slice(0, first) + after + current.slice(first + before.length), "utf8");
  console.log(`OK  ${label}`);
}

// 1) Opt-in automatic compute topups.
replaceExact(
  "src/types.ts",
`  socialRelayUrl?: string;
  treasuryPolicy?: TreasuryPolicy;
  // Phase 2 config additions`,
`  socialRelayUrl?: string;
  treasuryPolicy?: TreasuryPolicy;
  /**
   * Allow the runtime to automatically spend wallet USDC on Conway compute.
   * Profit experiments default to false so low compute cannot silently drain treasury.
   */
  autoTopupEnabled?: boolean;
  // Phase 2 config additions`,
  "config.autoTopupEnabled type",
);

replaceExact(
  "src/types.ts",
`  childSandboxMemoryMb: 1024,
  socialRelayUrl: "https://social.conway.tech",
};`,
`  childSandboxMemoryMb: 1024,
  socialRelayUrl: "https://social.conway.tech",
  autoTopupEnabled: false,
};`,
  "config.autoTopupEnabled default",
);

replaceOnce(
  "src/agent/loop.ts",
`        if ((tier === "critical" || tier === "low_compute") && financial.usdcBalance >= 5) {`,
`        if (
          config.autoTopupEnabled === true &&
          (tier === "critical" || tier === "low_compute") &&
          financial.usdcBalance >= 5
        ) {`,
  "disable inline auto-topup by default",
);

replaceExact(
  "src/heartbeat/tasks.ts",
`    const MIN_TOPUP_USD = 5;
    if (balance >= MIN_TOPUP_USD && (ctx.survivalTier === "critical" || ctx.survivalTier === "dead")) {`,
`    // Profit-safety: never convert treasury USDC into compute unless explicitly enabled.
    if (taskCtx.config.autoTopupEnabled !== true) {
      return { shouldWake: false };
    }

    const MIN_TOPUP_USD = 5;
    if (balance >= MIN_TOPUP_USD && (ctx.survivalTier === "critical" || ctx.survivalTier === "dead")) {`,
  "disable heartbeat auto-topup by default",
);

// 2) Fix auto-budget review.
replaceExact(
  "src/orchestration/plan-mode.ts",
`    case "auto": {
      if (plan.estimatedTotalCostCents > normalized.autoBudgetThreshold) {
        return {
          approved: true,
          feedback: \`Auto-approved above threshold (\${plan.estimatedTotalCostCents} > \${normalized.autoBudgetThreshold}).\`,
        };
      }
      return { approved: true };
    }`,
`    case "auto": {
      if (plan.estimatedTotalCostCents > normalized.autoBudgetThreshold) {
        return {
          approved: false,
          feedback:
            \`Plan cost \${plan.estimatedTotalCostCents} cents exceeds auto budget threshold \` +
            \`\${normalized.autoBudgetThreshold} cents.\`,
        };
      }
      return { approved: true };
    }`,
  "enforce auto budget threshold",
);

replaceExact(
  "src/__tests__/orchestration/plan-mode.test.ts",
`    it("auto mode approves above threshold with feedback", async () => {
      const result = await reviewPlan(makePlan({ estimatedTotalCostCents: 9000 }), autoConfig);
      expect(result.approved).toBe(true);
      expect(result.feedback).toContain("Auto-approved above threshold");
    });`,
`    it("auto mode rejects above threshold with feedback", async () => {
      const result = await reviewPlan(makePlan({ estimatedTotalCostCents: 9000 }), autoConfig);
      expect(result.approved).toBe(false);
      expect(result.feedback).toContain("exceeds auto budget threshold");
    });`,
  "test budget rejection",
);

replaceExact(
  "src/__tests__/orchestration/plan-mode.test.ts",
`      expect(result.approved).toBe(true);
      expect(result.feedback).toContain("5000");`,
`      expect(result.approved).toBe(false);
      expect(result.feedback).toContain("5000");`,
  "test normalized budget rejection",
);

// 3) Persist expected revenue on goals.
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
  "createGoal signature",
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
  const normalizedExpectedRevenueCents = Math.floor(expectedRevenueCents);

  const id = insertGoal(db, {
    title: normalizedTitle,
    description: normalizedDescription,
    strategy: strategy ?? null,
    expectedRevenueCents: normalizedExpectedRevenueCents,
  });`,
  "createGoal expected revenue persistence",
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
              "Conservative expected external revenue in cents if the goal succeeds. " +
              "Use 0 only for maintenance/non-revenue goals.",
          },
        },
        required: ["title", "description", "expected_revenue_cents"],`,
  "create_goal schema expected revenue",
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
          !Number.isFinite(expectedRevenueCents) ||
          expectedRevenueCents < 0 ||
          !Number.isInteger(expectedRevenueCents)
        ) {
          return "Error: expected_revenue_cents must be a non-negative integer.";
        }`,
  "create_goal expected revenue validation",
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
          \`Goal created: "\${goal.title}" (id: \${goal.id}, status: \${goal.status}, expected revenue: \${goal.expectedRevenueCents} cents)\\n\` +`,
  "create_goal pass expected revenue",
);

replaceExact(
  "src/__tests__/orchestration/task-graph.test.ts",
`    it("trims title and description", () => {
      const goal = createGoal(db, "  Build Thing  ", "  With details  ");
      const stored = getGoalById(db, goal.id);
      expect(stored?.title).toBe("Build Thing");
      expect(stored?.description).toBe("With details");
    });`,
`    it("trims title and description", () => {
      const goal = createGoal(db, "  Build Thing  ", "  With details  ");
      const stored = getGoalById(db, goal.id);
      expect(stored?.title).toBe("Build Thing");
      expect(stored?.description).toBe("With details");
    });

    it("persists conservative expected revenue", () => {
      const goal = createGoal(db, "Sell service", "Deliver paid work", "profit-first", 1250);
      const stored = getGoalById(db, goal.id);
      expect(stored?.expectedRevenueCents).toBe(1250);
      expect(goal.expectedRevenueCents).toBe(1250);
    });`,
  "test expected revenue persistence",
);

// 4) ROI gate + pause instead of infinite review/replan loop.
replaceExact(
  "src/orchestration/orchestrator.ts",
`    const planKey = \`orchestrator.plan.\${state.goalId}\`;`,
`    const goal = getGoalById(this.params.db, state.goalId);
    if (!goal) {
      return { ...state, phase: "idle", goalId: null };
    }

    const planKey = \`orchestrator.plan.\${state.goalId}\`;`,
  "plan review loads goal economics",
);

replaceExact(
  "src/orchestration/orchestrator.ts",
`    const planData = safeJsonParse(planRow.value);
    if (!planData) {
      return { ...state, phase: "executing" };
    }

    try {`,
`    const planData = safeJsonParse(planRow.value);
    if (!planData) {
      return { ...state, phase: "executing" };
    }

    const estimatedTotalCostCents =
      typeof planData.estimatedTotalCostCents === "number" &&
      Number.isFinite(planData.estimatedTotalCostCents)
        ? Math.max(0, Math.floor(planData.estimatedTotalCostCents))
        : 0;

    // Profit-safety: revenue goals must project at least 2x revenue/cost.
    // A rejected goal is paused rather than sent through an unbounded review loop.
    const MIN_PROJECTED_ROI = 2;
    if (
      goal.expectedRevenueCents > 0 &&
      estimatedTotalCostCents > 0 &&
      goal.expectedRevenueCents / estimatedTotalCostCents < MIN_PROJECTED_ROI
    ) {
      const projectedRoi = goal.expectedRevenueCents / estimatedTotalCostCents;
      const feedback =
        \`Projected ROI \${projectedRoi.toFixed(2)}x is below required \${MIN_PROJECTED_ROI.toFixed(2)}x \` +
        \`(expected revenue \${goal.expectedRevenueCents}c, plan cost \${estimatedTotalCostCents}c).\`;

      this.params.db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      ).run(\`orchestrator.review_feedback.\${state.goalId}\`, feedback);
      updateGoalStatus(this.params.db, state.goalId, "paused");
      logger.warn("Goal paused by projected ROI guard", {
        goalId: state.goalId,
        expectedRevenueCents: goal.expectedRevenueCents,
        estimatedTotalCostCents,
        projectedRoi,
      });
      return { ...DEFAULT_STATE };
    }

    try {`,
  "projected ROI guard",
);

replaceExact(
  "src/orchestration/orchestrator.ts",
`      this.params.db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      ).run(\`orchestrator.review_feedback.\${state.goalId}\`, result.feedback ?? "Plan rejected");

      return { ...state, phase: "planning" };`,
`      this.params.db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      ).run(\`orchestrator.review_feedback.\${state.goalId}\`, result.feedback ?? "Plan rejected");

      // Do not spend more inference repeatedly regenerating a plan that violated
      // the automatic budget. Pause it for explicit review or a cheaper redesign.
      updateGoalStatus(this.params.db, state.goalId, "paused");
      return { ...DEFAULT_STATE };`,
  "pause rejected plans",
);

// 5) Correct cashflow accounting.
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
      let inflowCents = 0;
      let expenseCents = 0;
      let computeTopupCents = 0;

      for (const tx of transactions) {
        const amount = Math.max(0, Math.floor(tx.amountCents ?? 0));
        if (amount === 0) continue;

        // transfer_in is cash/credit inflow, but not necessarily earned revenue:
        // it can also be creator funding or recalled child funds.
        if (tx.type === "transfer_in") {
          inflowCents += amount;
          continue;
        }

        // A credit purchase spends wallet USDC on compute. It is an expense,
        // never revenue.
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
  "cashflow classification",
);

replaceExact(
  "src/heartbeat/tasks.ts",
`      const report = {
        timestamp: new Date().toISOString(),
        revenueCents,
        expenseCents,
        netCents: revenueCents - expenseCents,
        fundedToChildrenCents: childFunding.total,
        taskExecutionCostCents: taskCosts.total,`,
`      const report = {
        timestamp: new Date().toISOString(),
        // Do not label generic incoming transfers as earned revenue.
        inflowCents,
        expenseCents,
        computeTopupCents,
        netCashflowCents: inflowCents - expenseCents,
        // Backward-compatible fields. "revenueCents" now excludes credit purchases.
        revenueCents: inflowCents,
        netCents: inflowCents - expenseCents,
        fundedToChildrenCents: childFunding.total,
        taskExecutionCostCents: taskCosts.total,`,
  "cashflow report fields",
);

console.log("\nprofit-engine-v1 source edits applied.");
console.log("Next: run `pnpm test` and `pnpm build` before committing.");
