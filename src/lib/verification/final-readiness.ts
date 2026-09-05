import type { TestnetConnectivityDiagnostic } from "./testnet-connectivity";
import type { DeploymentEvidence } from "./deployment-evidence";

export type FinalReadinessStatus = "READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT" | "NOT_READY";

export interface FinalReadinessGate {
  name: string;
  status: "PASS" | "BLOCKED" | "FAIL" | "UNKNOWN";
  blockingCategory?: string;
  blockingReason?: string;
  recommendedAction?: string;
}

export interface FinalReadinessResult {
  status: FinalReadinessStatus;
  blockingCategory: string | null;
  blockingReason: string | null;
  recommendedAction: string | null;
  gates: {
    environment: FinalReadinessGate;
    artifact: FinalReadinessGate;
    deploymentAccount: FinalReadinessGate;
    constructorAdmin: FinalReadinessGate;
    deploymentGuards: FinalReadinessGate;
    transactionSafety: FinalReadinessGate;
    contractInspection: FinalReadinessGate;
    independentVerification: FinalReadinessGate;
    evidence: FinalReadinessGate;
    persistence: FinalReadinessGate;
    manualRefresh: FinalReadinessGate;
    testSuite: FinalReadinessGate;
    build: FinalReadinessGate;
    testnetConnectivity: FinalReadinessGate;
  };
  timestamp: string;
  network: "testnet";
  endpoint: "https://soroban-testnet.stellar.org";
}

const CANONICAL_ENDPOINT = "https://soroban-testnet.stellar.org";
const CANONICAL_PASSPHRASE = "Test SDF Network ; September 2015";

