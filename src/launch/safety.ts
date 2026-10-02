/**
 * Profit launch-candidate safety invariants.
 *
 * This module deliberately contains only deterministic policy/config helpers.
 * No network access, wallet access, or model reasoning can weaken these limits.
 */

import type { AutomatonConfig, ModelStrategyConfig, TreasuryPolicy } from "../types.js";

export const PROFIT_LAUNCH_INFERENCE_CAPS = Object.freeze({
  hourlyBudgetCents: 200,
  sessionBudgetCents: 100,
  perCallCeilingCents: 25,
  maxTurnsPerCycle: 10,
});

/**
 * Tools that are not necessarily marked dangerous but still create an
 * external, paid, or irreversible side effect. All dangerous tools are also
 * denied by the policy rule while launch mode is enabled.
 */
export const PROFIT_LAUNCH_BLOCKED_TOOLS = new Set<string>([
  "topup_credits",
  "transfer_credits",
  "fund_child",
  "x402_fetch",
  "create_sandbox",
  "spawn_child",
  "start_child",
  "register_domain",
  "manage_dns",
  "register_erc8004",
  "give_feedback",
  "expose_port",
  "remove_port",
  "send_message",
  "message_child",
  "git_push",
]);

export function assertLaunchCandidateConfig(config: AutomatonConfig): void {
  const problems: string[] = [];
  if (config.profitLaunchMode !== true) {
    problems.push("profitLaunchMode must be true");
  }
  if (config.autoTopupEnabled === true) {
    problems.push("autoTopupEnabled must be false");
  }
  if (config.allowPaidComputeTopup === true) {
    problems.push("allowPaidComputeTopup must be false");
  }
  if (problems.length > 0) {
    throw new Error(
      `Launch-candidate safety preflight failed: ${problems.join("; ")}. Refusing autonomous startup.`,
    );
  }
}

function capped(configured: number, ceiling: number): number {
  if (!Number.isFinite(configured) || configured <= 0) return ceiling;
  return Math.min(configured, ceiling);
}

export function applyLaunchInferenceCaps(
  strategy: ModelStrategyConfig,
): ModelStrategyConfig {
  return {
    ...strategy,
    hourlyBudgetCents: capped(strategy.hourlyBudgetCents, PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents),
    sessionBudgetCents: capped(strategy.sessionBudgetCents, PROFIT_LAUNCH_INFERENCE_CAPS.sessionBudgetCents),
    perCallCeilingCents: capped(strategy.perCallCeilingCents, PROFIT_LAUNCH_INFERENCE_CAPS.perCallCeilingCents),
  };
}

export function capLaunchCycleTurns(configured: number | undefined): number {
  const normalized = Number.isFinite(configured) && Number(configured) > 0
    ? Math.floor(Number(configured))
    : PROFIT_LAUNCH_INFERENCE_CAPS.maxTurnsPerCycle;
  return Math.min(normalized, PROFIT_LAUNCH_INFERENCE_CAPS.maxTurnsPerCycle);
}

export function applyLaunchTreasuryLock(policy: TreasuryPolicy): TreasuryPolicy {
  return {
    ...policy,
    maxSingleTransferCents: 0,
    maxHourlyTransferCents: 0,
    maxDailyTransferCents: 0,
    maxX402PaymentCents: 0,
    x402AllowedDomains: [],
    maxTransfersPerTurn: 0,
    requireConfirmationAboveCents: 0,
    maxInferenceDailyCents: Math.min(
      policy.maxInferenceDailyCents > 0 ? policy.maxInferenceDailyCents : PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents,
      PROFIT_LAUNCH_INFERENCE_CAPS.hourlyBudgetCents,
    ),
  };
}
