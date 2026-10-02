#!/usr/bin/env node
import fs from "node:fs";

function replaceExact(file, before, after, label) {
  const current = fs.readFileSync(file, "utf8");
  if (!current.includes(before)) {
    throw new Error(`[${label}] source context not found in ${file}`);
  }
  fs.writeFileSync(file, current.replace(before, after), "utf8");
  console.log(`OK  ${label}`);
}

// 1) Every AUTOMATIC USDC -> compute path requires BOTH switches.
replaceExact(
  "src/heartbeat/tasks.ts",
`    // Profit-safety: never convert treasury USDC into compute unless explicitly enabled.
    if (taskCtx.config.autoTopupEnabled !== true) {
      return { shouldWake: false };
    }`,
`    // Profit-safety: automatic treasury -> compute conversion requires both
    // the automatic-topup switch and the paid-compute master switch.
    if (
      taskCtx.config.autoTopupEnabled !== true ||
      taskCtx.config.allowPaidComputeTopup !== true
    ) {
      return { shouldWake: false };
    }`,
  "heartbeat requires both paid-compute switches",
);

replaceExact(
  "src/agent/loop.ts",
`              if (is402) {
                const SANDBOX_TOPUP_COOLDOWN_MS = 60_000;`,
`              if (
                is402 &&
                config.autoTopupEnabled === true &&
                config.allowPaidComputeTopup === true
              ) {
                const SANDBOX_TOPUP_COOLDOWN_MS = 60_000;`,
  "orchestrator sandbox retry topup requires both switches",
);

replaceExact(
  "src/agent/loop.ts",
`        if (
          config.autoTopupEnabled === true &&
          (tier === "critical" || tier === "low_compute") &&`,
`        if (
          config.autoTopupEnabled === true &&
          config.allowPaidComputeTopup === true &&
          (tier === "critical" || tier === "low_compute") &&`,
  "inline loop topup requires both switches",
);

replaceExact(
  "src/agent/tools.ts",
`          if (is402) {
            const COOLDOWN_MS = 60_000;`,
`          if (
            is402 &&
            ctx.config.autoTopupEnabled === true &&
            ctx.config.allowPaidComputeTopup === true
          ) {
            const COOLDOWN_MS = 60_000;`,
  "tool sandbox retry topup requires both switches",
);

// 2) Align old tests that intentionally codified unsafe behavior.
replaceExact(
  "src/__tests__/heartbeat.test.ts",
`    it("wakes when has USDC but critically low credits", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 0, // critical tier
        usdcBalance: 10.0, // > 5
        survivalTier: "critical",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.check_usdc_balance(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(true);
      expect(result.message).toContain("USDC");
    });`,
`    it("does not wake or spend when paid compute topups are disabled by default", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 0,
        usdcBalance: 10.0,
        survivalTier: "critical",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.check_usdc_balance(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      expect(db.getKV("last_auto_topup_attempt")).toBeUndefined();
    });`,
  "heartbeat test reflects default no-spend policy",
);

replaceExact(
  "src/__tests__/orchestration/orchestrator.test.ts",
`    it("supervised mode stays in plan_review (awaiting human approval)", async () => {
      const goalId = insertGoal(db);
      insertTask(db, { goalId, title: "t1", description: "desc" });
      storePlan(db, goalId);
      setOrchestratorState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      // We need reviewPlan to throw "awaiting human approval". The orchestrator calls it with mode: "auto".
      // To get supervised behavior we mock the plan-mode module.
      // The simplest way: store a plan that will trigger the supervised path by mocking vi.mock at module level.
      // Instead we test the error-catch path by making the orchestrator's handlePlanReviewPhase catch it:
      // The orchestrator calls reviewPlan with mode:"auto". In auto mode it always approves.
      // To test supervised mode catching, we verify the catch branch indirectly:
      // inject a plan with a very high cost to ensure the auto-approve path runs.
      storePlan(db, goalId, { estimatedTotalCostCents: 9999 });
      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      // auto mode approves above threshold too, so we get executing
      expect(result.phase).toBe("executing");
    });`,
`    it("pauses a goal when the automatic plan exceeds the budget ceiling", async () => {
      const goalId = insertGoal(db);
      insertTask(db, { goalId, title: "t1", description: "desc" });
      storePlan(db, goalId, { estimatedTotalCostCents: 9999 });
      setOrchestratorState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db);
      const result = await orc.tick();

      expect(result.phase).toBe("idle");
      const goal = db.prepare("SELECT status FROM goals WHERE id = ?").get(goalId) as { status: string };
      expect(goal.status).toBe("paused");
      const feedback = db.prepare("SELECT value FROM kv WHERE key = ?").get(
        "orchestrator.review_feedback." + goalId,
      ) as { value: string } | undefined;
      expect(feedback?.value).toContain("exceeds auto budget threshold");
    });`,
  "orchestrator test reflects fail-closed budget ceiling",
);

// 3) Add a static regression suite covering every known paid-compute path.
const safetyTest = `import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => fs.readFileSync(path.resolve(here, "..", rel), "utf8");

describe("profit-engine paid-compute launch guards", () => {
  it("keeps paid compute disabled by default", () => {
    const types = src("types.ts");
    expect(types).toContain("autoTopupEnabled: false");
    expect(types).toContain("allowPaidComputeTopup: false");
    expect(types).toContain("maxPaidComputeTopupUsd: 5");
  });

  it("gates startup bootstrap on both switches", () => {
    const index = src("index.ts");
    expect(index).toMatch(/autoTopupEnabled === true && config\.allowPaidComputeTopup === true/);
  });

  it("gates heartbeat and both loop automatic topup paths on the master switch", () => {
    const heartbeat = src("heartbeat/tasks.ts");
    const loop = src("agent/loop.ts");
    expect(heartbeat).toContain("taskCtx.config.allowPaidComputeTopup !== true");
    expect((loop.match(/allowPaidComputeTopup === true/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("gates tool-initiated paid topups and sandbox retry topups", () => {
    const tools = src("agent/tools.ts");
    expect(tools).toContain("ctx.config.allowPaidComputeTopup !== true");
    expect(tools).toContain("ctx.config.autoTopupEnabled === true");
    expect(tools).toContain("ctx.config.allowPaidComputeTopup === true");
  });
});
`;
fs.writeFileSync("src/__tests__/profit-engine-safety.test.ts", safetyTest, "utf8");
console.log("OK  paid-compute regression suite");

console.log("\nprofit-engine-v2 safety edits applied.");
