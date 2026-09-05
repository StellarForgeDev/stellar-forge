import { StrKey } from "@stellar/stellar-sdk";

// no ReconciliationStatus needed — session is generic

// Canonical deployment session state machine — authoritative, deterministic, auditable
// Testnet only, https://soroban-testnet.stellar.org, no secrets, no auto sign/submit

export const DEPLOYMENT_SESSION_STATES = [
  "NOT_STARTED",
  "ENVIRONMENT_BLOCKED",
  "ARTIFACT_BLOCKED",
  "ACCOUNT_BLOCKED",
  "CONSTRUCTOR_BLOCKED",
  "PREFLIGHT_READY",
  "UPLOAD_PREPARED",
  "UPLOAD_SIMULATED",
  "AWAITING_UPLOAD_CONFIRMATION",
  "UPLOAD_SIGNED",
  "UPLOAD_SUBMITTED",
  "UPLOAD_CONFIRMED",
  "CREATE_PREPARED",
  "CREATE_SIMULATED",
  "AWAITING_CREATE_CONFIRMATION",
  "CREATE_SIGNED",
  "CREATE_SUBMITTED",
  "CREATE_CONFIRMED",
  "INDEPENDENT_VERIFICATION_PENDING",
  "INDEPENDENTLY_VERIFIED",
  "EVIDENCE_RECORDED",
  "FAILED",
] as const;

export type DeploymentSessionState = (typeof DEPLOYMENT_SESSION_STATES)[number];

export interface DeploymentSessionSnapshot {
  sessionId: string;
  component: "access-control";
  network: "testnet";
  endpoint: "https://soroban-testnet.stellar.org";
  state: DeploymentSessionState;
  previousState: DeploymentSessionState | null;
  observedAt: string;
  artifactHash: string | null;
  deploymentAccount: string | null; // G... only
  constructorAdmin: string | null; // G... only
  simulationStatus: "NOT_STARTED" | "PREPARED" | "SIMULATED" | "AWAITING_CONFIRMATION" | "FAILED" | "UNKNOWN";
  transactionHash: string | null;
  contractId: string | null; // C... only
  blockingReason: string | null;
  failure?: DeploymentSessionFailure;
  historyLength: number;
  // Phase 28 reconciliation metadata — public-safe only
  reconciliationPerformed?: boolean;
  reconciliationVersion?: string;
  reconciledAt?: string;
  observationTimestamp?: string;
  blockingCategory?: string | null;
  sourceSummary?: string | null;
  prerequisiteSnapshot?: {
    connectivity: string;
    artifact: string;
    account: string;
    constructorAdmin: string;
  };
}

export interface DeploymentSession {
  sessionId: string;
  component: "access-control";
  network: "testnet";
  endpoint: "https://soroban-testnet.stellar.org";
  state: DeploymentSessionState;
  previousState: DeploymentSessionState | null;
  snapshots: readonly DeploymentSessionSnapshot[];
  createdAt: string;
  lastObservedAt: string;
  artifactHash: string | null;
  deploymentAccount: string | null;
  constructorAdmin: string | null;
  blockingReason: string | null;
  failure: DeploymentSessionFailure | null;
  transactionHashes: { upload?: string | null; create?: string | null };
  contractId: string | null;
}

export interface DeploymentSessionFailure {
  stage: DeploymentSessionState;
  classification:
    | "NETWORK_UNAVAILABLE"
    | "ARTIFACT_BLOCKED"
    | "ACCOUNT_NOT_FOUND"
    | "ACCOUNT_UNFUNDED"
    | "ACCOUNT_NOT_SUPPLIED"
    | "INVALID_ADMIN"
    | "SIMULATION_FAILED"
    | "TRANSACTION_REJECTED"
    | "CONFIRMATION_UNAVAILABLE"
    | "INDEPENDENT_VERIFICATION_UNAVAILABLE"
    | "UNKNOWN";
  message: string;
  observedAt: string;
  recoverable: boolean;
  recommendedNextAction: string;
}

const ALLOWED_TRANSITIONS: Record<DeploymentSessionState, readonly DeploymentSessionState[]> = {
  NOT_STARTED: ["ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED", "PREFLIGHT_READY", "FAILED"],
  ENVIRONMENT_BLOCKED: ["PREFLIGHT_READY", "ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED", "FAILED", "NOT_STARTED"],
  ARTIFACT_BLOCKED: ["PREFLIGHT_READY", "ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED", "FAILED", "NOT_STARTED"],
  ACCOUNT_BLOCKED: ["PREFLIGHT_READY", "ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED", "FAILED", "NOT_STARTED"],
  CONSTRUCTOR_BLOCKED: ["PREFLIGHT_READY", "ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED", "FAILED", "NOT_STARTED"],
  PREFLIGHT_READY: ["UPLOAD_PREPARED", "ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED", "FAILED", "NOT_STARTED"],
  UPLOAD_PREPARED: ["UPLOAD_SIMULATED", "FAILED"],
  UPLOAD_SIMULATED: ["AWAITING_UPLOAD_CONFIRMATION", "FAILED"],
  AWAITING_UPLOAD_CONFIRMATION: ["UPLOAD_SIGNED", "FAILED"],
  UPLOAD_SIGNED: ["UPLOAD_SUBMITTED", "FAILED"],
  UPLOAD_SUBMITTED: ["UPLOAD_CONFIRMED", "FAILED"],
  UPLOAD_CONFIRMED: ["CREATE_PREPARED", "FAILED"],
  CREATE_PREPARED: ["CREATE_SIMULATED", "FAILED"],
  CREATE_SIMULATED: ["AWAITING_CREATE_CONFIRMATION", "FAILED"],
  AWAITING_CREATE_CONFIRMATION: ["CREATE_SIGNED", "FAILED"],
  CREATE_SIGNED: ["CREATE_SUBMITTED", "FAILED"],
  CREATE_SUBMITTED: ["CREATE_CONFIRMED", "FAILED"],
  CREATE_CONFIRMED: ["INDEPENDENT_VERIFICATION_PENDING", "FAILED"],
  INDEPENDENT_VERIFICATION_PENDING: ["INDEPENDENTLY_VERIFIED", "FAILED"],
  INDEPENDENTLY_VERIFIED: ["EVIDENCE_RECORDED", "FAILED"],
  EVIDENCE_RECORDED: ["FAILED"], // terminal, no further progression except failure
  FAILED: ["NOT_STARTED", "ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED"],
};

function sanitizePublic(value: string | null): string | null {
  if (!value) return value;
  const lower = value.toLowerCase();
  if (lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private") || value.startsWith("S")) return "[filtered]";
  return value;
}

function isSecretMaterial(value: string | null): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.startsWith("S")) return true;
  const l = v.toLowerCase();
  return l.includes("secret") || l.includes("seed") || l.includes("mnemonic") || l.includes("private");
}

