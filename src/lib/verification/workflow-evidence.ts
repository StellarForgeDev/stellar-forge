import type { ControlledDeploymentEvidence } from "./controlled-deployment";
import type { NetworkExecutionStatus } from "./network-execution";
import type { TransactionNetwork } from "../transactions/networks.ts";

export interface WorkflowObservation { method: string; args: unknown[]; result: unknown; observedAt: string; verificationSource: string; }
export interface WorkflowStepEvidence { stepId: string; method: string; args: unknown[]; simulationStatus: "NOT_RUN" | "SUCCESS" | "FAILED"; submissionStatus: "NOT_REQUESTED" | "SUBMITTED" | "FAILED" | "CONFIRMED"; transactionHash: string | null; confirmationStatus: "NOT_REQUESTED" | "PENDING" | "CONFIRMED" | "FAILED"; verified: boolean; }
export interface NetworkWorkflowVerificationEvidence {
  componentId: string;
  workflowId: string;
  network: "testnet";
  controlledDeploymentContractId: string;
  deploymentEvidenceReference: string;
  status: NetworkExecutionStatus;
  artifactVerified: boolean;
  steps: WorkflowStepEvidence[];
  beforeObservation: WorkflowObservation | null;
  afterObservation: WorkflowObservation | null;
  postcondition: { expected: unknown; actual: unknown; passed: boolean } | null;
  verificationTimestamp: string | null;
  verificationSource: string | null;
}

export function createWorkflowVerificationEvidence(input: { componentId: string; workflowId: string; network: TransactionNetwork; controlledDeployment: ControlledDeploymentEvidence; deploymentEvidenceReference: string }): NetworkWorkflowVerificationEvidence {
  return { componentId: input.componentId, workflowId: input.workflowId, network: "testnet", controlledDeploymentContractId: input.controlledDeployment.contractId, deploymentEvidenceReference: input.deploymentEvidenceReference, status: "NOT_STARTED", artifactVerified: input.controlledDeployment.artifactVerified, steps: [], beforeObservation: null, afterObservation: null, postcondition: null, verificationTimestamp: null, verificationSource: null };
}

export function pilotDeploymentIsUsable(input: { controlledDeployment: ControlledDeploymentEvidence | null; controlledRegistryRecord: boolean; staticDeploymentId: string | null }): boolean {
  return input.controlledRegistryRecord && input.controlledDeployment !== null && input.controlledDeployment.network === "testnet" && input.controlledDeployment.artifactVerified && input.controlledDeployment.contractId !== input.staticDeploymentId;
}

export function markWorkflowVerified(evidence: NetworkWorkflowVerificationEvidence, input: { afterObservation: WorkflowObservation; expected: unknown; actual: unknown; verificationSource: string; verifiedAt: string }): NetworkWorkflowVerificationEvidence | null {
  if (!evidence.artifactVerified || !evidence.beforeObservation || !evidence.steps.some((step) => step.confirmationStatus === "CONFIRMED" && step.submissionStatus === "CONFIRMED")) return null;
  if (JSON.stringify(input.expected) !== JSON.stringify(input.actual)) return null;
  return { ...evidence, status: "VERIFIED", afterObservation: input.afterObservation, postcondition: { expected: input.expected, actual: input.actual, passed: true }, verificationTimestamp: input.verifiedAt, verificationSource: input.verificationSource };
}

export function appendWorkflowEvidence(existing: NetworkWorkflowVerificationEvidence[], next: NetworkWorkflowVerificationEvidence): NetworkWorkflowVerificationEvidence[] | null {
  const identity = `${next.componentId}:${next.workflowId}:${next.controlledDeploymentContractId}`;
  const conflict = existing.find((item) => `${item.componentId}:${item.workflowId}:${item.controlledDeploymentContractId}` === identity);
  if (conflict) return null;
  return [...existing, next];
}

export function recordBeforeObservation(evidence: NetworkWorkflowVerificationEvidence, observation: WorkflowObservation): NetworkWorkflowVerificationEvidence {
  return { ...evidence, beforeObservation: observation, status: evidence.status === "NOT_STARTED" ? "PREPARED" : evidence.status };
}

export function isSafeEvidenceValue(value: unknown): boolean {
  return !/private|secret|seed|mnemonic|passphrase|token/i.test(JSON.stringify(value));
}
