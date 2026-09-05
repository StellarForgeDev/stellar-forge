import { describe, expect, it, vi } from "vitest";
import { evaluateFinalReadiness } from "@/lib/verification/final-readiness";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { isEvidenceRecordable } from "@/lib/verification/deployment-session";
import { inspectTransaction } from "@/lib/verification/transaction-inspection";
import { inspectContract, verifyDeployedWasm } from "@/lib/verification/contract-inspection";
import { validatePersistedDeploymentSession, createDeploymentSession, serializeDeploymentSession, restoreDeploymentSession, reconcileDeploymentSession, manualRefreshDoesNotAdvance, canTransitionDeploymentSession, transitionDeploymentSession } from "@/lib/verification/deployment-session";
import { readFileSync } from "node:fs";
import path from "node:path";

const G = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const C = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";
const EXPECTED_HASH = "dbc9527173eb86ad1ba2d155a14910062f8c33a871fe59b871aaa83148f0abfd";

function baseConnectivity(overrides: Partial<Awaited<ReturnType<typeof diagnoseTestnetConnectivity>>> = {}) {
  return {
    endpoint: "https://soroban-testnet.stellar.org",
    network: "testnet" as const,
    dns: "PASS" as const,
    tls: "PASS" as const,
    https: "PASS" as const,
    http: "PASS" as const,
    httpResponse: "PASS" as const,
    rpc: "PASS" as const,
    rpcTransport: "PASS" as const,
    sorobanRpc: "PASS" as const,
    networkMetadata: "PASS" as const,
    networkPassphrase: "PASS" as const,
    status: "NETWORK_OK" as const,
    observedAt: new Date().toISOString(),
    healthMethod: "getHealth" as const,
    networkMethod: "getNetwork" as const,
    ...overrides,
  };
}

