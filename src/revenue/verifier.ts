import {
  createPublicClient,
  decodeEventLog,
  http,
  isAddress,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { base } from "viem/chains";
import type { RevenueReceivable } from "./store.js";

export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
export const MIN_REVENUE_CONFIRMATIONS = 2n;

const TRANSFER_ABI = [{
  anonymous: false,
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
  name: "Transfer",
  type: "event",
}] as const;

export interface RevenueTransfer {
  tokenAddress: string;
  from: string;
  to: string;
  valueAtomic: bigint;
}

export interface RevenueTxEvidence {
  txHash: string;
  success: boolean;
  blockNumber: bigint;
  blockTimestampSeconds: bigint;
  transfers: RevenueTransfer[];
}

export interface RevenueChainReader {
  getCurrentBlockNumber(): Promise<bigint>;
  getTransactionEvidence(txHash: string): Promise<RevenueTxEvidence>;
}

export type RevenueVerificationResult =
  | { verified: true; txHash: string; amountCents: number; blockNumber: bigint }
  | { verified: false; reason: string };

function lower(address: string): string { return address.toLowerCase(); }

export function createBaseRevenueChainReader(rpcUrl?: string): RevenueChainReader {
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl || process.env.AUTOMATON_RPC_URL || undefined, { timeout: 10_000 }),
  });

  return {
    async getCurrentBlockNumber(): Promise<bigint> {
      return client.getBlockNumber();
    },
    async getTransactionEvidence(txHash: string): Promise<RevenueTxEvidence> {
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("invalid transaction hash");
      const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      const transfers: RevenueTransfer[] = [];
      for (const log of receipt.logs as Log[]) {
        if (lower(log.address) !== lower(BASE_USDC_ADDRESS)) continue;
        try {
          const decoded = decodeEventLog({
            abi: TRANSFER_ABI,
            eventName: "Transfer",
            data: log.data,
            topics: log.topics,
            strict: true,
          });
          const args = decoded.args as { from: Address; to: Address; value: bigint };
          transfers.push({
            tokenAddress: log.address,
            from: args.from,
            to: args.to,
            valueAtomic: args.value,
          });
        } catch {
          // Ignore non-Transfer USDC logs.
        }
      }
      return {
        txHash: receipt.transactionHash.toLowerCase(),
        success: receipt.status === "success",
        blockNumber: receipt.blockNumber,
        blockTimestampSeconds: block.timestamp,
        transfers,
      };
    },
  };
}

export async function verifyBaseUsdcRevenuePayment(input: {
  reader: RevenueChainReader;
  receivable: RevenueReceivable;
  walletAddress: string;
  excludedPayerAddresses: string[];
  txHash: string;
}): Promise<RevenueVerificationResult> {
  if (!isAddress(input.walletAddress)) return { verified: false, reason: "automaton wallet is not a valid EVM address" };
  if (!isAddress(input.receivable.payerAddress)) return { verified: false, reason: "receivable payer is not a valid EVM address" };
  const payer = lower(input.receivable.payerAddress);
  const wallet = lower(input.walletAddress);
  if (payer === wallet) return { verified: false, reason: "self-payments cannot be revenue" };
  const excluded = new Set(input.excludedPayerAddresses.filter((address) => isAddress(address)).map(lower));
  if (excluded.has(payer)) return { verified: false, reason: "known creator/parent/child funding address cannot be revenue payer" };
  if (input.receivable.status !== "open") return { verified: false, reason: `receivable is not open (status=${input.receivable.status})` };
  if (Date.parse(input.receivable.expiresAt) < Date.now()) return { verified: false, reason: "receivable expired" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) return { verified: false, reason: "invalid transaction hash" };

  let evidence: RevenueTxEvidence;
  let currentBlock: bigint;
  try {
    [evidence, currentBlock] = await Promise.all([
      input.reader.getTransactionEvidence(input.txHash),
      input.reader.getCurrentBlockNumber(),
    ]);
  } catch (error) {
    return { verified: false, reason: `chain verification failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (lower(evidence.txHash) !== lower(input.txHash)) return { verified: false, reason: "RPC returned evidence for a different transaction" };
  if (!evidence.success) return { verified: false, reason: "transaction reverted" };
  if (evidence.blockNumber <= BigInt(input.receivable.createdBlockNumber)) {
    return { verified: false, reason: "payment block is not after receivable creation" };
  }
  const confirmations = currentBlock >= evidence.blockNumber
    ? currentBlock - evidence.blockNumber + 1n
    : 0n;
  if (confirmations < MIN_REVENUE_CONFIRMATIONS) {
    return { verified: false, reason: `payment has only ${confirmations} confirmation(s); ${MIN_REVENUE_CONFIRMATIONS} required` };
  }
  const paidAtMs = Number(evidence.blockTimestampSeconds) * 1000;
  if (!Number.isSafeInteger(paidAtMs)) return { verified: false, reason: "payment timestamp outside safe range" };
  if (paidAtMs > Date.parse(input.receivable.expiresAt)) return { verified: false, reason: "payment arrived after receivable expiry" };

  const expectedAtomic = BigInt(input.receivable.expectedAmountCents) * 10_000n;
  const receivedAtomic = evidence.transfers
    .filter((transfer) =>
      lower(transfer.tokenAddress) === lower(BASE_USDC_ADDRESS) &&
      lower(transfer.from) === payer &&
      lower(transfer.to) === wallet
    )
    .reduce((total, transfer) => total + transfer.valueAtomic, 0n);
  if (receivedAtomic !== expectedAtomic) {
    return { verified: false, reason: `exact USDC amount mismatch: expected ${expectedAtomic} atomic units, received ${receivedAtomic}` };
  }

  return {
    verified: true,
    txHash: input.txHash.toLowerCase(),
    amountCents: input.receivable.expectedAmountCents,
    blockNumber: evidence.blockNumber,
  };
}
