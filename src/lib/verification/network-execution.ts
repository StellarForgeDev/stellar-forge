import type { TransactionNetwork } from "../transactions/networks.ts";

export const NETWORK_EXECUTION_STATUSES = [
  "NOT_STARTED", "PREFLIGHT_BLOCKED", "PREPARED", "SIMULATED", "AWAITING_CONFIRMATION", "AWAITING_USER_SIGNATURE",
  "SIGNED", "SUBMITTED", "CONFIRMED", "POSTCONDITION_FAILED", "VERIFIED", "FAILED",
] as const;
export type NetworkExecutionStatus = (typeof NETWORK_EXECUTION_STATUSES)[number];
export type NetworkExecutionMode = "dry-run" | "execute";

export interface NetworkExecutionStepEvidence {
  stepId: string;
  kind: "read" | "simulate" | "transaction" | "observe";
  method: string;
  args: unknown[];
  simulationStatus: "NOT_RUN" | "SUCCESS" | "FAILED";
  signatureStatus: "NOT_REQUESTED" | "AWAITING_USER" | "SIGNED" | "REJECTED";
  submissionStatus: "NOT_REQUESTED" | "SUBMITTED" | "FAILED" | "CONFIRMED";
  transactionHash: string | null;
  result: unknown;
  verified: boolean;
  error?: string;
}

export interface NetworkExecutionEvidence {
  componentId: string;
  workflowId: string;
  network: TransactionNetwork;
  contractId: string;
  startedAt: string;
  completedAt: string | null;
  status: NetworkExecutionStatus;
  mode: NetworkExecutionMode;
  steps: NetworkExecutionStepEvidence[];
}

export function createNetworkExecutionEvidence(input: Pick<NetworkExecutionEvidence, "componentId" | "workflowId" | "network" | "contractId" | "mode"> & { now?: string }): NetworkExecutionEvidence {
  return { ...input, startedAt: input.now ?? new Date().toISOString(), completedAt: null, status: "NOT_STARTED", steps: [] };
}

export function addStepEvidence(
  evidence: NetworkExecutionEvidence,
  step: Omit<NetworkExecutionStepEvidence, "transactionHash" | "verified"> & { transactionHash?: string | null; verified?: boolean },
): NetworkExecutionEvidence {
  const steps = [...evidence.steps, { ...step, transactionHash: step.transactionHash ?? null, verified: step.verified ?? false }];
  const normalizedStep = steps[steps.length - 1]!;
  const status = statusAfterStep(evidence.status, normalizedStep);
  return { ...evidence, steps, status, completedAt: terminalStatus(status) ? new Date().toISOString() : null };
}

export function markPreflightBlocked(evidence: NetworkExecutionEvidence, error: string): NetworkExecutionEvidence {
  return { ...evidence, status: "PREFLIGHT_BLOCKED", completedAt: new Date().toISOString(), steps: [{ stepId: "preflight", kind: "read", method: "", args: [], simulationStatus: "NOT_RUN", signatureStatus: "NOT_REQUESTED", submissionStatus: "NOT_REQUESTED", transactionHash: null, result: null, verified: false, error }] };
}

/** Dry-run deliberately exposes only prepare/simulate. It has no signing or submission callback. */
export async function runDryRun<T>(operation: { prepare: () => Promise<T>; simulate: (prepared: T) => Promise<unknown> }): Promise<{ prepared: T; simulation: unknown; status: "SIMULATED" }> {
  const prepared = await operation.prepare();
  const simulation = await operation.simulate(prepared);
  return { prepared, simulation, status: "SIMULATED" };
}

export interface ExplicitExecutionOperation<TPrepared, TSigned, TSubmitted> {
  prepare: () => Promise<TPrepared>;
  simulate: (prepared: TPrepared) => Promise<unknown>;
  sign: (prepared: TPrepared) => Promise<TSigned>;
  submit: (signed: TSigned) => Promise<TSubmitted>;
  confirmed: boolean;
}

/** Execute mode is intentionally an explicit, caller-driven action, never an automatic chain. */
export async function executeConfirmed<TPrepared, TSigned, TSubmitted>(operation: ExplicitExecutionOperation<TPrepared, TSigned, TSubmitted>): Promise<{ prepared: TPrepared; simulation: unknown; signed: TSigned; submission: TSubmitted }> {
  if (!operation.confirmed) throw new Error("Explicit user confirmation is required before signing.");
  const prepared = await operation.prepare();
  const simulation = await operation.simulate(prepared);
  const signed = await operation.sign(prepared);
  const submission = await operation.submit(signed);
  return { prepared, simulation, signed, submission };
}

function statusAfterStep(current: NetworkExecutionStatus, step: NetworkExecutionStepEvidence): NetworkExecutionStatus {
  if (step.kind === "observe" && step.error) return "POSTCONDITION_FAILED";
  if (step.error) return "FAILED";
  if (step.verified) return "VERIFIED";
  if (step.submissionStatus === "CONFIRMED") return "CONFIRMED";
  if (step.submissionStatus === "SUBMITTED") return "SUBMITTED";
  if (step.signatureStatus === "SIGNED") return "SIGNED";
  if (step.signatureStatus === "AWAITING_USER") return "AWAITING_USER_SIGNATURE";
  if (step.simulationStatus === "SUCCESS") return "SIMULATED";
  return current;
}

function terminalStatus(status: NetworkExecutionStatus): boolean {
  return status === "VERIFIED" || status === "FAILED" || status === "POSTCONDITION_FAILED";
}
