import { StrKey } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { networkConfig } from "../transactions/networks";

export type ContractInspectionStatus =
  | "CONTRACT_ID_NOT_SUPPLIED"
  | "CONTRACT_ID_INVALID"
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_FOUND"
  | "CONTRACT_INSPECTION_UNAVAILABLE"
  | "CONTRACT_NETWORK_MISMATCH";

export interface ContractInspectionResult {
  status: ContractInspectionStatus;
  contractId: string | null;
  network: "testnet";
  endpoint: "https://soroban-testnet.stellar.org";
  observedAt: string;
  error?: string;
}

function isSecretMaterial(value: string): boolean {
  const v = value.trim();
  if (v.startsWith("S")) return true;
  const l = v.toLowerCase();
  return l.includes("secret") || l.includes("seed") || l.includes("mnemonic") || l.includes("private");
}

export async function inspectContract(
  input: { contractId?: string | null; network?: string; endpoint?: string; observedAt?: string },
  client?: { getContractWasmByContractId: (id: string) => Promise<Uint8Array> },
): Promise<ContractInspectionResult> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const network = (input.network ?? "testnet") as "testnet";
  const endpoint = (input.endpoint ?? networkConfig("testnet").rpcUrl) as "https://soroban-testnet.stellar.org";
  const id = input.contractId?.trim() ?? "";

  if (!id) {
    return { status: "CONTRACT_ID_NOT_SUPPLIED", contractId: null, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
  }
  if (isSecretMaterial(id)) {
    return { status: "CONTRACT_ID_INVALID", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Secret material rejected." };
  }
  if (!StrKey.isValidContract(id)) {
    return { status: "CONTRACT_ID_INVALID", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Invalid contract ID." };
  }
  if (network !== "testnet") {
    return { status: "CONTRACT_NETWORK_MISMATCH", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Network must be testnet." };
  }
  if (endpoint !== "https://soroban-testnet.stellar.org") {
    return { status: "CONTRACT_NETWORK_MISMATCH", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: "Endpoint must be canonical Testnet." };
  }

  const server = client ?? new Server(endpoint, { timeout: 10_000 });
  const rpc = client ?? { getContractWasmByContractId: (cid: string) => server.getContractWasmByContractId(cid) };
  try {
    const wasm = await rpc.getContractWasmByContractId(id);
    if (wasm instanceof Uint8Array && wasm.length > 0) {
      return { status: "CONTRACT_FOUND", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
    }
    return { status: "CONTRACT_NOT_FOUND", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    if (lower.includes("not found") || lower.includes("404")) {
      return { status: "CONTRACT_NOT_FOUND", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt };
    }
    return { status: "CONTRACT_INSPECTION_UNAVAILABLE", contractId: id, network: "testnet", endpoint: "https://soroban-testnet.stellar.org", observedAt, error: msg };
  }
}

// Independent verification requires fresh public evidence
export type IndependentVerificationStatus = "INDEPENDENT_VERIFICATION_PENDING" | "INDEPENDENT_VERIFICATION_UNAVAILABLE" | "INDEPENDENT_VERIFICATION_FAILED" | "INDEPENDENTLY_VERIFIED";

export async function verifyDeployedWasm(
  input: { contractId: string; expectedHash: string; network?: string; endpoint?: string },
  client?: { getContractWasmByContractId: (id: string) => Promise<Uint8Array> },
): Promise<{ status: IndependentVerificationStatus; deployedHash?: string; error?: string }> {
  const inspection = await inspectContract({ contractId: input.contractId, network: input.network, endpoint: input.endpoint }, client);
  if (inspection.status === "CONTRACT_INSPECTION_UNAVAILABLE") {
    return { status: "INDEPENDENT_VERIFICATION_UNAVAILABLE", error: inspection.error };
  }
  if (inspection.status !== "CONTRACT_FOUND") {
    return { status: "INDEPENDENT_VERIFICATION_FAILED", error: `Contract not found: ${inspection.status}` };
  }
  // Retrieve WASM and hash
  try {
    const server = client ?? new Server((input.endpoint ?? networkConfig("testnet").rpcUrl) as string, { timeout: 15000 });
    const rpc = client ?? { getContractWasmByContractId: (cid: string) => server.getContractWasmByContractId(cid) };
    const wasm = await rpc.getContractWasmByContractId(input.contractId);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(wasm).digest("hex");
    if (hash !== input.expectedHash) {
      return { status: "INDEPENDENT_VERIFICATION_FAILED", deployedHash: hash, error: "Deployed hash mismatch." };
    }
    return { status: "INDEPENDENTLY_VERIFIED", deployedHash: hash };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: "INDEPENDENT_VERIFICATION_UNAVAILABLE", error: msg };
  }
}
