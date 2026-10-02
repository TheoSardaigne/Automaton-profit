import { describe, expect, it } from "vitest";
import type { AutomatonConfig, ModelStrategyConfig, PolicyRequest } from "../types.js";
import { DEFAULT_CONFIG, DEFAULT_MODEL_STRATEGY_CONFIG, DEFAULT_TREASURY_POLICY } from "../types.js";
import { createFinancialRules } from "../agent/policy-rules/financial.js";
import {
  PROFIT_LAUNCH_BLOCKED_TOOLS,
  PROFIT_LAUNCH_INFERENCE_CAPS,
  applyLaunchInferenceCaps,
  applyLaunchTreasuryLock,
  assertLaunchCandidateConfig,
  capLaunchCycleTurns,
} from "../launch/safety.js";

function config(overrides: Partial<AutomatonConfig> = {}): AutomatonConfig {
  return {
    ...(DEFAULT_CONFIG as AutomatonConfig),
    name: "test",
    genesisPrompt: "test",
    creatorAddress: "0xcreator",
    registeredWithConway: false,
    sandboxId: "sandbox",
    conwayApiKey: "key",
    walletAddress: "0xwallet",
    ...overrides,
  };
}

function request(toolName: string, riskLevel: "safe" | "caution" | "dangerous"): PolicyRequest {
  return {
    tool: {
      name: toolName,
      description: "test",
      category: "financial",
      riskLevel,
      parameters: {},
      execute: async () => "ok",
    },
    args: {},
    context: { config: config() } as PolicyRequest["context"],
    turnContext: {
      inputSource: "agent",
      turnToolCallCount: 0,
      sessionSpend: {} as PolicyRequest["turnContext"]["sessionSpend"],
    },
  };
}

describe("profit launch v2 safety", () => {
  it("defaults to fail-closed launch mode with paid topups off", () => {
    expect(DEFAULT_CONFIG.profitLaunchMode).toBe(true);
    expect(DEFAULT_CONFIG.autoTopupEnabled).toBe(false);
    expect(DEFAULT_CONFIG.allowPaidComputeTopup).toBe(false);
  });

  it("refuses startup when launch mode is disabled", () => {
    expect(() => assertLaunchCandidateConfig(config({ profitLaunchMode: false }))).toThrow(/profitLaunchMode/);
  });

  it("refuses startup when any wallet-funded compute automation is enabled", () => {
    expect(() => assertLaunchCandidateConfig(config({ autoTopupEnabled: true }))).toThrow(/autoTopupEnabled/);
    expect(() => assertLaunchCandidateConfig(config({ allowPaidComputeTopup: true }))).toThrow(/allowPaidComputeTopup/);
  });

  it("turns unlimited or excessive inference budgets into hard micro-budget caps", () => {
    const unlimited: ModelStrategyConfig = { ...DEFAULT_MODEL_STRATEGY_CONFIG };
    const capped = applyLaunchInferenceCaps(unlimited);
    expect(capped.hourlyBudgetCents).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents);
    expect(capped.sessionBudgetCents).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.sessionBudgetCents);
    expect(capped.perCallCeilingCents).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.perCallCeilingCents);

    const cheaper = applyLaunchInferenceCaps({
      ...unlimited,
      hourlyBudgetCents: 50,
      sessionBudgetCents: 40,
      perCallCeilingCents: 5,
    });
    expect(cheaper.hourlyBudgetCents).toBe(50);
    expect(cheaper.sessionBudgetCents).toBe(40);
    expect(cheaper.perCallCeilingCents).toBe(5);
  });

  it("caps cycle turns and zeroes autonomous transfer/x402 authority", () => {
    expect(capLaunchCycleTurns(100)).toBe(PROFIT_LAUNCH_INFERENCE_CAPS.maxTurnsPerCycle);
    const policy = applyLaunchTreasuryLock(DEFAULT_TREASURY_POLICY);
    expect(policy.maxSingleTransferCents).toBe(0);
    expect(policy.maxHourlyTransferCents).toBe(0);
    expect(policy.maxDailyTransferCents).toBe(0);
    expect(policy.maxX402PaymentCents).toBe(0);
    expect(policy.x402AllowedDomains).toEqual([]);
    expect(policy.maxTransfersPerTurn).toBe(0);
  });

  it("launch policy denies every dangerous tool plus explicit external-effect tools", () => {
    const rule = createFinancialRules(DEFAULT_TREASURY_POLICY).find((r) => r.id === "financial.profit_launch_lock");
    expect(rule).toBeDefined();
    expect(rule!.evaluate(request("edit_own_file", "dangerous"))?.action).toBe("deny");
    for (const name of PROFIT_LAUNCH_BLOCKED_TOOLS) {
      expect(rule!.evaluate(request(name, "caution"))?.action, name).toBe("deny");
    }
    expect(rule!.evaluate(request("read_file", "safe"))).toBeNull();
  });
});