/** Only public Stellar account identifiers may enter authoritative session data. */
export function isValidPublicDeploymentAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || isSecretMaterial(trimmed) || /[\s\n\r\t]/.test(trimmed) || trimmed.length !== 56) return false;
  return StrKey.isValidEd25519PublicKey(trimmed);
}

function sanitizePublicDeploymentAddress(value: string | null | undefined): string | null {
  return isValidPublicDeploymentAddress(value) ? value!.trim() : null;
}

export function canTransitionDeploymentSession(from: DeploymentSessionState, to: DeploymentSessionState): boolean {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  return (allowed as readonly string[]).includes(to);
}

export function getAllowedDeploymentTransitions(state: DeploymentSessionState): readonly DeploymentSessionState[] {
  return ALLOWED_TRANSITIONS[state] ?? [];
}

function generateSessionId(): string {
  try {
    // Use crypto.randomUUID if available, otherwise timestamp + random
    const c = globalThis.crypto as unknown as { randomUUID?: () => string };
    if (c?.randomUUID) return `sess_${c.randomUUID()}`;
  } catch {}
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createDeploymentSession(input?: {
  sessionId?: string;
  artifactHash?: string | null;
  deploymentAccount?: string | null;
  constructorAdmin?: string | null;
  observedAt?: string;
}): DeploymentSession {
  const sessionId = input?.sessionId && !isSecretMaterial(input.sessionId) ? input.sessionId : generateSessionId();
  const observedAt = input?.observedAt ?? nowIso();
  const snapshot: DeploymentSessionSnapshot = {
    sessionId,
    component: "access-control",
    network: "testnet",
    endpoint: "https://soroban-testnet.stellar.org",
    state: "NOT_STARTED",
    previousState: null,
    observedAt,
    artifactHash: sanitizePublic(input?.artifactHash ?? null),
    deploymentAccount: sanitizePublicDeploymentAddress(input?.deploymentAccount),
    constructorAdmin: sanitizePublicDeploymentAddress(input?.constructorAdmin),
    simulationStatus: "NOT_STARTED",
    transactionHash: null,
    contractId: null,
    blockingReason: null,
    historyLength: 1,
  };
  return {
    sessionId,
    component: "access-control",
    network: "testnet",
    endpoint: "https://soroban-testnet.stellar.org",
    state: "NOT_STARTED",
    previousState: null,
    snapshots: [snapshot],
    createdAt: observedAt,
    lastObservedAt: observedAt,
    artifactHash: sanitizePublic(input?.artifactHash ?? null),
    deploymentAccount: sanitizePublicDeploymentAddress(input?.deploymentAccount),
    constructorAdmin: sanitizePublicDeploymentAddress(input?.constructorAdmin),
    blockingReason: null,
    failure: null,
    transactionHashes: {},
    contractId: null,
  };
}

function toSnapshot(session: DeploymentSession, nextState: DeploymentSessionState, overrides: Partial<DeploymentSessionSnapshot> & { observedAt?: string }): DeploymentSessionSnapshot {
  return {
    sessionId: session.sessionId,
    component: "access-control",
    network: "testnet",
    endpoint: "https://soroban-testnet.stellar.org",
    state: nextState,
    previousState: session.state,
    observedAt: overrides.observedAt ?? nowIso(),
    artifactHash: sanitizePublic(overrides.artifactHash ?? session.artifactHash),
    deploymentAccount: sanitizePublicDeploymentAddress(overrides.deploymentAccount ?? session.deploymentAccount),
    constructorAdmin: sanitizePublicDeploymentAddress(overrides.constructorAdmin ?? session.constructorAdmin),
    simulationStatus: overrides.simulationStatus ?? "UNKNOWN",
    transactionHash: overrides.transactionHash ?? null,
    contractId: sanitizePublic(overrides.contractId ?? session.contractId),
    blockingReason: overrides.blockingReason ?? null,
    failure: overrides.failure,
    historyLength: session.snapshots.length + 1,
  };
}

export function transitionDeploymentSession(
  session: DeploymentSession,
  to: DeploymentSessionState,
  context?: Partial<DeploymentSessionSnapshot> & { failure?: DeploymentSessionFailure },
): { session: DeploymentSession; snapshot: DeploymentSessionSnapshot } | { error: string } {
  if (isSecretMaterial(context?.deploymentAccount ?? null) || isSecretMaterial(context?.constructorAdmin ?? null) || isSecretMaterial(context?.transactionHash ?? null) || isSecretMaterial(context?.contractId ?? null)) {
    return { error: "Secret material rejected in session transition." };
  }
  if (!canTransitionDeploymentSession(session.state, to)) {
    return { error: `Invalid transition ${session.state} → ${to}. Allowed: ${(ALLOWED_TRANSITIONS[session.state] ?? []).join(", ") || "none"}` };
  }
  // Evidence boundary audit: never allow shortcuts to EVIDENCE_RECORDED without verification
  if (to === "EVIDENCE_RECORDED" && session.state !== "INDEPENDENTLY_VERIFIED") {
    return { error: "EVIDENCE_RECORDED requires INDEPENDENTLY_VERIFIED predecessor." };
  }
  if (to === "EVIDENCE_RECORDED" && !context?.contractId) {
    return { error: "EVIDENCE_RECORDED requires contractId." };
  }
  const snapshot = toSnapshot(session, to, {
    observedAt: nowIso(),
    artifactHash: context?.artifactHash,
    deploymentAccount: context?.deploymentAccount,
    constructorAdmin: context?.constructorAdmin,
    simulationStatus: context?.simulationStatus,
    transactionHash: context?.transactionHash,
    contractId: context?.contractId,
    blockingReason: context?.blockingReason,
    failure: context?.failure,
  });
  const next: DeploymentSession = {
    ...session,
    state: to,
    previousState: session.state,
    snapshots: [...session.snapshots, snapshot],
    lastObservedAt: snapshot.observedAt,
    artifactHash: snapshot.artifactHash,
    deploymentAccount: snapshot.deploymentAccount,
    constructorAdmin: snapshot.constructorAdmin,
    blockingReason: snapshot.blockingReason,
    failure: snapshot.failure ?? session.failure,
    transactionHashes: {
      upload: to.startsWith("UPLOAD") ? snapshot.transactionHash ?? session.transactionHashes.upload : session.transactionHashes.upload,
      create: to.startsWith("CREATE") ? snapshot.transactionHash ?? session.transactionHashes.create : session.transactionHashes.create,
    },
    contractId: snapshot.contractId ?? session.contractId,
  };
  return { session: next, snapshot };
}

// Session invalidation and environment drift
export interface SessionPrerequisites {
  connectivity: { status: string; failureCategory?: string };
  artifact: { verified: boolean; status: string };
  account: { status: string; exists: boolean | null; sufficientBalance: boolean | null };
  constructorAdmin: { supplied: boolean; valid: boolean };
}

export function invalidateSessionIfNeeded(session: DeploymentSession, prereqs: SessionPrerequisites): DeploymentSession {
  // If any prerequisite materially changed, downgrade from higher state to blocked, but preserve history
  const current = session.state;
  // Once past PREFLIGHT_READY, invalidation moves to blocked states, not silently preserved
  if (["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED", "CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION", "CREATE_SIGNED", "CREATE_SUBMITTED", "CREATE_CONFIRMED", "INDEPENDENT_VERIFICATION_PENDING", "INDEPENDENTLY_VERIFIED", "EVIDENCE_RECORDED"].includes(current)) {
    if (prereqs.connectivity.status !== "NETWORK_OK" && prereqs.connectivity.status !== "NETWORK_OK_WITH_TRANSIENT_FAILURES") {
      if (current !== "ENVIRONMENT_BLOCKED") {
        const res = transitionDeploymentSession(session, "ENVIRONMENT_BLOCKED", { blockingReason: `NETWORK_UNAVAILABLE: ${prereqs.connectivity.failureCategory ?? "unknown"}`, failure: { stage: current, classification: "NETWORK_UNAVAILABLE", message: `Connectivity changed to ${prereqs.connectivity.status}`, observedAt: nowIso(), recoverable: true, recommendedNextAction: "Refresh connectivity diagnostic" } });
        if ("session" in res) return res.session;
      }
      return session;
    }
    if (!prereqs.artifact.verified) {
      if (current !== "ARTIFACT_BLOCKED") {
        const res = transitionDeploymentSession(session, "ARTIFACT_BLOCKED", { blockingReason: `ARTIFACT_BLOCKED: ${prereqs.artifact.status}`, failure: { stage: current, classification: "ARTIFACT_BLOCKED", message: "Artifact no longer VERIFIED_MATCH", observedAt: nowIso(), recoverable: true, recommendedNextAction: "Refresh artifact evidence" } });
        if ("session" in res) return res.session;
      }
      return session;
    }
    if (prereqs.account.status !== "ACCOUNT_READY") {
      if (current !== "ACCOUNT_BLOCKED") {
        const res = transitionDeploymentSession(session, "ACCOUNT_BLOCKED", { blockingReason: prereqs.account.status, failure: { stage: current, classification: prereqs.account.status === "ACCOUNT_NOT_FOUND" ? "ACCOUNT_NOT_FOUND" : prereqs.account.status === "ACCOUNT_UNFUNDED" ? "ACCOUNT_UNFUNDED" : "ACCOUNT_NOT_FOUND", message: `Account changed to ${prereqs.account.status}`, observedAt: nowIso(), recoverable: true, recommendedNextAction: "Provide funded Testnet account" } });
        if ("session" in res) return res.session;
      }
      return session;
    }
    if (!prereqs.constructorAdmin.supplied || !prereqs.constructorAdmin.valid) {
      if (current !== "CONSTRUCTOR_BLOCKED") {
        // Invalidate any previously prepared creation stage
        const res = transitionDeploymentSession(session, "CONSTRUCTOR_BLOCKED", { blockingReason: !prereqs.constructorAdmin.supplied ? "CONSTRUCTOR_BLOCKED: admin not supplied" : "CONSTRUCTOR_BLOCKED: invalid admin", failure: { stage: current, classification: "INVALID_ADMIN", message: "Constructor admin changed", observedAt: nowIso(), recoverable: true, recommendedNextAction: "Provide valid G... constructor admin" } });
        if ("session" in res) return res.session;
      }
      return session;
    }
  }
  return session;
}

// Bind simulation stages to session
export function deriveSessionStateFromPrerequisites(prereqs: SessionPrerequisites, currentState: DeploymentSessionState): DeploymentSessionState {
  if (prereqs.connectivity.status !== "NETWORK_OK" && prereqs.connectivity.status !== "NETWORK_OK_WITH_TRANSIENT_FAILURES") return "ENVIRONMENT_BLOCKED";
  if (!prereqs.artifact.verified) return "ARTIFACT_BLOCKED";
  if (prereqs.account.status === "ACCOUNT_NOT_SUPPLIED" || prereqs.account.status === "ACCOUNT_NOT_FOUND" || prereqs.account.status === "ACCOUNT_UNFUNDED" || prereqs.account.status === "INVALID_ACCOUNT") return "ACCOUNT_BLOCKED";
  if (!prereqs.constructorAdmin.supplied || !prereqs.constructorAdmin.valid) return "CONSTRUCTOR_BLOCKED";
  // All gates satisfied
  if (currentState === "NOT_STARTED" || currentState === "ENVIRONMENT_BLOCKED" || currentState === "ARTIFACT_BLOCKED" || currentState === "ACCOUNT_BLOCKED" || currentState === "CONSTRUCTOR_BLOCKED") return "PREFLIGHT_READY";
  return currentState;
}

export type DeploymentReadinessState = "ENVIRONMENT_BLOCKED" | "ARTIFACT_BLOCKED" | "ACCOUNT_BLOCKED" | "CONSTRUCTOR_BLOCKED" | "PREFLIGHT_READY" | "UNKNOWN";

export interface ReconcileInput {
  connectivity: { status: string; failureCategory?: string; observedAt?: string };
  artifact: { verified: boolean; status: string; observedAt?: string };
  account: { status: string; exists: boolean | null; sufficientBalance: boolean | null; observedAt?: string };
  constructorAdmin: { supplied: boolean; valid: boolean; observedAt?: string };
  transaction?: { status: string; hash?: string | null; observedAt?: string };
  contract?: { status: string; contractId?: string | null; observedAt?: string };
  independentVerification?: { status: string; deployedHash?: string | null; observedAt?: string };
  /**
   * Read-only recovery evidence for a persisted signed upload.  This is
   * deliberately explicit: absence of a hash alone is not proof that a
   * transaction was never broadcast.
   */
  uploadRecovery?: {
    signedTransactionAvailable: boolean;
    uploadHash: string | null;
    pendingHash: string | null;
    submissionEvidence: "NO_SUBMISSION_RECORDED" | "SUBMITTED" | "PENDING" | "UNKNOWN";
  };
  preflight?: { status: string };
  observedAt?: string;
}

const RECONCILIATION_VERSION = "28.0.0";

export function reconcileDeploymentSession(
  session: DeploymentSession,
  input: ReconcileInput,
): DeploymentSession {
  const observedAt = input.observedAt ?? nowIso();
  const prereqs: SessionPrerequisites = {
    connectivity: { status: input.connectivity.status, failureCategory: input.connectivity.failureCategory },
    artifact: { verified: input.artifact.verified, status: input.artifact.status },
    account: { status: input.account.status, exists: input.account.exists, sufficientBalance: input.account.sufficientBalance },
    constructorAdmin: { supplied: input.constructorAdmin.supplied, valid: input.constructorAdmin.valid },
  };

  // Determine the correct reconciled state based on precedence
  let targetState: DeploymentSessionState;
  let blockingCategory: string | null = null;
  let blockingReason: string | null = null;

  if (prereqs.connectivity.status !== "NETWORK_OK" && prereqs.connectivity.status !== "NETWORK_OK_WITH_TRANSIENT_FAILURES") {
    targetState = "ENVIRONMENT_BLOCKED";
    blockingCategory = "ENVIRONMENT";
    blockingReason = prereqs.connectivity.failureCategory ?? prereqs.connectivity.status;
  } else if (!prereqs.artifact.verified) {
    targetState = "ARTIFACT_BLOCKED";
    blockingCategory = "ARTIFACT";
    blockingReason = prereqs.artifact.status;
  } else if (prereqs.account.status !== "ACCOUNT_READY") {
    targetState = "ACCOUNT_BLOCKED";
    blockingCategory = "ACCOUNT";
    blockingReason = prereqs.account.status;
  } else if (!prereqs.constructorAdmin.supplied || !prereqs.constructorAdmin.valid) {
    targetState = "CONSTRUCTOR_BLOCKED";
    blockingCategory = "CONSTRUCTOR";
    blockingReason = !prereqs.constructorAdmin.supplied ? "CONSTRUCTOR_ADMIN_NOT_SUPPLIED" : "INVALID_ADMIN";
  } else {
    targetState = "PREFLIGHT_READY";
    blockingCategory = null;
    blockingReason = null;
  }

  // A signed state restored without the transient signed envelope is only
  // recoverable when an explicit read-only reconciliation says that no
  // submission was recorded.  Hashes, pending evidence, or UNKNOWN preserve
  // the existing signed/submission recovery semantics.
  if (session.state === "UPLOAD_SIGNED" && input.uploadRecovery) {
    const recovery = input.uploadRecovery;
    const canRecover = !recovery.signedTransactionAvailable
      && recovery.uploadHash === null
      && recovery.pendingHash === null
      && recovery.submissionEvidence === "NO_SUBMISSION_RECORDED";
    if (canRecover) {
      const res = transitionDeploymentSession(session, "FAILED", {
        blockingReason: "SIGNED_UPLOAD_UNAVAILABLE",
        failure: {
          stage: "UPLOAD_SIGNED",
          classification: "SIMULATION_FAILED",
          message: "The signed upload is no longer available and no upload submission is recorded.",
          observedAt,
          recoverable: true,
          recommendedNextAction: "Reset to NOT_STARTED, refresh readiness, and prepare a new upload transaction",
        },
        simulationStatus: "FAILED",
      });
      if ("session" in res) return res.session;
    }
  }

  // Handle transaction/contract/independent verification reconciliation for irreversible states — preserve lifecycle but update readiness
  if (input.transaction && ["UPLOAD_SUBMITTED", "CREATE_SUBMITTED"].includes(session.state)) {
    const txStatus = input.transaction.status;
    if (txStatus === "TRANSACTION_CONFIRMED") {
      const nextState = session.state === "UPLOAD_SUBMITTED" ? "UPLOAD_CONFIRMED" : "CREATE_CONFIRMED";
      if (canTransitionDeploymentSession(session.state, nextState)) {
        const res = transitionDeploymentSession(session, nextState, { transactionHash: input.transaction.hash ?? null, blockingReason: null });
        if ("session" in res) return res.session;
      }
    } else if (txStatus === "TRANSACTION_FAILED") {
      const res = transitionDeploymentSession(session, "FAILED", { blockingReason: `TRANSACTION_FAILED: ${input.transaction.hash}`, failure: { stage: session.state, classification: "TRANSACTION_REJECTED", message: "Transaction failed", observedAt, recoverable: false, recommendedNextAction: "Inspect transaction, do not auto-retry" } });
      if ("session" in res) return res.session;
    } else if (txStatus === "TRANSACTION_INSPECTION_UNAVAILABLE" || txStatus === "TRANSACTION_PENDING" || txStatus === "TRANSACTION_NOT_FOUND") {
      // Preserve submitted state, add snapshot with updated observation but no lifecycle advance
      const lastSnap = session.snapshots[session.snapshots.length - 1];
      if (lastSnap?.blockingReason === `TRANSACTION_${txStatus}`) return session;
      const snapshot: DeploymentSessionSnapshot = {
        sessionId: session.sessionId,
        component: "access-control",
        network: "testnet",
        endpoint: "https://soroban-testnet.stellar.org",
        state: session.state,
        previousState: session.state,
        observedAt,
        artifactHash: session.artifactHash,
        deploymentAccount: session.deploymentAccount,
        constructorAdmin: session.constructorAdmin,
        simulationStatus: "UNKNOWN",
        transactionHash: session.transactionHashes.upload ?? session.transactionHashes.create ?? null,
        contractId: session.contractId,
        blockingReason: `TRANSACTION_${txStatus}`,
        historyLength: session.snapshots.length + 1,
        reconciliationPerformed: true,
        reconciliationVersion: RECONCILIATION_VERSION,
        reconciledAt: nowIso(),
        observationTimestamp: observedAt,
        blockingCategory: "TRANSACTION",
        sourceSummary: `transaction:${txStatus}`,
        prerequisiteSnapshot: {
          connectivity: prereqs.connectivity.status,
          artifact: prereqs.artifact.status,
          account: prereqs.account.status,
          constructorAdmin: prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied",
        },
      };
      return { ...session, snapshots: [...session.snapshots, snapshot], lastObservedAt: observedAt, blockingReason: `TRANSACTION_${txStatus}` };
    }
  }

  if (input.contract && session.state === "CREATE_CONFIRMED" && input.contract.status) {
    if (input.contract.status === "CONTRACT_FOUND") {
      // Move to verification pending, not directly verified
      if (canTransitionDeploymentSession(session.state, "INDEPENDENT_VERIFICATION_PENDING")) {
        const res = transitionDeploymentSession(session, "INDEPENDENT_VERIFICATION_PENDING", { contractId: input.contract.contractId ?? null, blockingReason: "CONTRACT_FOUND" });
        if ("session" in res) return res.session;
      }
    } else if (input.contract.status === "CONTRACT_INSPECTION_UNAVAILABLE" || input.contract.status === "CONTRACT_NOT_FOUND") {
      const lastSnap = session.snapshots[session.snapshots.length - 1];
      if (lastSnap?.blockingReason?.includes(input.contract.status)) return session;
      const snapshot: DeploymentSessionSnapshot = {
        sessionId: session.sessionId,
        component: "access-control",
        network: "testnet",
        endpoint: "https://soroban-testnet.stellar.org",
        state: session.state,
        previousState: session.state,
        observedAt,
        artifactHash: session.artifactHash,
        deploymentAccount: session.deploymentAccount,
        constructorAdmin: session.constructorAdmin,
        simulationStatus: "UNKNOWN",
        transactionHash: session.transactionHashes.upload ?? session.transactionHashes.create ?? null,
        contractId: session.contractId,
        blockingReason: input.contract.status,
        historyLength: session.snapshots.length + 1,
        reconciliationPerformed: true,
        reconciliationVersion: RECONCILIATION_VERSION,
        reconciledAt: nowIso(),
        observationTimestamp: observedAt,
        blockingCategory: "CONTRACT",
        sourceSummary: `contract:${input.contract.status}`,
        prerequisiteSnapshot: {
          connectivity: prereqs.connectivity.status,
          artifact: prereqs.artifact.status,
          account: prereqs.account.status,
          constructorAdmin: prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied",
        },
      };
      return { ...session, snapshots: [...session.snapshots, snapshot], lastObservedAt: observedAt, blockingReason: input.contract.status };
    }
  }

  if (input.independentVerification && session.state === "INDEPENDENT_VERIFICATION_PENDING") {
    if (input.independentVerification.status === "INDEPENDENTLY_VERIFIED") {
      if (canTransitionDeploymentSession(session.state, "INDEPENDENTLY_VERIFIED")) {
        const res = transitionDeploymentSession(session, "INDEPENDENTLY_VERIFIED", { contractId: session.contractId, blockingReason: null });
        if ("session" in res) return res.session;
      }
    } else if (input.independentVerification.status === "INDEPENDENT_VERIFICATION_FAILED") {
      const res = transitionDeploymentSession(session, "FAILED", { blockingReason: "INDEPENDENT_VERIFICATION_FAILED", failure: { stage: session.state, classification: "INDEPENDENT_VERIFICATION_UNAVAILABLE", message: "Deployed WASM hash mismatch", observedAt, recoverable: true, recommendedNextAction: "Verify deployed WASM" } });
      if ("session" in res) return res.session;
    } else if (input.independentVerification.status === "INDEPENDENT_VERIFICATION_UNAVAILABLE") {
      const lastSnap = session.snapshots[session.snapshots.length - 1];
      if (lastSnap?.blockingReason === "INDEPENDENT_VERIFICATION_UNAVAILABLE") return session;
      const snapshot: DeploymentSessionSnapshot = {
        sessionId: session.sessionId,
        component: "access-control",
        network: "testnet",
        endpoint: "https://soroban-testnet.stellar.org",
        state: session.state,
        previousState: session.state,
        observedAt,
        artifactHash: session.artifactHash,
        deploymentAccount: session.deploymentAccount,
        constructorAdmin: session.constructorAdmin,
        simulationStatus: "UNKNOWN",
        transactionHash: session.transactionHashes.upload ?? session.transactionHashes.create ?? null,
        contractId: session.contractId,
        blockingReason: "INDEPENDENT_VERIFICATION_UNAVAILABLE",
        historyLength: session.snapshots.length + 1,
        reconciliationPerformed: true,
        reconciliationVersion: RECONCILIATION_VERSION,
        reconciledAt: nowIso(),
        observationTimestamp: observedAt,
        blockingCategory: "VERIFICATION",
        sourceSummary: `verification:${input.independentVerification.status}`,
        prerequisiteSnapshot: {
          connectivity: prereqs.connectivity.status,
          artifact: prereqs.artifact.status,
          account: prereqs.account.status,
          constructorAdmin: prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied",
        },
      };
      return { ...session, snapshots: [...session.snapshots, snapshot], lastObservedAt: observedAt, blockingReason: "INDEPENDENT_VERIFICATION_UNAVAILABLE" };
    }
  }

  // Idempotent: if already in target blocked/ready state with same blocking reason, do not create duplicate snapshot
  const lastSnapshot = session.snapshots[session.snapshots.length - 1];
  if (session.state === targetState && session.blockingReason === blockingReason && lastSnapshot?.reconciliationPerformed) {
    // No new observation timestamp difference? Still update reconciledAt but avoid duplicate if identical inputs
    return session;
  }

  // Preserve lifecycle history for irreversible states — do not regress submitted/confirmed states via reconciliation
  const irreversibleStates: DeploymentSessionState[] = [
    "UPLOAD_SIGNED",
    "UPLOAD_SUBMITTED",
    "UPLOAD_CONFIRMED",
    "CREATE_PREPARED",
    "CREATE_SIMULATED",
    "AWAITING_CREATE_CONFIRMATION",
    "CREATE_SIGNED",
    "CREATE_SUBMITTED",
    "CREATE_CONFIRMED",
    "INDEPENDENT_VERIFICATION_PENDING",
    "INDEPENDENTLY_VERIFIED",
    "EVIDENCE_RECORDED",
  ];
  if (irreversibleStates.includes(session.state)) {
    // Do not overwrite known transaction history with current environment failure
    // Instead, keep lifecycle state, but expose current readiness as separate
    // For Phase 28, we keep lifecycle state but update readiness metadata
    // Return session with updated reconciliation metadata but same lifecycle
    // We add a snapshot that records the current readiness without changing lifecycle
    // To avoid duplicating, we create a snapshot with same state but updated reconciliation info
    const snapshot: DeploymentSessionSnapshot = {
      sessionId: session.sessionId,
      component: "access-control",
      network: "testnet",
      endpoint: "https://soroban-testnet.stellar.org",
      state: session.state,
      previousState: session.state,
      observedAt,
      artifactHash: session.artifactHash,
      deploymentAccount: session.deploymentAccount,
      constructorAdmin: session.constructorAdmin,
      simulationStatus: "UNKNOWN",
      transactionHash: session.transactionHashes.upload ?? session.transactionHashes.create ?? null,
      contractId: session.contractId,
      blockingReason,
      historyLength: session.snapshots.length + 1,
      reconciliationPerformed: true,
      reconciliationVersion: RECONCILIATION_VERSION,
      reconciledAt: nowIso(),
      observationTimestamp: observedAt,
      blockingCategory,
      sourceSummary: `connectivity:${prereqs.connectivity.status}|artifact:${prereqs.artifact.status}|account:${prereqs.account.status}|constructor:${prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied"}`,
      prerequisiteSnapshot: {
        connectivity: prereqs.connectivity.status,
        artifact: prereqs.artifact.status,
        account: prereqs.account.status,
        constructorAdmin: prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied",
      },
    };
    // Do not mutate if already same
    if (lastSnapshot?.blockingReason === blockingReason && lastSnapshot?.state === session.state) return session;
    return {
      ...session,
      snapshots: [...session.snapshots, snapshot],
      lastObservedAt: observedAt,
      blockingReason,
      // Keep lifecycle state, but update failure for visibility
    };
  }

  // For prereq states, transition to target if needed — NOT_STARTED must become precise blocking/ready after evaluation
  if (session.state === "NOT_STARTED") {
    // NOT_STARTED must transition to precise blocking/ready after evaluation — never remain NOT_STARTED when blocker known
    const res = transitionDeploymentSession(session, targetState, {
      blockingReason,
      failure: blockingReason
        ? {
            stage: targetState,
            classification: (blockingCategory === "ENVIRONMENT" ? "NETWORK_UNAVAILABLE" : blockingCategory === "ARTIFACT" ? "ARTIFACT_BLOCKED" : blockingCategory === "ACCOUNT" ? (prereqs.account.status as DeploymentSessionFailure["classification"]) : "INVALID_ADMIN") as DeploymentSessionFailure["classification"],
            message: blockingReason,
            observedAt,
            recoverable: true,
            recommendedNextAction: targetState === "ENVIRONMENT_BLOCKED" ? "Refresh connectivity diagnostic" : targetState === "ARTIFACT_BLOCKED" ? "Refresh artifact evidence" : targetState === "ACCOUNT_BLOCKED" ? "Provide public Testnet deployment account" : "Provide valid constructor admin",
          }
        : undefined,
    });
    if ("session" in res) {
      // Add reconciliation metadata to the new snapshot
      const last = res.session.snapshots[res.session.snapshots.length - 1]!;
      (last as unknown as Record<string, unknown>).reconciliationPerformed = true;
      (last as unknown as Record<string, unknown>).reconciliationVersion = RECONCILIATION_VERSION;
      (last as unknown as Record<string, unknown>).reconciledAt = nowIso();
      (last as unknown as Record<string, unknown>).observationTimestamp = observedAt;
      (last as unknown as Record<string, unknown>).blockingCategory = blockingCategory;
      (last as unknown as Record<string, unknown>).sourceSummary = `connectivity:${prereqs.connectivity.status}|artifact:${prereqs.artifact.status}|account:${prereqs.account.status}|constructor:${prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied"}`;
      (last as unknown as Record<string, unknown>).prerequisiteSnapshot = {
        connectivity: prereqs.connectivity.status,
        artifact: prereqs.artifact.status,
        account: prereqs.account.status,
        constructorAdmin: prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied",
      };
      return res.session;
    }
    return session;
  }

  // For other prereq states, if current state is blocked/ready and target is different, transition
  if (["ENVIRONMENT_BLOCKED", "ARTIFACT_BLOCKED", "ACCOUNT_BLOCKED", "CONSTRUCTOR_BLOCKED", "PREFLIGHT_READY"].includes(session.state) && session.state !== targetState) {
    if (canTransitionDeploymentSession(session.state, targetState)) {
      const res = transitionDeploymentSession(session, targetState, {
        blockingReason,
        failure: blockingReason
          ? {
              stage: targetState,
              classification: (blockingCategory === "ENVIRONMENT" ? "NETWORK_UNAVAILABLE" : blockingCategory === "ARTIFACT" ? "ARTIFACT_BLOCKED" : blockingCategory === "ACCOUNT" ? (prereqs.account.status as DeploymentSessionFailure["classification"]) : "INVALID_ADMIN") as DeploymentSessionFailure["classification"],
              message: blockingReason,
              observedAt,
              recoverable: true,
              recommendedNextAction: targetState === "ENVIRONMENT_BLOCKED" ? "Refresh connectivity diagnostic" : targetState === "ARTIFACT_BLOCKED" ? "Refresh artifact evidence" : targetState === "ACCOUNT_BLOCKED" ? "Provide public Testnet deployment account" : "Provide valid constructor admin",
            }
          : undefined,
      });
      if ("session" in res) {
        const last = res.session.snapshots[res.session.snapshots.length - 1]!;
        (last as unknown as Record<string, unknown>).reconciliationPerformed = true;
        (last as unknown as Record<string, unknown>).reconciliationVersion = RECONCILIATION_VERSION;
        (last as unknown as Record<string, unknown>).reconciledAt = nowIso();
        (last as unknown as Record<string, unknown>).observationTimestamp = observedAt;
        (last as unknown as Record<string, unknown>).blockingCategory = blockingCategory;
        (last as unknown as Record<string, unknown>).sourceSummary = `connectivity:${prereqs.connectivity.status}|artifact:${prereqs.artifact.status}|account:${prereqs.account.status}|constructor:${prereqs.constructorAdmin.supplied ? (prereqs.constructorAdmin.valid ? "valid" : "invalid") : "not_supplied"}`;
        return res.session;
      }
    } else {
      // If direct transition not allowed, use invalidation path
      return invalidateSessionIfNeeded(session, prereqs);
    }
  }

  // Idempotent check for same state
  return session;
}

// Recovery model
export interface RecoveryState {
  lastState: DeploymentSessionState;
  evidenceSupported: boolean;
  confirmationStatus: "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";
  nextAllowed: readonly DeploymentSessionState[];
  forbidden: readonly DeploymentSessionState[];
  recommendedRefresh: string;
}

export function getDeploymentSessionRecoveryState(session: DeploymentSession): RecoveryState {
  const lastState = session.state;
  const nextAllowed = getAllowedDeploymentTransitions(lastState);
  // Determine confirmation status based on state
  let confirmationStatus: RecoveryState["confirmationStatus"] = "UNKNOWN";
  if (["UPLOAD_CONFIRMED", "CREATE_CONFIRMED", "INDEPENDENT_VERIFICATION_PENDING", "INDEPENDENTLY_VERIFIED", "EVIDENCE_RECORDED"].includes(lastState)) confirmationStatus = "CONFIRMED";
  else if (["UPLOAD_SUBMITTED", "CREATE_SUBMITTED"].includes(lastState)) confirmationStatus = "UNKNOWN"; // preserve submitted, need refresh
  else if (["NOT_STARTED", "PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED"].includes(lastState)) confirmationStatus = "NOT_CONFIRMED";

  // Forbidden: never resubmit automatically
  const forbidden: DeploymentSessionState[] = [];
  if (lastState === "UPLOAD_SUBMITTED" || lastState === "CREATE_SUBMITTED") {
    forbidden.push("UPLOAD_SIGNED", "CREATE_SIGNED"); // no resubmit
  }

  let recommendedRefresh = "Refresh connectivity";
  if (lastState === "UPLOAD_SUBMITTED") recommendedRefresh = "Refresh upload transaction confirmation";
  else if (lastState === "CREATE_SUBMITTED") recommendedRefresh = "Refresh creation transaction confirmation";
  else if (lastState === "CREATE_CONFIRMED") recommendedRefresh = "Refresh contract existence and deployed WASM";
  else if (lastState.startsWith("ENVIRONMENT")) recommendedRefresh = "Refresh connectivity diagnostic";
  else if (lastState.startsWith("ARTIFACT")) recommendedRefresh = "Refresh artifact evidence";
  else if (lastState.startsWith("ACCOUNT")) recommendedRefresh = "Refresh account inspection";

  return {
    lastState,
    evidenceSupported: lastState !== "NOT_STARTED",
    confirmationStatus,
    nextAllowed,
    forbidden,
    recommendedRefresh,
  };
}

export function getNextAllowedOperatorAction(session: DeploymentSession): string {
  const recovery = getDeploymentSessionRecoveryState(session);
  if (recovery.nextAllowed.length === 0) return "No operator action allowed — session terminal or failed. Reset to NOT_STARTED.";
  // Prioritize manual refresh vs continue
  if (session.state === "UPLOAD_SUBMITTED" || session.state === "CREATE_SUBMITTED") return "Manual refresh of transaction confirmation (read-only inspection). Do not resubmit.";
  if (session.state === "AWAITING_UPLOAD_CONFIRMATION" || session.state === "AWAITING_CREATE_CONFIRMATION") return "Explicit user confirmation → wallet signing (manual).";
  if (session.state === "PREFLIGHT_READY") return "Prepare upload (PREFLIGHT_READY → UPLOAD_PREPARED).";
  if (session.state === "UPLOAD_SIMULATED") return "Provide explicit user confirmation to advance to AWAITING_UPLOAD_CONFIRMATION.";
  return `Allowed: ${recovery.nextAllowed.join(", ")}. Recommended refresh: ${recovery.recommendedRefresh}`;
}

// Manual refresh boundaries — read-only inspection only
export interface ManualRefreshResult {
  refreshedAt: string;
  inspected: ("connectivity" | "artifact" | "account" | "transaction" | "contract" | "wasm")[];
  advanced: boolean;
  note: string;
}

export function manualRefreshDoesNotAdvance(_session: DeploymentSession): ManualRefreshResult {
  void _session;
  return {
    refreshedAt: nowIso(),
    inspected: ["connectivity", "artifact", "account", "transaction", "contract", "wasm"],
    advanced: false,
    note: "Manual refresh is read-only inspection. It does not sign, submit, retry, create transactions, deploy, or request wallet authorization.",
  };
}

// Failure model helper
export function createSessionFailure(
  stage: DeploymentSessionState,
  classification: DeploymentSessionFailure["classification"],
  message: string,
  recoverable = true,
): DeploymentSessionFailure {
  const map: Record<string, string> = {
    NETWORK_UNAVAILABLE: "Refresh connectivity diagnostic",
    ARTIFACT_BLOCKED: "Refresh artifact evidence",
    ACCOUNT_NOT_FOUND: "Provide valid Testnet account",
    ACCOUNT_UNFUNDED: "Fund account with XLM",
    INVALID_ADMIN: "Provide valid G... admin",
    SIMULATION_FAILED: "Check simulation error, retry manually",
    TRANSACTION_REJECTED: "Inspect transaction, do not auto-retry",
    CONFIRMATION_UNAVAILABLE: "Refresh confirmation (read-only)",
    INDEPENDENT_VERIFICATION_UNAVAILABLE: "Refresh deployed WASM verification",
  };
  return {
    stage,
    classification,
    message: sanitizePublic(message) ?? message,
    observedAt: nowIso(),
    recoverable,
    recommendedNextAction: map[classification] ?? "Manual refresh",
  };
}

// Evidence boundary audit
export function isEvidenceRecordable(session: DeploymentSession): boolean {
  return session.state === "INDEPENDENTLY_VERIFIED" && Boolean(session.contractId) && Boolean(session.artifactHash);
}

export function canRecordEvidenceFromState(state: DeploymentSessionState): boolean {
  return state === "INDEPENDENTLY_VERIFIED";
}

// Durable persistence boundaries — public only, versioned, secret-safe
export const DEPLOYMENT_SESSION_PERSISTENCE_VERSION = "29.0.0";

export interface PersistedDeploymentSession {
  version: typeof DEPLOYMENT_SESSION_PERSISTENCE_VERSION;
  sessionId: string;
  component: "access-control";
  network: "testnet";
  endpoint: "https://soroban-testnet.stellar.org";
  state: DeploymentSessionState;
  previousState: DeploymentSessionState | null;
  createdAt: string;
  lastObservedAt: string;
  deploymentAccount: string | null;
  constructorAdmin: string | null;
  artifactHash: string | null;
  simulationStatus: DeploymentSessionSnapshot["simulationStatus"];
  transactionHash: string | null;
  contractId: string | null;
  blockingReason: string | null;
  blockingCategory: string | null;
  recommendedNextAction: string | null;
  snapshots: readonly DeploymentSessionSnapshot[];
}

export function sanitizePersistedDeploymentSession(session: DeploymentSession): PersistedDeploymentSession {
  // Ensure no secrets are persisted — only public identifiers
  const publicAccount = sanitizePublicDeploymentAddress(session.deploymentAccount);
  const publicAdmin = sanitizePublicDeploymentAddress(session.constructorAdmin);
  const publicTx = session.transactionHashes.upload ?? session.transactionHashes.create ?? null;
  const sanitizedTx = publicTx && !isSecretMaterial(publicTx) ? publicTx : null;
  const publicContract = session.contractId && !isSecretMaterial(session.contractId) ? session.contractId : null;
  return {
    version: DEPLOYMENT_SESSION_PERSISTENCE_VERSION,
    sessionId: session.sessionId,
    component: "access-control",
    network: "testnet",
    endpoint: "https://soroban-testnet.stellar.org",
    state: session.state,
    previousState: session.previousState,
    createdAt: session.createdAt,
    lastObservedAt: session.lastObservedAt,
    deploymentAccount: publicAccount,
    constructorAdmin: publicAdmin,
    artifactHash: session.artifactHash,
    simulationStatus: session.snapshots[session.snapshots.length - 1]?.simulationStatus ?? "UNKNOWN",
    transactionHash: sanitizedTx,
    contractId: publicContract,
    blockingReason: session.blockingReason,
    blockingCategory: (session.snapshots[session.snapshots.length - 1] as unknown as { blockingCategory?: string })?.blockingCategory ?? null,
    recommendedNextAction: getNextAllowedOperatorAction(session),
    snapshots: session.snapshots.map((snapshot) => ({
      ...snapshot,
      deploymentAccount: sanitizePublicDeploymentAddress(snapshot.deploymentAccount),
      constructorAdmin: sanitizePublicDeploymentAddress(snapshot.constructorAdmin),
    })),
  };
}

export function serializeDeploymentSession(session: DeploymentSession): string {
  if (isSecretMaterial(session.deploymentAccount) || isSecretMaterial(session.constructorAdmin) || isSecretMaterial(session.contractId) || isSecretMaterial(session.transactionHashes.upload ?? null) || isSecretMaterial(session.transactionHashes.create ?? null)) {
    throw new Error("Secret material rejected in serialization.");
  }
  const sanitized = sanitizePersistedDeploymentSession(session);
  return JSON.stringify(sanitized);
}

export function validatePersistedDeploymentSession(data: unknown): { valid: true; session: PersistedDeploymentSession } | { valid: false; error: string } {
  if (!data || typeof data !== "object") return { valid: false, error: "Invalid persisted data: not an object." };
  const obj = data as Record<string, unknown>;
  if (obj.version !== DEPLOYMENT_SESSION_PERSISTENCE_VERSION) return { valid: false, error: `Persistence version mismatch: expected ${DEPLOYMENT_SESSION_PERSISTENCE_VERSION}, got ${String(obj.version)}` };
  if (typeof obj.sessionId !== "string" || !obj.sessionId.startsWith("sess_")) return { valid: false, error: "Invalid sessionId." };
  if (obj.component !== "access-control") return { valid: false, error: "Invalid component." };
  if (obj.network !== "testnet") return { valid: false, error: "Invalid network." };
  if (obj.endpoint !== "https://soroban-testnet.stellar.org") return { valid: false, error: "Invalid endpoint." };
  if (typeof obj.state !== "string" || !(DEPLOYMENT_SESSION_STATES as readonly string[]).includes(obj.state)) return { valid: false, error: `Unknown lifecycle state: ${String(obj.state)}` };
  // Check for secret material in persisted fields
  for (const field of ["deploymentAccount", "constructorAdmin", "transactionHash", "contractId"] as const) {
    const val = obj[field];
    if (typeof val === "string" && isSecretMaterial(val)) return { valid: false, error: `Secret material in ${field}` };
  }
  // Validate snapshots are array and not containing secrets
  if (!Array.isArray(obj.snapshots)) return { valid: false, error: "Invalid snapshots." };
  for (const snap of obj.snapshots as unknown[]) {
    if (!snap || typeof snap !== "object") return { valid: false, error: "Invalid snapshot." };
    const s = snap as Record<string, unknown>;
    if (typeof s.state !== "string" || !(DEPLOYMENT_SESSION_STATES as readonly string[]).includes(s.state)) return { valid: false, error: `Unknown snapshot state: ${String(s.state)}` };
    for (const f of ["deploymentAccount", "constructorAdmin", "transactionHash", "contractId"] as const) {
      const v = s[f];
      if (typeof v === "string" && isSecretMaterial(v)) return { valid: false, error: `Secret material in snapshot ${f}` };
    }
  }
  return { valid: true, session: obj as unknown as PersistedDeploymentSession };
}

export function deserializeDeploymentSession(serialized: string): DeploymentSession {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Corrupted persistence: invalid JSON.");
  }
  const validated = validatePersistedDeploymentSession(parsed);
  if (!validated.valid) throw new Error(`Invalid persisted session: ${validated.error}`);
  const p = validated.session;
  // Reconstruct DeploymentSession from persisted data — preserve historical lifecycle, mark reconciliation required
  const snapshots = (p.snapshots as unknown as DeploymentSessionSnapshot[]).map((snapshot) => ({
    ...snapshot,
    deploymentAccount: sanitizePublicDeploymentAddress(snapshot.deploymentAccount),
    constructorAdmin: sanitizePublicDeploymentAddress(snapshot.constructorAdmin),
  }));
  return {
    sessionId: p.sessionId,
    component: "access-control",
    network: "testnet",
    endpoint: "https://soroban-testnet.stellar.org",
    state: p.state,
    previousState: p.previousState,
    snapshots,
    createdAt: p.createdAt,
    lastObservedAt: p.lastObservedAt,
    artifactHash: p.artifactHash,
    deploymentAccount: sanitizePublicDeploymentAddress(p.deploymentAccount),
    constructorAdmin: sanitizePublicDeploymentAddress(p.constructorAdmin),
    blockingReason: p.blockingReason,
    failure: null,
    transactionHashes: { upload: p.transactionHash, create: null },
    contractId: p.contractId,
  };
}

