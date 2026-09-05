import { StrKey } from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import { sha256Bytes } from "./artifact-verification.ts";
import type { ArtifactRetrievalObservation, DeploymentEvidence } from "./deployment-evidence.ts";
import type { EffectiveEvidenceStatus, EvidenceConfidence, RetrievalFailureCategory } from "./artifact-status.ts";

export interface ArtifactRetrievalStrategy {
  source: string;
  method: string;
  retrieve(contractId: string): Promise<Uint8Array>;
}

export interface ArtifactRetrievalResult {
  observation: ArtifactRetrievalObservation;
  bytes?: Uint8Array;
}

export function createRpcArtifactRetrieval(rpcUrl: string): ArtifactRetrievalStrategy {
  return {
    source: rpcUrl,
    method: "stellar-sdk-rpc-getContractWasmByContractId",
    retrieve: (contractId) => new Server(rpcUrl, { timeout: 15_000 }).getContractWasmByContractId(contractId),
  };
}

export async function retrieveArtifact(strategy: ArtifactRetrievalStrategy, contractId: string, observedAt = new Date().toISOString()): Promise<ArtifactRetrievalResult> {
  if (!StrKey.isValidContract(contractId)) {
    return failedObservation(strategy, contractId, observedAt, "INVALID_CONTRACT_ID", "Contract ID is not a valid Soroban contract address.");
  }
  try {
    const bytes = await strategy.retrieve(contractId);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) return failedObservation(strategy, contractId, observedAt, "WASM_NOT_RETRIEVABLE", "RPC returned no WASM bytes.");
    return { bytes, observation: { source: strategy.source, success: true, contractReachable: true, wasmAvailable: true, artifactHash: sha256Bytes(bytes), observedAt, retrievalMethod: strategy.method, confidence: "VERIFIED", authoritative: true, supersedesPrevious: true } };
  } catch (error) {
    const classified = classifyRetrievalError(error);
    return failedObservation(strategy, contractId, observedAt, classified.category, classified.message, classified.contractReachable);
  }
}

export async function retrieveArtifactWithRetry(strategy: ArtifactRetrievalStrategy, contractId: string, options: { attempts?: number; backoffMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<ArtifactRetrievalResult> {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 5)); const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))); let latest: ArtifactRetrievalResult | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) { latest = await retrieveArtifact(strategy, contractId); if (latest.observation.success || latest.observation.errorCategory === "INVALID_CONTRACT_ID" || latest.observation.errorCategory === "CONTRACT_NOT_FOUND") return latest; if (attempt < attempts - 1) await sleep((options.backoffMs ?? 100) * 2 ** attempt); }
  return latest!;
}

function failedObservation(strategy: ArtifactRetrievalStrategy, _contractId: string, observedAt: string, category: RetrievalFailureCategory, message: string, contractReachable: boolean | null = false): ArtifactRetrievalResult {
  const confidence: EvidenceConfidence = category === "INVALID_CONTRACT_ID" || category === "WASM_NOT_RETRIEVABLE" ? "INVALID_RESPONSE" : category === "TIMEOUT" || category === "NETWORK_UNAVAILABLE" || category === "RPC_UNAVAILABLE" || category === "TLS_ERROR" ? "TRANSIENT_FAILURE" : "UNKNOWN";
  return { observation: { source: strategy.source, success: false, contractReachable, wasmAvailable: false, artifactHash: null, observedAt, retrievalMethod: strategy.method, confidence, errorCategory: category, errorMessage: message, authoritative: false, supersedesPrevious: false } };
}

export function makeRetrievalFailure(strategy: ArtifactRetrievalStrategy, category: RetrievalFailureCategory, message: string, observedAt = new Date().toISOString()): ArtifactRetrievalResult {
  return failedObservation(strategy, "", observedAt, category, message, null);
}

export function classifyRetrievalError(error: unknown): { category: RetrievalFailureCategory; message: string; contractReachable: boolean | null } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("invalid") && lower.includes("contract")) return { category: "INVALID_CONTRACT_ID", message, contractReachable: false };
  if (lower.includes("method") && (lower.includes("not found") || lower.includes("unsupported") || lower.includes("not supported"))) return { category: "RPC_METHOD_UNSUPPORTED", message, contractReachable: null };
  if (lower.includes("not found") || lower.includes("404")) return { category: "CONTRACT_NOT_FOUND", message, contractReachable: true };
  if (lower.includes("timeout") || lower.includes("timed out")) return { category: "TIMEOUT", message, contractReachable: null };
  if (lower.includes("tls") || lower.includes("certificate") || lower.includes("secure connection")) return { category: "TLS_ERROR", message, contractReachable: null };
  if (lower.includes("network") || lower.includes("fetch failed") || lower.includes("econn") || lower.includes("enotfound")) return { category: "NETWORK_UNAVAILABLE", message, contractReachable: null };
  if (lower.includes("rpc") || lower.includes("503") || lower.includes("502")) return { category: "RPC_UNAVAILABLE", message, contractReachable: null };
  return { category: "UNKNOWN_ERROR", message, contractReachable: null };
}

export function mergeRetrievalObservation(existing: ArtifactRetrievalObservation[] | undefined, observation: ArtifactRetrievalObservation): { observations: ArtifactRetrievalObservation[]; effectiveStatus: EffectiveEvidenceStatus } {
  const observations = [...(existing ?? []), observation];
  const successful = [...observations].reverse().find((item) => item.success && item.artifactHash);
  const hasMismatch = observations.some((item) => item.success && item.artifactHash && item.artifactHash !== successful?.artifactHash);
  const effectiveStatus: EffectiveEvidenceStatus = successful ? (hasMismatch ? (observation.success ? "DEPLOYMENT_MISMATCH" : "HISTORICAL_DEPLOYMENT_MISMATCH") : !observation.success ? "HISTORICAL_VERIFIED" : "VERIFIED") : observation.confidence;
  return { observations, effectiveStatus };
}

export function attachRetrievalObservation(evidence: DeploymentEvidence, observation: ArtifactRetrievalObservation): DeploymentEvidence {
  const merged = mergeRetrievalObservation(evidence.observations, observation);
  const historicalMismatch = evidence.status.includes("DEPLOYMENT_MISMATCH") || evidence.effectiveStatus === "HISTORICAL_DEPLOYMENT_MISMATCH";
  const effectiveStatus = !observation.success && historicalMismatch ? "HISTORICAL_DEPLOYMENT_MISMATCH" : merged.effectiveStatus;
  return { ...evidence, observations: merged.observations, latestObservation: observation, latestSuccessfulObservation: [...merged.observations].reverse().find((item) => item.success && item.artifactHash), effectiveStatus };
}
