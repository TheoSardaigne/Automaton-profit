import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, getGoalById, insertGoal } from "../state/database.js";
import type { RevenueChainReader, RevenueTxEvidence } from "../revenue/verifier.js";
import { BASE_USDC_ADDRESS, verifyBaseUsdcRevenuePayment } from "../revenue/verifier.js";
import { createRevenueReceivable, getRevenueReceivable, recordVerifiedRevenue } from "../revenue/store.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const PAYER = "0x2222222222222222222222222222222222222222";
const CREATOR = "0x3333333333333333333333333333333333333333";
const TX = "0x" + "ab".repeat(32);

function reader(overrides: Partial<RevenueTxEvidence> = {}, currentBlock = 102n): RevenueChainReader {
  const evidence: RevenueTxEvidence = {
    txHash: TX,
    success: true,
    blockNumber: 101n,
    blockTimestampSeconds: BigInt(Math.floor(Date.now() / 1000)),
    transfers: [{ tokenAddress: BASE_USDC_ADDRESS, from: PAYER, to: WALLET, valueAtomic: 1_000_000n }],
    ...overrides,
  };
  return {
    getCurrentBlockNumber: async () => currentBlock,
    getTransactionEvidence: async () => evidence,
  };
}

describe("verified revenue attribution v3", () => {
  const databases: ReturnType<typeof createDatabase>[] = [];
  afterEach(() => { while (databases.length) databases.pop()!.close(); });

  function setup(amountCents = 100, goalId?: string) {
    const db = createDatabase(":memory:");
    databases.push(db);
    const receivable = createRevenueReceivable(db.raw, {
      payerAddress: PAYER,
      expectedAmountCents: amountCents,
      purpose: "Paid test service",
      goalId,
      createdBlockNumber: 100n,
      expiresInHours: 24,
    });
    return { db, receivable };
  }

  it("migration creates the receivables table and a pre-payment receivable", () => {
    const { db, receivable } = setup();
    expect(receivable.status).toBe("open");
    const row = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='revenue_receivables'").get();
    expect(row).toBeDefined();
  });

  it("verifies an exact external USDC payment after creation with two confirmations", async () => {
    const { receivable } = setup();
    const result = await verifyBaseUsdcRevenuePayment({
      reader: reader(), receivable, walletAddress: WALLET, excludedPayerAddresses: [CREATOR], txHash: TX,
    });
    expect(result.verified).toBe(true);
    if (result.verified) expect(result.amountCents).toBe(100);
  });

  it("rejects retroactive attribution, insufficient confirmations, wrong amount, and internal funding", async () => {
    const { receivable } = setup();
    const retro = await verifyBaseUsdcRevenuePayment({
      reader: reader({ blockNumber: 100n }), receivable, walletAddress: WALLET, excludedPayerAddresses: [], txHash: TX,
    });
    expect(retro.verified).toBe(false);

    const shallow = await verifyBaseUsdcRevenuePayment({
      reader: reader({}, 101n), receivable, walletAddress: WALLET, excludedPayerAddresses: [], txHash: TX,
    });
    expect(shallow.verified).toBe(false);

    const wrongAmount = await verifyBaseUsdcRevenuePayment({
      reader: reader({ transfers: [{ tokenAddress: BASE_USDC_ADDRESS, from: PAYER, to: WALLET, valueAtomic: 990_000n }] }),
      receivable, walletAddress: WALLET, excludedPayerAddresses: [], txHash: TX,
    });
    expect(wrongAmount.verified).toBe(false);

    const internal = await verifyBaseUsdcRevenuePayment({
      reader: reader(), receivable, walletAddress: WALLET, excludedPayerAddresses: [PAYER], txHash: TX,
    });
    expect(internal.verified).toBe(false);
  });

  it("records verified revenue exactly once and increments attributed goal revenue", async () => {
    const db = createDatabase(":memory:");
    databases.push(db);
    const goalId = insertGoal(db.raw, { title: "Sell service", description: "test", expectedRevenueCents: 100 });
    const receivable = createRevenueReceivable(db.raw, {
      payerAddress: PAYER, expectedAmountCents: 100, purpose: "Paid test service", goalId, createdBlockNumber: 100n, expiresInHours: 24,
    });
    const result = await verifyBaseUsdcRevenuePayment({ reader: reader(), receivable, walletAddress: WALLET, excludedPayerAddresses: [], txHash: TX });
    expect(result.verified).toBe(true);
    if (!result.verified) throw new Error(result.reason);
    const recorded = recordVerifiedRevenue(db.raw, { receivableId: receivable.id, txHash: result.txHash, amountCents: result.amountCents });
    expect(recorded.status).toBe("verified");
    const earned = db.getRecentTransactions(10).filter((tx) => tx.type === "earned_revenue");
    expect(earned).toHaveLength(1);
    expect(earned[0].amountCents).toBe(100);
    expect(getGoalById(db.raw, goalId)?.actualRevenueCents).toBe(100);
    expect(() => recordVerifiedRevenue(db.raw, { receivableId: receivable.id, txHash: TX, amountCents: 100 })).toThrow();
    expect(db.getRecentTransactions(10).filter((tx) => tx.type === "earned_revenue")).toHaveLength(1);
  });

  it("does not expose a direct model-facing earned_revenue transaction primitive", async () => {
    const toolsSource = await import("node:fs/promises").then((fs) => fs.readFile("src/agent/tools.ts", "utf8"));
    expect(toolsSource).not.toContain('type: "earned_revenue"');
    expect(toolsSource).toContain('name: "create_revenue_receivable"');
    expect(toolsSource).toContain('name: "verify_revenue_payment"');
    expect(getRevenueReceivable).toBeTypeOf("function");
  });
});