// Restoration semantics
export type RestorationStatus = "RESTORED" | "RECONCILIATION_REQUIRED" | "RECONCILED" | "INVALID_PERSISTENCE";

export interface RestorationResult {
  status: RestorationStatus;
  session: DeploymentSession | null;
  error?: string;
  reconciliationRequired: boolean;
}

export function restoreDeploymentSession(serialized: string | null): RestorationResult {
  if (!serialized) return { status: "INVALID_PERSISTENCE", session: null, error: "No persisted session.", reconciliationRequired: false };
  try {
    const session = deserializeDeploymentSession(serialized);
    // Restoration never automatically performs wallet connection, signing, submission, simulation, deployment, evidence recording
    // Mark current environment observations as potentially stale — require explicit reconciliation
    return { status: "RESTORED", session, reconciliationRequired: true };
  } catch (e) {
    return { status: "INVALID_PERSISTENCE", session: null, error: e instanceof Error ? e.message : String(e), reconciliationRequired: false };
  }
}

export function reconcileRestoredSession(
  session: DeploymentSession,
  prereqs: SessionPrerequisites,
): { session: DeploymentSession; status: "RECONCILED" | "RESTORED" } {
  const before = session.state;
  const reconciled = reconcileDeploymentSession(session, {
    connectivity: prereqs.connectivity,
    artifact: prereqs.artifact,
    account: prereqs.account,
    constructorAdmin: prereqs.constructorAdmin,
  });
  const status = reconciled.state === before && reconciled.snapshots.length === session.snapshots.length ? "RESTORED" : "RECONCILED";
  return { session: reconciled, status };
}