export function evaluateFinalReadiness(input: {
  connectivity: TestnetConnectivityDiagnostic | null;
  artifactEvidence: DeploymentEvidence[] | null;
  deploymentAccount: { supplied: boolean; valid: boolean; status: string; exists: boolean | null; sufficientBalance: boolean | null } | null;
  constructorAdmin: { supplied: boolean; valid: boolean; status: string } | null;
  deploymentGuards: { uploadPreparationOk: boolean; createRequiresConfirmedUpload: boolean; signingExplicit: boolean; submissionExplicit: boolean; noAutoRetry: boolean } | null;
  transactionSafety: { unknownNotFailed: boolean; notFoundNotFailed: boolean; unavailableNotFailed: boolean; pendingNotRetry: boolean; noAutoResubmit: boolean } | null;
  contractInspection: { foundNotVerified: boolean; unavailableDistinct: boolean } | null;
  independentVerification: { requiresFreshHash: boolean; unavailableNotFailed: boolean; hashMatchRequired: boolean } | null;
  evidenceGate: { recordableOnlyAfterVerification: boolean; historicalPreserved: boolean } | null;
  persistence: { publicOnly: boolean; versioned: boolean; rejectsSecrets: boolean } | null;
  manualRefresh: { readOnly: boolean; noSign: boolean; noSubmit: boolean } | null;
  testSuite: { passed: boolean } | null;
  build: { passed: boolean } | null;
}): FinalReadinessResult {
  const timestamp = new Date().toISOString();
  const gates: FinalReadinessResult["gates"] = {
    environment: { name: "Environment", status: "UNKNOWN" },
    artifact: { name: "Artifact", status: "UNKNOWN" },
    deploymentAccount: { name: "Deployment account", status: "UNKNOWN" },
    constructorAdmin: { name: "Constructor admin", status: "UNKNOWN" },
    deploymentGuards: { name: "Deployment guards", status: "UNKNOWN" },
    transactionSafety: { name: "Transaction safety", status: "UNKNOWN" },
    contractInspection: { name: "Contract inspection", status: "UNKNOWN" },
    independentVerification: { name: "Independent verification", status: "UNKNOWN" },
    evidence: { name: "Evidence", status: "UNKNOWN" },
    persistence: { name: "Persistence", status: "UNKNOWN" },
    manualRefresh: { name: "Manual refresh", status: "UNKNOWN" },
    testSuite: { name: "Test suite", status: "UNKNOWN" },
    build: { name: "Build", status: "UNKNOWN" },
    testnetConnectivity: { name: "Testnet connectivity", status: "UNKNOWN" },
  };

  // Environment gate
  if (!input.connectivity) {
    gates.environment = { name: "Environment", status: "BLOCKED", blockingCategory: "ENVIRONMENT", blockingReason: "Connectivity not observed", recommendedAction: "Run read-only diagnostics" };
    gates.testnetConnectivity = { name: "Testnet connectivity", status: "BLOCKED", blockingCategory: "ENVIRONMENT", blockingReason: "No connectivity diagnostic", recommendedAction: "Run diagnostics" };
  } else if (input.connectivity.endpoint !== CANONICAL_ENDPOINT) {
    gates.environment = { name: "Environment", status: "FAIL", blockingCategory: "ENVIRONMENT", blockingReason: `Non-canonical endpoint: ${input.connectivity.endpoint}`, recommendedAction: `Use ${CANONICAL_ENDPOINT}` };
    gates.testnetConnectivity = { name: "Testnet connectivity", status: "FAIL", blockingCategory: "ENVIRONMENT", blockingReason: "Non-canonical endpoint", recommendedAction: `Use ${CANONICAL_ENDPOINT}` };
  } else if (input.connectivity.status !== "NETWORK_OK" && input.connectivity.status !== "NETWORK_OK_WITH_TRANSIENT_FAILURES") {
    gates.environment = { name: "Environment", status: "BLOCKED", blockingCategory: "ENVIRONMENT", blockingReason: input.connectivity.failureCategory ?? input.connectivity.status, recommendedAction: "Refresh connectivity diagnostic" };
    gates.testnetConnectivity = { name: "Testnet connectivity", status: "BLOCKED", blockingCategory: "ENVIRONMENT", blockingReason: input.connectivity.failureCategory ?? "UNKNOWN", recommendedAction: "Refresh diagnostics" };
  } else if (input.connectivity.networkPassphrase !== "PASS") {
    gates.environment = { name: "Environment", status: "BLOCKED", blockingCategory: "ENVIRONMENT", blockingReason: "PASSPHRASE_MISMATCH", recommendedAction: `Expected ${CANONICAL_PASSPHRASE}` };
    gates.testnetConnectivity = { name: "Testnet connectivity", status: "BLOCKED", blockingCategory: "ENVIRONMENT", blockingReason: "PASSPHRASE_MISMATCH", recommendedAction: "Check passphrase" };
  } else {
    gates.environment = { name: "Environment", status: "PASS" };
    gates.testnetConnectivity = { name: "Testnet connectivity", status: "PASS" };
  }

  // Artifact gate
  if (!input.artifactEvidence) {
    gates.artifact = { name: "Artifact", status: "BLOCKED", blockingCategory: "ARTIFACT", blockingReason: "No evidence", recommendedAction: "Refresh artifact evidence" };
  } else {
    const evidenceArray = input.artifactEvidence as unknown as DeploymentEvidence[];
    const accessControl = Array.isArray(evidenceArray) ? evidenceArray.find((e) => e.componentId === "access-control") : null;
    const sourceHash = accessControl?.sourceArtifact.sha256;
    const prebuiltHash = accessControl?.prebuiltArtifact.sha256;
    if (!accessControl) {
      gates.artifact = { name: "Artifact", status: "BLOCKED", blockingCategory: "ARTIFACT", blockingReason: "Access Control evidence missing", recommendedAction: "Refresh artifact" };
    } else if (!sourceHash || !prebuiltHash || sourceHash !== prebuiltHash) {
      gates.artifact = { name: "Artifact", status: "FAIL", blockingCategory: "ARTIFACT", blockingReason: "Source and prebuilt artifact hashes do not match.", recommendedAction: "Verify authoritative artifact" };
    } else if (accessControl.latestObservation?.confidence === "TRANSIENT_FAILURE" || accessControl.effectiveStatus === "HISTORICAL_VERIFIED" || accessControl.effectiveStatus === "HISTORICAL_DEPLOYMENT_MISMATCH") {
      gates.artifact = { name: "Artifact", status: "BLOCKED", blockingCategory: "ARTIFACT", blockingReason: `Current retrieval unavailable: ${accessControl.latestObservation?.errorCategory ?? accessControl.effectiveStatus}`, recommendedAction: "Refresh artifact retrieval (read-only)" };
    } else if (!accessControl.status.includes("VERIFIED_MATCH") && !String(accessControl.effectiveStatus ?? "").includes("VERIFIED")) {
      gates.artifact = { name: "Artifact", status: "BLOCKED", blockingCategory: "ARTIFACT", blockingReason: accessControl.status.join(","), recommendedAction: "Refresh artifact" };
    } else {
      gates.artifact = { name: "Artifact", status: "PASS" };
    }
  }

  // Deployment account gate
  if (!input.deploymentAccount) {
    gates.deploymentAccount = { name: "Deployment account", status: "BLOCKED", blockingCategory: "ACCOUNT", blockingReason: "ACCOUNT_NOT_SUPPLIED", recommendedAction: "Provide explicit public G... deployment account" };
  } else if (!input.deploymentAccount.supplied) {
    gates.deploymentAccount = { name: "Deployment account", status: "BLOCKED", blockingCategory: "ACCOUNT", blockingReason: "ACCOUNT_NOT_SUPPLIED", recommendedAction: "Provide explicit public G... deployment account" };
  } else if (!input.deploymentAccount.valid) {
    gates.deploymentAccount = { name: "Deployment account", status: "BLOCKED", blockingCategory: "ACCOUNT", blockingReason: "INVALID_ACCOUNT", recommendedAction: "Provide valid G... address" };
  } else if (input.deploymentAccount.status !== "ACCOUNT_READY") {
    gates.deploymentAccount = { name: "Deployment account", status: "BLOCKED", blockingCategory: "ACCOUNT", blockingReason: input.deploymentAccount.status, recommendedAction: "Ensure account exists and has sufficient XLM" };
  } else {
    gates.deploymentAccount = { name: "Deployment account", status: "PASS" };
  }

  // Constructor admin gate
  if (!input.constructorAdmin) {
    gates.constructorAdmin = { name: "Constructor admin", status: "BLOCKED", blockingCategory: "CONSTRUCTOR", blockingReason: "CONSTRUCTOR_ADMIN_NOT_SUPPLIED", recommendedAction: "Provide explicit public G... constructor admin" };
  } else if (!input.constructorAdmin.supplied) {
    gates.constructorAdmin = { name: "Constructor admin", status: "BLOCKED", blockingCategory: "CONSTRUCTOR", blockingReason: "CONSTRUCTOR_ADMIN_NOT_SUPPLIED", recommendedAction: "Provide explicit public G... constructor admin" };
  } else if (!input.constructorAdmin.valid) {
    gates.constructorAdmin = { name: "Constructor admin", status: "BLOCKED", blockingCategory: "CONSTRUCTOR", blockingReason: "INVALID_ADMIN", recommendedAction: "Provide valid G... admin" };
  } else {
    gates.constructorAdmin = { name: "Constructor admin", status: "PASS" };
  }

  // Deployment guards gate
  if (!input.deploymentGuards) {
    gates.deploymentGuards = { name: "Deployment guards", status: "UNKNOWN", blockingCategory: "GUARD", blockingReason: "Guard state unknown", recommendedAction: "Audit guards" };
  } else if (!input.deploymentGuards.uploadPreparationOk || !input.deploymentGuards.createRequiresConfirmedUpload || !input.deploymentGuards.signingExplicit || !input.deploymentGuards.submissionExplicit || !input.deploymentGuards.noAutoRetry) {
    gates.deploymentGuards = { name: "Deployment guards", status: "FAIL", blockingCategory: "GUARD", blockingReason: "Guard bypass detected", recommendedAction: "Harden guards" };
  } else {
    gates.deploymentGuards = { name: "Deployment guards", status: "PASS" };
  }

  // Transaction safety gate
  if (!input.transactionSafety) {
    gates.transactionSafety = { name: "Transaction safety", status: "UNKNOWN" };
  } else if (!input.transactionSafety.unknownNotFailed || !input.transactionSafety.notFoundNotFailed || !input.transactionSafety.unavailableNotFailed || !input.transactionSafety.pendingNotRetry || !input.transactionSafety.noAutoResubmit) {
    gates.transactionSafety = { name: "Transaction safety", status: "FAIL", blockingCategory: "TRANSACTION", blockingReason: "Transaction safety violated", recommendedAction: "Fix transaction handling" };
  } else {
    gates.transactionSafety = { name: "Transaction safety", status: "PASS" };
  }

  // Contract inspection gate
  if (!input.contractInspection) {
    gates.contractInspection = { name: "Contract inspection", status: "UNKNOWN" };
  } else if (!input.contractInspection.foundNotVerified || !input.contractInspection.unavailableDistinct) {
    gates.contractInspection = { name: "Contract inspection", status: "FAIL", blockingCategory: "CONTRACT", blockingReason: "Contract inspection conflated", recommendedAction: "Separate contract found vs verified" };
  } else {
    gates.contractInspection = { name: "Contract inspection", status: "PASS" };
  }

  // Independent verification gate
  if (!input.independentVerification) {
    gates.independentVerification = { name: "Independent verification", status: "UNKNOWN" };
  } else if (!input.independentVerification.requiresFreshHash || !input.independentVerification.unavailableNotFailed || !input.independentVerification.hashMatchRequired) {
    gates.independentVerification = { name: "Independent verification", status: "FAIL", blockingCategory: "VERIFICATION", blockingReason: "Verification boundary weak", recommendedAction: "Harden independent verification" };
  } else {
    gates.independentVerification = { name: "Independent verification", status: "PASS" };
  }

  // Evidence gate
  if (!input.evidenceGate) {
    gates.evidence = { name: "Evidence", status: "UNKNOWN" };
  } else if (!(input.evidenceGate as unknown as { recordableOnlyAfterVerification: boolean })?.recordableOnlyAfterVerification) {
    const ev = input.evidenceGate as unknown as { recordableOnlyAfterVerification?: boolean; historicalPreserved?: boolean };
    if (ev.recordableOnlyAfterVerification === false) {
      gates.evidence = { name: "Evidence", status: "FAIL", blockingCategory: "EVIDENCE", blockingReason: "Evidence recordable without verification", recommendedAction: "Enforce evidence boundary" };
    } else if (ev.historicalPreserved === false) {
      gates.evidence = { name: "Evidence", status: "FAIL", blockingCategory: "EVIDENCE", blockingReason: "Historical evidence not preserved", recommendedAction: "Preserve history" };
    } else {
      gates.evidence = { name: "Evidence", status: "PASS" };
    }
  } else {
    gates.evidence = { name: "Evidence", status: "PASS" };
  }
  if (gates.evidence.status === "UNKNOWN") {
    const ev = input.evidenceGate as unknown as { recordableOnlyAfterVerification?: boolean; historicalPreserved?: boolean } | null;
    if (ev && typeof ev.recordableOnlyAfterVerification === "boolean") {
      if (!ev.recordableOnlyAfterVerification) {
        gates.evidence = { name: "Evidence", status: "FAIL", blockingCategory: "EVIDENCE", blockingReason: "Evidence recordable without verification", recommendedAction: "Enforce evidence boundary" };
      } else if (ev.historicalPreserved === false) {
        gates.evidence = { name: "Evidence", status: "FAIL", blockingCategory: "EVIDENCE", blockingReason: "Historical evidence not preserved", recommendedAction: "Preserve history" };
      } else {
        gates.evidence = { name: "Evidence", status: "PASS" };
      }
    } else {
      gates.evidence = { name: "Evidence", status: gates.artifact.status === "PASS" ? "PASS" : "BLOCKED", blockingCategory: gates.artifact.blockingCategory, blockingReason: gates.artifact.blockingReason, recommendedAction: gates.artifact.recommendedAction };
    }
  }

  // Persistence gate
  if (!input.persistence) {
    gates.persistence = { name: "Persistence", status: "UNKNOWN" };
  } else if (!input.persistence.publicOnly || !input.persistence.versioned || !input.persistence.rejectsSecrets) {
    gates.persistence = { name: "Persistence", status: "FAIL", blockingCategory: "PERSISTENCE", blockingReason: "Persistence not public-only or not versioned", recommendedAction: "Harden persistence" };
  } else {
    gates.persistence = { name: "Persistence", status: "PASS" };
  }

  // Manual refresh gate
  if (!input.manualRefresh) {
    gates.manualRefresh = { name: "Manual refresh", status: "UNKNOWN" };
  } else if (!input.manualRefresh.readOnly || !input.manualRefresh.noSign || !input.manualRefresh.noSubmit) {
    gates.manualRefresh = { name: "Manual refresh", status: "FAIL", blockingCategory: "REFRESH", blockingReason: "Manual refresh not read-only", recommendedAction: "Harden refresh" };
  } else {
    gates.manualRefresh = { name: "Manual refresh", status: "PASS" };
  }

  // Test suite gate
  if (!input.testSuite) {
    gates.testSuite = { name: "Test suite", status: "UNKNOWN" };
  } else if (!input.testSuite.passed) {
    gates.testSuite = { name: "Test suite", status: "FAIL", blockingCategory: "TEST", blockingReason: "Tests failed", recommendedAction: "Fix tests" };
  } else {
    gates.testSuite = { name: "Test suite", status: "PASS" };
  }

  // Build gate
  if (!input.build) {
    gates.build = { name: "Build", status: "UNKNOWN" };
  } else if (!input.build.passed) {
    gates.build = { name: "Build", status: "FAIL", blockingCategory: "BUILD", blockingReason: "Build failed", recommendedAction: "Fix build" };
  } else {
    gates.build = { name: "Build", status: "PASS" };
  }

  // Determine final status with deterministic precedence
  const allGates = Object.values(gates);
  const blocked = allGates.find((g) => g.status === "BLOCKED");
  const failed = allGates.find((g) => g.status === "FAIL");
  const unknown = allGates.find((g) => g.status === "UNKNOWN");

  let status: FinalReadinessStatus = "READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT";
  let blockingCategory: string | null = null;
  let blockingReason: string | null = null;
  let recommendedAction: string | null = null;

  if (failed) {
    status = "NOT_READY";
    blockingCategory = failed.blockingCategory ?? "FAIL";
    blockingReason = failed.blockingReason ?? "Unknown failure";
    recommendedAction = failed.recommendedAction ?? "Fix failure";
  } else if (blocked) {
    status = "NOT_READY";
    blockingCategory = blocked.blockingCategory ?? "BLOCKED";
    blockingReason = blocked.blockingReason ?? "Blocked";
    recommendedAction = blocked.recommendedAction ?? "Check blocker";
  } else if (unknown) {
    status = "NOT_READY";
    blockingCategory = unknown.blockingCategory ?? "UNKNOWN";
    blockingReason = unknown.blockingReason ?? `Gate ${unknown.name} is UNKNOWN`;
    recommendedAction = unknown.recommendedAction ?? "Provide missing data";
  } else {
    // All PASS
    status = "READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT";
  }

  return {
    status,
    blockingCategory,
    blockingReason,
    recommendedAction,
    gates,
    timestamp,
    network: "testnet",
    endpoint: CANONICAL_ENDPOINT,
  };
}
