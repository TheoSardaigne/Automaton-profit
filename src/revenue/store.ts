import type BetterSqlite3 from "better-sqlite3";
import { ulid } from "ulid";

export type RevenueReceivableStatus = "open" | "verified" | "cancelled" | "expired";

export interface RevenueReceivable {
  id: string;
  chain: "eip155:8453";
  payerAddress: string;
  expectedAmountCents: number;
  purpose: string;
  goalId: string | null;
  status: RevenueReceivableStatus;
  createdBlockNumber: number;
  createdAt: string;
  expiresAt: string;
  verifiedTxHash: string | null;
  verifiedAmountCents: number | null;
  verifiedAt: string | null;
}

function deserialize(row: any): RevenueReceivable {
  return {
    id: row.id,
    chain: "eip155:8453",
    payerAddress: row.payer_address,
    expectedAmountCents: row.expected_amount_cents,
    purpose: row.purpose,
    goalId: row.goal_id ?? null,
    status: row.status as RevenueReceivableStatus,
    createdBlockNumber: row.created_block_number,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    verifiedTxHash: row.verified_tx_hash ?? null,
    verifiedAmountCents: row.verified_amount_cents ?? null,
    verifiedAt: row.verified_at ?? null,
  };
}

export function createRevenueReceivable(
  db: BetterSqlite3.Database,
  input: {
    payerAddress: string;
    expectedAmountCents: number;
    purpose: string;
    goalId?: string | null;
    createdBlockNumber: bigint;
    expiresInHours?: number;
  },
): RevenueReceivable {
  if (!Number.isSafeInteger(input.expectedAmountCents) || input.expectedAmountCents <= 0) {
    throw new Error("expectedAmountCents must be a positive safe integer");
  }
  const purpose = input.purpose.trim();
  if (!purpose || purpose.length > 500) {
    throw new Error("purpose must contain 1-500 characters");
  }
  const block = Number(input.createdBlockNumber);
  if (!Number.isSafeInteger(block) || block < 0) {
    throw new Error("createdBlockNumber is outside SQLite/JavaScript safe range");
  }
  const hours = input.expiresInHours ?? 168;
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
    throw new Error("expiresInHours must be between 1 and 720");
  }
  if (input.goalId) {
    const goal = db.prepare("SELECT 1 FROM goals WHERE id = ?").get(input.goalId);
    if (!goal) throw new Error("goalId does not exist");
  }

  const id = ulid();
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + Math.floor(hours * 3_600_000)).toISOString();
  db.prepare(
    `INSERT INTO revenue_receivables
      (id, chain, payer_address, expected_amount_cents, purpose, goal_id, status, created_block_number, created_at, expires_at)
     VALUES (?, 'eip155:8453', ?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).run(id, input.payerAddress.toLowerCase(), input.expectedAmountCents, purpose, input.goalId ?? null, block, createdAt, expiresAt);
  return getRevenueReceivable(db, id)!;
}

export function getRevenueReceivable(db: BetterSqlite3.Database, id: string): RevenueReceivable | undefined {
  const row = db.prepare("SELECT * FROM revenue_receivables WHERE id = ?").get(id) as any | undefined;
  return row ? deserialize(row) : undefined;
}

export function getRevenueReceivableByTxHash(db: BetterSqlite3.Database, txHash: string): RevenueReceivable | undefined {
  const row = db.prepare("SELECT * FROM revenue_receivables WHERE lower(verified_tx_hash) = lower(?)").get(txHash) as any | undefined;
  return row ? deserialize(row) : undefined;
}

export function expireStaleRevenueReceivables(db: BetterSqlite3.Database): number {
  const result = db.prepare(
    `UPDATE revenue_receivables SET status = 'expired'
       WHERE status = 'open' AND datetime(expires_at) < datetime('now')`,
  ).run();
  return result.changes;
}

/**
 * Atomically marks a previously-open receivable as verified and records the
 * only transaction type that the profit report treats as earned revenue.
 */
export function recordVerifiedRevenue(
  db: BetterSqlite3.Database,
  input: { receivableId: string; txHash: string; amountCents: number },
): RevenueReceivable {
  const txHash = input.txHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) throw new Error("invalid transaction hash");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("invalid verified amount");

  const execute = db.transaction(() => {
    const current = getRevenueReceivable(db, input.receivableId);
    if (!current) throw new Error("receivable not found");
    if (current.status !== "open") throw new Error(`receivable is not open (status=${current.status})`);
    if (Date.parse(current.expiresAt) < Date.now()) {
      db.prepare("UPDATE revenue_receivables SET status = 'expired' WHERE id = ? AND status = 'open'").run(current.id);
      throw new Error("receivable expired");
    }
    if (current.expectedAmountCents !== input.amountCents) throw new Error("verified amount does not match receivable");
    if (getRevenueReceivableByTxHash(db, txHash)) throw new Error("transaction hash already attributed");

    const verifiedAt = new Date().toISOString();
    const updated = db.prepare(
      `UPDATE revenue_receivables
          SET status = 'verified', verified_tx_hash = ?, verified_amount_cents = ?, verified_at = ?
        WHERE id = ? AND status = 'open'`,
    ).run(txHash, input.amountCents, verifiedAt, current.id);
    if (updated.changes !== 1) throw new Error("receivable verification lost an atomicity race");

    db.prepare(
      `INSERT INTO transactions (id, type, amount_cents, balance_after_cents, description)
       VALUES (?, 'earned_revenue', ?, NULL, ?)`,
    ).run(
      ulid(),
      input.amountCents,
      `Verified Base USDC revenue | receivable=${current.id} | tx=${txHash}`,
    );

    if (current.goalId) {
      db.prepare(
        "UPDATE goals SET actual_revenue_cents = actual_revenue_cents + ? WHERE id = ?",
      ).run(input.amountCents, current.goalId);
    }

    return getRevenueReceivable(db, current.id)!;
  });

  return execute();
}