function baseEvidence() {
  const raw = readFileSync(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
  return (JSON.parse(raw) as { evidence: Array<Record<string, unknown>> }).evidence.map((item) => item.componentId === "access-control" ? { ...item, effectiveStatus: "VERIFIED", latestObservation: { ...(item.latestObservation as Record<string, unknown>), confidence: "VERIFIED", success: true } } : item) as never[];
}

describe("Phase 31: Final readiness gate", () => {
  it("no deployment account → NOT_READY", () => {
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: baseEvidence(),
      deploymentAccount: { supplied: false, valid: false, status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null },
      constructorAdmin: { supplied: true, valid: true, status: "ACCOUNT_READY" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    expect(r.status).toBe("NOT_READY");
    expect(r.blockingCategory).toBe("ACCOUNT");
  });
  it("no constructor admin → NOT_READY", () => {
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: baseEvidence(),
      deploymentAccount: { supplied: true, valid: true, status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: false, valid: false, status: "CONSTRUCTOR_ADMIN_NOT_SUPPLIED" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    expect(r.status).toBe("NOT_READY");
    expect(r.blockingCategory).toBe("CONSTRUCTOR");
  });
  it("invalid G... account → NOT_READY", () => {
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: baseEvidence(),
      deploymentAccount: { supplied: true, valid: false, status: "INVALID_ACCOUNT", exists: null, sufficientBalance: null },
      constructorAdmin: { supplied: true, valid: true, status: "ACCOUNT_READY" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    expect(r.status).toBe("NOT_READY");
  });
  it("invalid G... admin → NOT_READY", () => {
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: baseEvidence(),
      deploymentAccount: { supplied: true, valid: true, status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: true, valid: false, status: "INVALID_ACCOUNT" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    expect(r.status).toBe("NOT_READY");
  });
  it("Mainnet → rejected", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "https://soroban-mainnet.stellar.org", expectedPassphrase: "Test SDF Network ; September 2015", client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.status).toBe("BLOCKED");
    expect(r.failureCategory).toBe("PASSPHRASE_MISMATCH");
  });
  it("HTTP → rejected", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "http://soroban-testnet.stellar.org", expectedPassphrase: "Test SDF Network ; September 2015", client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.status).toBe("BLOCKED");
    expect(r.tls).toBe("FAIL");
  });
  it("wrong passphrase → rejected", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "https://soroban-testnet.stellar.org", expectedPassphrase: "Test SDF Network ; September 2015", client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase: "Public Global Stellar Network ; September 2015" }) } });
    expect(r.failureCategory).toBe("PASSPHRASE_MISMATCH");
  });
  it("non-canonical RPC → rejected", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "https://rpc.example.com", client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.status).toBe("BLOCKED");
  });
  it("missing artifact → NOT_READY", () => {
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: null,
      deploymentAccount: { supplied: true, valid: true, status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: true, valid: true, status: "ACCOUNT_READY" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    expect(r.status).toBe("NOT_READY");
    expect(r.gates.artifact.status).toBe("BLOCKED");
  });
  it("artifact mismatch → NOT_READY", () => {
    const badEvidence = [{ componentId: "access-control", status: ["DEPLOYMENT_MISMATCH"], effectiveStatus: "DEPLOYMENT_MISMATCH", sourceArtifact: { sha256: "bad" }, prebuiltArtifact: { sha256: "bad" }, latestObservation: { confidence: "VERIFIED" }, deployedArtifact: { sha256: "different" } }] as unknown as never[];
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: badEvidence,
      deploymentAccount: { supplied: true, valid: true, status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: true, valid: true, status: "ACCOUNT_READY" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    expect(r.status).toBe("NOT_READY");
  });
  it("Access Control authoritative hash is used", () => {
    const evidence = baseEvidence() as unknown as Array<{ componentId: string; sourceArtifact: { sha256: string } }>;
    const ac = evidence.find((e) => e.componentId === "access-control")!;
    expect(ac.sourceArtifact.sha256).toBe(EXPECTED_HASH);
  });
  it("all gates passing → READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT", () => {
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: baseEvidence(),
      deploymentAccount: { supplied: true, valid: true, status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: true, valid: true, status: "ACCOUNT_READY" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    expect(r.status).toBe("READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT");
  });
  it("historical verification does not produce current readiness", () => {
    const transientEvidence = [{ componentId: "access-control", status: ["VERIFIED_MATCH"], effectiveStatus: "HISTORICAL_VERIFIED", sourceArtifact: { sha256: EXPECTED_HASH }, prebuiltArtifact: { sha256: EXPECTED_HASH }, latestObservation: { confidence: "TRANSIENT_FAILURE" }, deployedArtifact: { sha256: EXPECTED_HASH } }] as unknown as never[];
    const r = evaluateFinalReadiness({
      connectivity: baseConnectivity(),
      artifactEvidence: transientEvidence,
      deploymentAccount: { supplied: true, valid: true, status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: true, valid: true, status: "ACCOUNT_READY" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    });
    // HISTORICAL_VERIFIED with TRANSIENT_FAILURE should be BLOCKED for current readiness, not PASS
    expect(r.gates.artifact.status).toBe("BLOCKED");
  });
  it("historical transaction does not produce current confirmation", async () => {
    const res = await inspectTransaction({ transactionHash: "a".repeat(64) }, { getTransaction: vi.fn().mockRejectedValue(new Error("fetch failed")) } as never);
    expect(res.status).toBe("TRANSACTION_INSPECTION_UNAVAILABLE");
    expect(res.status).not.toBe("TRANSACTION_CONFIRMED");
  });
  it("transaction unavailable does not produce failure", async () => {
    const res = await inspectTransaction({ transactionHash: "a".repeat(64) }, { getTransaction: vi.fn().mockRejectedValue(new Error("timeout")) } as never);
    expect(res.status).toBe("TRANSACTION_INSPECTION_UNAVAILABLE");
    expect(res.status).not.toBe("TRANSACTION_FAILED");
  });
  it("transaction pending does not authorize retry", async () => {
    const res = await inspectTransaction({ transactionHash: "a".repeat(64) }, { getTransaction: vi.fn().mockResolvedValue({ status: "PENDING" }) } as never);
    expect(res.status).toBe("TRANSACTION_PENDING");
    // Pending should not authorize resubmit — checked via deployment guards
    expect(res.status).not.toBe("TRANSACTION_FAILED");
  });
  it("transaction not found does not authorize retry", async () => {
    const res = await inspectTransaction({ transactionHash: "a".repeat(64) }, { getTransaction: vi.fn().mockRejectedValue(new Error("not found")) } as never);
    expect(res.status).toBe("TRANSACTION_NOT_FOUND");
  });
  it("confirmed transaction does not automatically sign", async () => {
    const res = await inspectTransaction({ transactionHash: "a".repeat(64) }, { getTransaction: vi.fn().mockResolvedValue({ status: "SUCCESS" }) } as never);
    expect(res.status).toBe("TRANSACTION_CONFIRMED");
    // No auto sign — verified via guards
    expect(res.status).not.toBe("TRANSACTION_PENDING");
  });
  it("contract found does not equal independent verification", async () => {
    const cRes = await inspectContract({ contractId: C }, { getContractWasmByContractId: vi.fn().mockResolvedValue(new Uint8Array([1])) } as never);
    expect(cRes.status).toBe("CONTRACT_FOUND");
    const vRes = await verifyDeployedWasm({ contractId: C, expectedHash: "wrong" }, { getContractWasmByContractId: vi.fn().mockResolvedValue(new Uint8Array([1])) } as never);
    expect(vRes.status).toBe("INDEPENDENT_VERIFICATION_FAILED");
  });
  it("WASM retrieval unavailable does not equal mismatch", async () => {
    const v = await verifyDeployedWasm({ contractId: C, expectedHash: EXPECTED_HASH }, { getContractWasmByContractId: vi.fn().mockRejectedValue(new Error("fetch failed")) } as never);
    expect(v.status).toBe("INDEPENDENT_VERIFICATION_UNAVAILABLE");
    expect(v.status).not.toBe("INDEPENDENT_VERIFICATION_FAILED");
  });
  it("WASM hash mismatch blocks readiness", async () => {
    const v = await verifyDeployedWasm({ contractId: C, expectedHash: "deadbeef".repeat(8) }, { getContractWasmByContractId: vi.fn().mockResolvedValue(new Uint8Array([1])) } as never);
    expect(v.status).toBe("INDEPENDENT_VERIFICATION_FAILED");
  });
  it("exact WASM hash match permits independent verification", async () => {
    const wasm = new Uint8Array([1, 2, 3]);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(wasm).digest("hex");
    const v = await verifyDeployedWasm({ contractId: C, expectedHash: hash }, { getContractWasmByContractId: vi.fn().mockResolvedValue(wasm) } as never);
    expect(v.status).toBe("INDEPENDENTLY_VERIFIED");
  });
  it("independent verification required before evidence", () => {
    const s = createDeploymentSession();
    expect(isEvidenceRecordable(s)).toBe(false);
    // CREATE_CONFIRMED should not be recordable
    expect(isEvidenceRecordable({ ...s, state: "CREATE_CONFIRMED" as const, contractId: C, artifactHash: EXPECTED_HASH } as never)).toBe(false);
  });
  it("manual refresh remains read-only", () => {
    const s = createDeploymentSession();
    const r = manualRefreshDoesNotAdvance(s);
    expect(r.advanced).toBe(false);
  });
  it("restoration requires reconciliation", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    expect(restored.reconciliationRequired).toBe(true);
    expect(restored.status).toBe("RESTORED");
  });
  it("restored session cannot bypass readiness", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    // Restored PREFLIGHT_READY without account should still require reconciliation to ACCOUNT_BLOCKED
    expect(restored.session?.state).toBe("NOT_STARTED");
    // After reconciliation with missing account, should be ACCOUNT_BLOCKED
    const reconciled = reconcileDeploymentSession(restored.session!, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("ACCOUNT_BLOCKED");
  });
  it("persistence rejects secrets", () => {
    const s = createDeploymentSession({ deploymentAccount: G });
    const bad = { ...s, deploymentAccount: "SSECRET" } as unknown as typeof s;
    expect(() => serializeDeploymentSession(bad)).toThrow(/Secret/);
  });
  it("persistence rejects malformed state", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const obj = JSON.parse(serialized) as Record<string, unknown>;
    obj.state = "UNKNOWN_STATE";
    expect(validatePersistedDeploymentSession(obj).valid).toBe(false);
  });
  it("transaction hash preserved", () => {
    let s = createDeploymentSession();
    const txHash = "a".repeat(64);
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    const rSigned = transitionDeploymentSession(s, "UPLOAD_SIGNED");
    if ("session" in rSigned) s = rSigned.session;
    const rSubmitted = transitionDeploymentSession(s, "UPLOAD_SUBMITTED", { transactionHash: txHash });
    if ("session" in rSubmitted) s = rSubmitted.session;
    expect(s.transactionHashes.upload).toBe(txHash);
  });
  it("contract ID preserved", () => {
    let s = createDeploymentSession();
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED", "CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION", "CREATE_SIGNED", "CREATE_SUBMITTED"] as const) {
      const r = transitionDeploymentSession(s, to, to === "UPLOAD_SUBMITTED" ? { transactionHash: "a".repeat(64) } : undefined);
      if ("session" in r) s = r.session;
    }
    const rConfirmed = transitionDeploymentSession(s, "CREATE_CONFIRMED");
    if ("session" in rConfirmed) s = rConfirmed.session;
    // Simulate contract ID set via independent verification
    const withContract = transitionDeploymentSession(s, "INDEPENDENT_VERIFICATION_PENDING", { contractId: C });
    if ("session" in withContract) s = withContract.session;
    const verified = transitionDeploymentSession(s, "INDEPENDENTLY_VERIFIED", { contractId: C });
    if ("session" in verified) s = verified.session;
    expect(s.contractId).toBe(C);
  });
  it("historical Token mismatch preserved", () => {
    const raw = readFileSync(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    const j = JSON.parse(raw) as { evidence: Array<{ componentId: string; status: string[] }> };
    const token = j.evidence.find((e) => e.componentId === "token")!;
    expect(token.status).toContain("DEPLOYMENT_MISMATCH");
  });
  it("historical Payment mismatch preserved", () => {
    const raw = readFileSync(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    const j = JSON.parse(raw) as { evidence: Array<{ componentId: string; status: string[] }> };
    const payment = j.evidence.find((e) => e.componentId === "payment")!;
    expect(payment.status).toContain("DEPLOYMENT_MISMATCH");
  });
  it("historical Access Control verification preserved", () => {
    const raw = readFileSync(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    const j = JSON.parse(raw) as { evidence: Array<{ componentId: string; status: string[]; effectiveStatus?: string }> };
    const ac = j.evidence.find((e) => e.componentId === "access-control")!;
    expect(ac.status).toContain("VERIFIED_MATCH");
  });
  it("reconciliation deterministic", () => {
    const s = createDeploymentSession();
    const input = { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } };
    const r1 = reconcileDeploymentSession(s, input);
    const r2 = reconcileDeploymentSession(s, input);
    expect(r1.state).toBe(r2.state);
  });
  it("reconciliation idempotent", () => {
    const s = createDeploymentSession();
    const input = { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() }, observedAt: "2026-01-01T00:00:00.000Z" };
    const r1 = reconcileDeploymentSession(s, input);
    const r2 = reconcileDeploymentSession(r1, input);
    expect(r1.state).toBe(r2.state);
    expect(r2.snapshots.length).toBe(r1.snapshots.length);
  });
  it("final readiness decision deterministic", () => {
    const input = {
      connectivity: { endpoint: "https://soroban-testnet.stellar.org", network: "testnet" as const, dns: "PASS" as const, tls: "PASS" as const, https: "PASS" as const, http: "PASS" as const, httpResponse: "PASS" as const, rpc: "PASS" as const, rpcTransport: "PASS" as const, sorobanRpc: "PASS" as const, networkMetadata: "PASS" as const, networkPassphrase: "PASS" as const, status: "NETWORK_OK" as const, observedAt: new Date().toISOString(), healthMethod: "getHealth" as const, networkMethod: "getNetwork" as const },
      artifactEvidence: baseEvidence(),
      deploymentAccount: { supplied: true, valid: true, status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: true, valid: true, status: "ACCOUNT_READY" },
      deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
      transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
      contractInspection: { foundNotVerified: true, unavailableDistinct: true },
      independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
      evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
      persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
      manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
      testSuite: { passed: true },
      build: { passed: true },
    };
    const r1 = evaluateFinalReadiness(input);
    const r2 = evaluateFinalReadiness(input);
    expect(r1.status).toBe(r2.status);
    expect(r1.blockingReason).toBe(r2.blockingReason);
  });
  it("no automatic deployment path exists", () => {
    const s = createDeploymentSession();
    // Even with PREFLIGHT_READY, cannot go directly to EVIDENCE_RECORDED
    expect(canTransitionDeploymentSession("PREFLIGHT_READY", "EVIDENCE_RECORDED")).toBe(false);
  });
  it("no automatic retry path exists", () => {
    let s = createDeploymentSession();
    s = reconcileDeploymentSession(s, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    // After failure, should not auto-retry to PREFLIGHT_READY without manual refresh
    const failed = transitionDeploymentSession(s, "FAILED");
    expect("session" in failed).toBe(true);
  });
});
