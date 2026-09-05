import { StrKey } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { networkConfig } from "@/lib/transactions/networks";

const CANONICAL_TESTNET_HORIZON_URL = "https://horizon-testnet.stellar.org";
export type AccountInspectionStatus =
  | "ACCOUNT_NOT_SUPPLIED"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNFUNDED"
  | "ACCOUNT_BALANCE_UNAVAILABLE"
  | "ACCOUNT_READY"
  // Legacy aliases retained
  | "ACCOUNT_VERIFIED"
  | "INVALID_ACCOUNT"
  | "INSUFFICIENT_BALANCE"
  | "RPC_UNAVAILABLE"
  | "UNKNOWN";
export interface AccountInspectionResult {
  status: AccountInspectionStatus;
  address: string;
  nativeBalance: string | null;
  sequenceNumber: string | null;
  network: "testnet" | "unknown";
  exists: boolean | null;
  sufficientBalance: boolean | null;
  observedAt: string;
  error?: string;
}
export interface PublicAccountReader {
  getNativeBalance(address: string): Promise<string>;
  getAccountDetails?(address: string): Promise<{ sequence: string; balances: Array<{ assetType: string; balance: string }>; }>;
  getAccount?(address: string): Promise<{ sequence: string; nativeBalance: string | null }>;
}

export async function inspectPublicAccount(input: { address?: string | null; reader: PublicAccountReader; minimumNativeBalance?: string; network?: "testnet"; observedAt?: string }): Promise<AccountInspectionResult> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const network = input.network ?? "testnet";
  if (!input.address) return { status: "ACCOUNT_NOT_SUPPLIED", address: "", nativeBalance: null, sequenceNumber: null, network, exists: null, sufficientBalance: null, observedAt };
  const trimmed = input.address.trim();
  const lower = trimmed.toLowerCase();
  // Hard rejection of any secret material — never accept S..., seed, mnemonic, private, etc.
  if (trimmed.startsWith("S") || lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private") || lower.includes("private_key") || lower.includes("secret_key")) {
    return { status: "INVALID_ACCOUNT", address: input.address, nativeBalance: null, sequenceNumber: null, network, exists: null, sufficientBalance: null, observedAt, error: "Secret material rejected. Provide only a public G... address." };
  }
  if (!StrKey.isValidEd25519PublicKey(trimmed)) return { status: "INVALID_ACCOUNT", address: input.address, nativeBalance: null, sequenceNumber: null, network, exists: null, sufficientBalance: null, observedAt, error: "Expected a public Stellar account address." };
  try {
    let balance: string | null = null;
    let sequence: string | null = null;
    if (input.reader.getAccountDetails) {
      const details = await input.reader.getAccountDetails(input.address);
      sequence = details.sequence ?? null;
      const native = details.balances.find((b) => b.assetType === "native");
      balance = native?.balance ?? null;
    } else if (input.reader.getAccount) {
      const details = await input.reader.getAccount(input.address);
      sequence = details.sequence ?? null;
      balance = details.nativeBalance ?? null;
    } else {
      balance = await input.reader.getNativeBalance(input.address);
    }
    if (balance === null) return { status: sequence ? "ACCOUNT_BALANCE_UNAVAILABLE" : "ACCOUNT_NOT_FOUND", address: input.address, nativeBalance: null, sequenceNumber: sequence, network, exists: Boolean(sequence), sufficientBalance: null, observedAt, error: "Native balance is not available from the configured read-only RPC." };
    const minimum = input.minimumNativeBalance ?? "1";
    const sufficient = Number(balance) >= Number(minimum);
    if (!sufficient) return { status: "ACCOUNT_UNFUNDED", address: input.address, nativeBalance: balance, sequenceNumber: sequence, network, exists: true, sufficientBalance: false, observedAt, error: `Insufficient native balance: ${balance} < ${minimum} XLM.` };
    return { status: "ACCOUNT_READY", address: input.address, nativeBalance: balance, sequenceNumber: sequence, network, exists: true, sufficientBalance: true, observedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (message.includes("404") || lower.includes("not found") || lower.includes("account not found")) {
      return { status: "ACCOUNT_NOT_FOUND", address: input.address, nativeBalance: null, sequenceNumber: null, network, exists: false, sufficientBalance: null, observedAt, error: message };
    }
    return { status: "RPC_UNAVAILABLE", address: input.address, nativeBalance: null, sequenceNumber: null, network, exists: null, sufficientBalance: null, observedAt, error: message };
  }
}

export function isAccountReady(result: AccountInspectionResult): boolean {
  return result.status === "ACCOUNT_READY" || result.status === "ACCOUNT_VERIFIED";
}

export function isAccountUnfunded(result: AccountInspectionResult): boolean {
  return result.status === "ACCOUNT_UNFUNDED" || result.status === "INSUFFICIENT_BALANCE";
}

export function createTestnetAccountReader(rpcUrl: string): PublicAccountReader {
  // Testnet-only reader: Soroban RPC is authoritative for public account
  // existence/sequence; canonical Testnet Horizon supplies native XLM balance.
  // Neither path accepts or exposes secret material.
  return {
    getNativeBalance: async () => {
      throw new Error("Native balance is read from canonical Testnet Horizon through getAccount().");
    },
    getAccount: async (address: string) => {
      if (rpcUrl !== networkConfig("testnet").rpcUrl) {
        throw new Error("Account inspection is restricted to canonical Testnet RPC.");
      }
      const server = new Server(rpcUrl, { timeout: 10_000 });
      const account = await server.getAccount(address);
      const sequence = account.sequenceNumber();
      let nativeBalance: string | null = null;
      try {
        const response = await fetch(`${CANONICAL_TESTNET_HORIZON_URL}/accounts/${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          const payload = await response.json() as { balances?: Array<{ asset_type?: string; balance?: string }> };
          nativeBalance = payload.balances?.find((balance) => balance.asset_type === "native")?.balance ?? null;
        }
      } catch {
        // Preserve the Soroban account observation so the caller reports
        // ACCOUNT_BALANCE_UNAVAILABLE rather than fabricating a balance.
      }
      return { sequence, nativeBalance };
    },
  };
}
