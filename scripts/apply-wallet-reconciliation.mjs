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

replaceExact(
  "src/heartbeat/tasks.ts",
  `  colony_financial_report: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {`,
  `  colony_financial_report: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {`,
  "use tick wallet balance in financial report",
);

replaceExact(
  "src/heartbeat/tasks.ts",
  `      const operatingProfitCents = earnedRevenueCents - expenseCents;
      const netCashflowCents = earnedRevenueCents + inflowCents - expenseCents;
      const report = {
        timestamp: new Date().toISOString(),
        earnedRevenueCents,
        inflowCents,
        expenseCents,
        computeTopupCents,
        operatingProfitCents,
        netCashflowCents,`,
  `      const operatingProfitCents = earnedRevenueCents - expenseCents;
      const netCashflowCents = earnedRevenueCents + inflowCents - expenseCents;

      // Reconcile the internal ledger against the on-chain USDC balance captured
      // once for this heartbeat tick. The wallet is the accounting source of
      // truth; a non-zero gap means the internal books are missing a real flow.
      const walletUsdcBalanceCents = Math.round(ctx.usdcBalance * 100);
      const baselineKey = "profit_launch.wallet_usdc_baseline_cents";
      const storedBaseline = Number(taskCtx.db.getKV(baselineKey));
      const walletUsdcBaselineCents = Number.isFinite(storedBaseline)
        ? storedBaseline
        : walletUsdcBalanceCents;
      if (!Number.isFinite(storedBaseline)) {
        taskCtx.db.setKV(baselineKey, String(walletUsdcBaselineCents));
      }
      const walletDeltaCents = walletUsdcBalanceCents - walletUsdcBaselineCents;
      const reconciliationGapCents = walletDeltaCents - netCashflowCents;

      const report = {
        timestamp: new Date().toISOString(),
        earnedRevenueCents,
        inflowCents,
        expenseCents,
        computeTopupCents,
        operatingProfitCents,
        netCashflowCents,
        walletUsdcBalanceCents,
        walletUsdcBaselineCents,
        walletDeltaCents,
        reconciliationGapCents,`,
  "wallet-vs-ledger reconciliation",
);

console.log("wallet reconciliation guard applied.");
