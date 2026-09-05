export const RECONCILIATION_STATUSES = [
  "VERIFIED_MATCH",
  "DEPLOYMENT_MISMATCH",
  "LOCAL_ARTIFACT_MISMATCH",
  "PROVENANCE_STALE",
  "DEPLOYMENT_UNAVAILABLE",
  "UNKNOWN",
] as const;

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const EVIDENCE_CONFIDENCE = [
  "VERIFIED",
  "HISTORICAL_VERIFIED",
  "UNAVAILABLE",
  "TRANSIENT_FAILURE",
  "INVALID_RESPONSE",
  "UNKNOWN",
] as const;
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCE)[number];
export type EffectiveEvidenceStatus = EvidenceConfidence | ReconciliationStatus | "HISTORICAL_DEPLOYMENT_MISMATCH";

export const RETRIEVAL_FAILURE_CATEGORIES = [
  "NETWORK_UNAVAILABLE",
  "RPC_UNAVAILABLE",
  "RPC_METHOD_UNSUPPORTED",
  "CONTRACT_NOT_FOUND",
  "INVALID_CONTRACT_ID",
  "WASM_NOT_RETRIEVABLE",
  "TIMEOUT",
  "TLS_ERROR",
  "UNKNOWN_ERROR",
] as const;
export type RetrievalFailureCategory = (typeof RETRIEVAL_FAILURE_CATEGORIES)[number];

export function hasStatus(
  statuses: readonly ReconciliationStatus[],
  status: ReconciliationStatus,
): boolean {
  return statuses.includes(status);
}
