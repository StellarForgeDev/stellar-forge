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

export interface VerificationDecisionInput {
  verified?: unknown;
  deployedHash?: string | null;
  candidateHash?: string | null;
  localArtifactHash: string | null;
}

export function evaluateVerificationDecision(input: VerificationDecisionInput): { success: boolean; error?: string } {
  if (input.verified !== true || !input.deployedHash || !input.candidateHash) {
    return { success: false, error: `Independent verification failed: deployed WASM hash (${input.deployedHash ?? 'missing'}) does not match authoritative candidate (${input.candidateHash ?? 'missing'}).` };
  }
  if (input.candidateHash !== input.localArtifactHash || input.deployedHash !== input.localArtifactHash) {
    return { success: false, error: `Independent verification failed: local artifact evidence (${input.localArtifactHash}) does not match server verification.` };
  }
  return { success: true };
}
