import { Server, Api } from "@stellar/stellar-sdk/rpc";
import { networkConfig } from "../transactions/networks";

export type TransactionInspectionStatus =
  | "TRANSACTION_NOT_SUPPLIED"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_PENDING"
  | "TRANSACTION_CONFIRMED"
  | "TRANSACTION_FAILED"
  | "TRANSACTION_INSPECTION_UNAVAILABLE"
  | "TRANSACTION_NETWORK_MISMATCH"
  | "TRANSACTION_INVALID_IDENTIFIER";

export interface TransactionInspectionResult {
  status: TransactionInspectionStatus;
  transactionHash: string | null;
  network: "testnet";
  endpoint: "https://soroban-testnet.stellar.org";
  observedAt: string;
  error?: string;
  httpStatus?: number;
}

function isValidTransactionHash(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

function isSecretMaterial(value: string): boolean {
  const v = value.trim();
  if (v.startsWith("S")) return true;
  const l = v.toLowerCase();
  return l.includes("secret") || l.includes("seed") || l.includes("mnemonic") || l.includes("private") || value.includes("S");
}

export async function inspectTransaction(
  input: { transactionHash?: string | null; network?: string; endpoint?: string; observedAt?: string },
  client?: { getTransaction: (hash: string) => Promise<{ status: string }> },
): Promise<TransactionInspectionResult> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const network = (input.network ?? "testnet") as "testnet";
  const endpoint = (input.endpoint ?? networkConfig("testnet").rpcUrl) as "https://soroban-testnet.stellar.org";
  const hash = input.transactionHash?.trim() ?? "";

  if (!hash) {
    return { status: "TRANSACTION_NOT_SUPPLIED", transactionHash: null, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
  }
  if (isSecretMaterial(hash)) {
    return { status: "TRANSACTION_INVALID_IDENTIFIER", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Secret material rejected." };
  }
  if (!isValidTransactionHash(hash)) {
    return { status: "TRANSACTION_INVALID_IDENTIFIER", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Invalid transaction hash format." };
  }
  if (network !== "testnet") {
    return { status: "TRANSACTION_NETWORK_MISMATCH", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Network must be testnet." };
  }
  if (endpoint !== "https://soroban-testnet.stellar.org") {
    return { status: "TRANSACTION_NETWORK_MISMATCH", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Endpoint must be canonical Testnet." };
  }

  const server = client ?? new Server(endpoint, { timeout: 10_000 });
  try {
    const result = await server.getTransaction(hash);
    // Api.GetTransactionStatus.SUCCESS, PENDING, FAILED, NOT_FOUND
    if (result.status === Api.GetTransactionStatus.SUCCESS) {
      return { status: "TRANSACTION_CONFIRMED", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
    }
    if (result.status === Api.GetTransactionStatus.NOT_FOUND) {
      return { status: "TRANSACTION_NOT_FOUND", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
    }
    if (result.status === Api.GetTransactionStatus.FAILED) {
      return { status: "TRANSACTION_FAILED", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
    }
    // PENDING or unknown
    return { status: "TRANSACTION_PENDING", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    if (lower.includes("not found") || lower.includes("404")) {
      return { status: "TRANSACTION_NOT_FOUND", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
    }
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return { status: "TRANSACTION_INSPECTION_UNAVAILABLE", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: msg };
    }
    // Network unavailable → inspection unavailable, not not_found/failed
    return { status: "TRANSACTION_INSPECTION_UNAVAILABLE", transactionHash: hash, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: msg };
  }
}

export type SubmissionRecoveryStatus = "SUBMISSION_STATUS_UNKNOWN" | "SUBMISSION_PENDING" | "SUBMISSION_CONFIRMED" | "SUBMISSION_FAILED" | "SUBMISSION_INSPECTION_UNAVAILABLE";

export function getSubmissionRecoveryStatus(inspection: TransactionInspectionResult): SubmissionRecoveryStatus {
  switch (inspection.status) {
    case "TRANSACTION_CONFIRMED":
      return "SUBMISSION_CONFIRMED";
    case "TRANSACTION_PENDING":
      return "SUBMISSION_PENDING";
    case "TRANSACTION_FAILED":
      return "SUBMISSION_FAILED";
    case "TRANSACTION_INSPECTION_UNAVAILABLE":
      return "SUBMISSION_INSPECTION_UNAVAILABLE";
    case "TRANSACTION_NOT_SUPPLIED":
    case "TRANSACTION_NOT_FOUND":
    case "TRANSACTION_INVALID_IDENTIFIER":
    case "TRANSACTION_NETWORK_MISMATCH":
      return "SUBMISSION_STATUS_UNKNOWN";
    default:
      return "SUBMISSION_STATUS_UNKNOWN";
  }
}
