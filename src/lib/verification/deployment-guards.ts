import type { ControlledDeploymentStatus } from "./controlled-deployment";

export type EvidenceStage = "NO_EVIDENCE" | "PREPARED" | "SIMULATED" | "AWAITING_USER_CONFIRMATION" | "SIGNED" | "SUBMITTED" | "CONFIRMED" | "INDEPENDENTLY_VERIFIED" | "RECORDED";
export const EVIDENCE_PROGRESSION: EvidenceStage[] = ["NO_EVIDENCE", "PREPARED", "SIMULATED", "AWAITING_USER_CONFIRMATION", "SIGNED", "SUBMITTED", "CONFIRMED", "INDEPENDENTLY_VERIFIED", "RECORDED"];
const ALLOWED_TRANSITIONS: Record<EvidenceStage, EvidenceStage[]> = {
  NO_EVIDENCE: ["PREPARED"],
  PREPARED: ["SIMULATED"],
  SIMULATED: ["AWAITING_USER_CONFIRMATION"],
  AWAITING_USER_CONFIRMATION: ["SIGNED"],
  SIGNED: ["SUBMITTED"],
  SUBMITTED: ["CONFIRMED"],
  CONFIRMED: ["INDEPENDENTLY_VERIFIED"],
  INDEPENDENTLY_VERIFIED: ["RECORDED"],
  RECORDED: [],
};

export interface DeploymentGuardState {
  status: ControlledDeploymentStatus;
  userConfirmed: boolean;
  simulationPassed: boolean;
  signedTransactionAvailable: boolean;
  uploadConfirmed: boolean;
  creationConfirmed: boolean;
  contractId: string | null;
  artifactVerified: boolean;
}

export interface DeploymentSimulationState {
  upload: "NOT_STARTED" | "PREPARED" | "SIMULATED" | "AWAITING_USER_CONFIRMATION" | "SIGNED" | "SUBMITTED" | "CONFIRMED";
  create: "NOT_STARTED" | "PREPARED" | "SIMULATED" | "AWAITING_USER_CONFIRMATION" | "SIGNED" | "SUBMITTED" | "CONFIRMED";
}

export function canSignDeployment(state: DeploymentGuardState): boolean {
  return state.status === "AWAITING_CONFIRMATION" && state.userConfirmed && state.simulationPassed;
}

export function canSubmitDeployment(state: DeploymentGuardState): boolean {
  return state.signedTransactionAvailable && state.userConfirmed;
}

export function canPrepareCreation(state: DeploymentGuardState): boolean {
  return state.uploadConfirmed;
}

export function canRecordDeploymentEvidence(state: DeploymentGuardState): boolean {
  return state.uploadConfirmed && state.creationConfirmed && Boolean(state.contractId) && state.artifactVerified;
}

export function recoverDeploymentAction(state: Pick<DeploymentGuardState, "uploadConfirmed" | "creationConfirmed" | "contractId" | "artifactVerified"> & { uploadTransactionHash?: string | null; creationTransactionHash?: string | null }): "INSPECT_UPLOAD" | "INSPECT_CREATION" | "VERIFY_ARTIFACT" | "READY_FOR_RECORDING" | "NO_RECOVERY_ACTION" {
  if (state.uploadTransactionHash && !state.uploadConfirmed) return "INSPECT_UPLOAD";
  if (state.creationTransactionHash && !state.creationConfirmed) return "INSPECT_CREATION";
  if (state.creationConfirmed && state.contractId && !state.artifactVerified) return "VERIFY_ARTIFACT";
  if (canRecordDeploymentEvidence({ ...state, status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false })) return "READY_FOR_RECORDING";
  return "NO_RECOVERY_ACTION";
}

export function canTransitionEvidence(from: EvidenceStage, to: EvidenceStage): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function isValidEvidenceProgression(stages: EvidenceStage[]): boolean {
  for (let i = 1; i < stages.length; i += 1) {
    if (!canTransitionEvidence(stages[i - 1]!, stages[i]!)) return false;
  }
  return true;
}

export function canPrepareUpload(state: { connectivityHealthy: boolean; artifactVerified: boolean; accountReady: boolean }): boolean {
  return state.connectivityHealthy && state.artifactVerified && state.accountReady;
}

export function canSimulateUpload(state: { prepared: boolean }): boolean {
  return state.prepared;
}

export function canPrepareCreate(state: { uploadSimulated: boolean; uploadConfirmed?: boolean }): boolean {
  return state.uploadSimulated && state.uploadConfirmed === true;
}

export function canSimulateCreate(state: { createPrepared: boolean; uploadSimulated: boolean }): boolean {
  return state.createPrepared && state.uploadSimulated;
}

export function deploymentSimulationStatus(state: DeploymentSimulationState): "PREPARED" | "SIMULATED" | "AWAITING_USER_CONFIRMATION" | "IN_PROGRESS" | "NOT_STARTED" {
  if (state.upload === "AWAITING_USER_CONFIRMATION" || state.create === "AWAITING_USER_CONFIRMATION") return "AWAITING_USER_CONFIRMATION";
  if (state.upload === "SIMULATED" || state.create === "SIMULATED") return "SIMULATED";
  if (state.upload === "PREPARED" || state.create === "PREPARED") return "PREPARED";
  if (state.upload === "NOT_STARTED" && state.create === "NOT_STARTED") return "NOT_STARTED";
  return "IN_PROGRESS";
}
