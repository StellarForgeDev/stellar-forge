import { describe, expect, it, vi } from "vitest";
import { diagnoseTestnetConnectivity, classifyConnectivityError } from "@/lib/verification/testnet-connectivity";
import { inspectPublicAccount } from "@/lib/verification/account-inspection";
import { reconcileArtifacts } from "@/lib/verification/artifact-verification";
import { runAccessControlPilotPreflight } from "@/lib/verification/pilot-preflight";
import {
  canPrepareCreate,
  canPrepareUpload,
  canRecordDeploymentEvidence,
  canSignDeployment,
  canSimulateCreate,
  canSimulateUpload,
  canSubmitDeployment,
  canTransitionEvidence,
  isValidEvidenceProgression,
} from "@/lib/verification/deployment-guards";
import { stellarComponents } from "@/data/components";
import type { StellarComponent } from "@/data/components";

const account = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const passphrase = "Test SDF Network ; September 2015";
const component = stellarComponents.find((c) => c.slug === "access-control") as StellarComponent;

describe("Phase 22: Testnet NETWORK_OK reuse", () => {
  it("reuses Phase 20-21 connectivity and remains NETWORK_OK via read-only getHealth/getNetwork", async () => {
    const client = { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase }) };
    const result = await diagnoseTestnetConnectivity({ client, endpoint: "https://soroban-testnet.stellar.org" });
    expect(result.status).toBe("NETWORK_OK");
    expect(result.dns).toBe("PASS");
    expect(result.tls).toBe("PASS");
    expect(result.http).toBe("PASS");
    expect(result.rpc).toBe("PASS");
    expect(result.sorobanRpc).toBe("PASS");
    expect(result.networkPassphrase).toBe("PASS");
    expect(client.getHealth).toHaveBeenCalled();
    expect(client.getNetwork).toHaveBeenCalled();
  });

  it("classifies failure taxonomy without fabrication", () => {
    expect(classifyConnectivityError(new Error("DNS failure eai_again")).category).toBe("DNS_FAILURE");
    expect(classifyConnectivityError(new Error("TLS certificate expired")).category).toBe("TLS_FAILURE");
    expect(classifyConnectivityError(new Error("fetch failed")).category).toBe("HTTP_FAILURE");
    expect(classifyConnectivityError(new Error("rpc endpoint unavailable 503")).category).toBe("RPC_ENDPOINT_UNAVAILABLE");
    expect(classifyConnectivityError(new Error("timeout ETIMEDOUT")).category).toBe("RPC_TIMEOUT");
    expect(classifyConnectivityError(new Error("malformed json")).category).toBe("RPC_MALFORMED_RESPONSE");
    expect(classifyConnectivityError(new Error("method not supported")).category).toBe("RPC_METHOD_UNAVAILABLE");
  });
});

describe("Phase 22: Access Control artifact VERIFIED_MATCH", () => {
  it("Access Control local/prebuilt/deployed are VERIFIED_MATCH", () => {
    const result = reconcileArtifacts({
      component: { slug: "access-control", capabilities: { testnet: true } } as StellarComponent,
      network: "testnet",
      contractId: "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY",
      sourceArtifact: { path: "access_control.wasm", sha256: "abc" },
      prebuiltArtifact: { path: "access-control.wasm", sha256: "abc" },
      deployedArtifact: { sha256: "abc" },
      metadataCommit: "same",
      currentRepositoryCommit: "same",
      verifiedAt: "2026-09-01T00:00:00.000Z",
      verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId",
    });
    expect(result.status).toContain("VERIFIED_MATCH");
    expect(result.artifactParity.sourceMatchesPrebuilt).toBe(true);
    expect(result.artifactParity.prebuiltMatchesDeployed).toBe(true);
  });

  it("preserves historical provenance without converting unavailable to mismatch", () => {
    const unavailable = reconcileArtifacts({
      component: { slug: "access-control", capabilities: { testnet: true } } as StellarComponent,
      network: "testnet",
      contractId: "C",
      sourceArtifact: { path: "a", sha256: "abc" },
      prebuiltArtifact: { path: "b", sha256: "abc" },
      deployedArtifact: { sha256: null },
      metadataCommit: "same",
      currentRepositoryCommit: "same",
      verifiedAt: null,
      verificationMethod: "not-available",
    });
    expect(unavailable.status).toContain("DEPLOYMENT_UNAVAILABLE");
    expect(unavailable.status).not.toContain("DEPLOYMENT_MISMATCH");
  });
});

describe("Phase 22: Public deployment-account readiness (G... only)", () => {
  it("account not supplied → ACCOUNT_NOT_SUPPLIED", async () => {
    const r = await inspectPublicAccount({ address: null, reader: { getNativeBalance: vi.fn() } });
    expect(r.status).toBe("ACCOUNT_NOT_SUPPLIED");
  });
  it("account not found → ACCOUNT_NOT_FOUND", async () => {
    const r = await inspectPublicAccount({ address: account, reader: { getNativeBalance: vi.fn().mockRejectedValue(new Error("404")) } });
    expect(r.status).toBe("ACCOUNT_NOT_FOUND");
  });
  it("unfunded account → ACCOUNT_UNFUNDED", async () => {
    const r = await inspectPublicAccount({ address: account, reader: { getNativeBalance: vi.fn().mockResolvedValue("0.2") }, minimumNativeBalance: "1" });
    expect(r.status).toBe("ACCOUNT_UNFUNDED");
    expect(r.sufficientBalance).toBe(false);
  });
  it("funded account → ACCOUNT_READY with sequence and network", async () => {
    const r = await inspectPublicAccount({
      address: account,
      reader: { getNativeBalance: vi.fn().mockResolvedValue("10"), getAccountDetails: vi.fn().mockResolvedValue({ sequence: "999", balances: [{ assetType: "native", balance: "10" }] }) } as unknown as never,
      minimumNativeBalance: "1",
    });
    expect(r.status).toBe("ACCOUNT_READY");
    expect(r.exists).toBe(true);
    expect(r.sufficientBalance).toBe(true);
    expect(r.sequenceNumber).toBe("999");
    expect(r.network).toBe("testnet");
  });
  it("secret/private material rejection", async () => {
    const secret = "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    // inspectPublicAccount validates StrKey: S... is invalid Ed25519 public key → INVALID_ACCOUNT (rejected)
    const r = await inspectPublicAccount({ address: secret, reader: { getNativeBalance: vi.fn() } });
    expect(r.status).toBe("INVALID_ACCOUNT");
    // UI helper would reject strings containing secret/seed/private before calling inspection
    expect(secret.startsWith("S")).toBe(true);
  });
});

describe("Phase 22: Constructor admin readiness (__constructor(admin: Address))", () => {
  it("invalid constructor admin blocked", () => {
    const base = mkPreflight({ constructorAdmin: "not-an-address" });
    expect(base.blockers.join(" ")).toMatch(/valid Stellar account/i);
    expect(base.status).not.toBe("READY_FOR_LIVE_DEPLOYMENT");
  });
  it("valid constructor admin passes gate", () => {
    const base = mkPreflight({ constructorAdmin: account });
    expect(base.gates.validConstructorAdmin).toBe(true);
    expect(base.checks.constructor).toBe("GREEN");
  });
  it("deployment account and constructor admin are separate concepts", () => {
    const same = mkPreflight({ account: { address: account, exists: true, sufficientBalance: true }, constructorAdmin: account });
    expect(same.gates.explicitDeploymentAccount).toBe(true);
    expect(same.gates.explicitConstructorAdmin).toBe(true);
    expect(same.gates.validConstructorAdmin).toBe(true);
    // even when same G..., both gates independently PASS
  });
});

describe("Phase 22: Complete deployment preflight gates", () => {
  it("all preflight gates satisfied → READY_FOR_LIVE_DEPLOYMENT", () => {
    const r = mkPreflight({
      network: "testnet",
      rpcReachable: true,
      artifact: { exists: true, sha256: "h", expectedSha256: "h", statuses: ["VERIFIED_MATCH" as const] },
      account: { address: account, exists: true, sufficientBalance: true },
      constructorAdmin: account,
      plans: { uploadValid: true, createValid: true },
      simulation: "SUCCESS",
      explicitRequest: true,
    });
    expect(r.status).toBe("READY_FOR_LIVE_DEPLOYMENT");
    expect(r.gates.testnetNetworkConfirmed).toBe(true);
    expect(r.gates.rpcHealthy).toBe(true);
    expect(r.gates.artifactVerified).toBe(true);
    expect(r.gates.explicitDeploymentAccount).toBe(true);
    expect(r.gates.deploymentAccountExists).toBe(true);
    expect(r.gates.sufficientNativeBalance).toBe(true);
    expect(r.gates.explicitConstructorAdmin).toBe(true);
    expect(r.gates.validConstructorAdmin).toBe(true);
  });

  it("artifact mismatch blocking → ARTIFACT_BLOCKED", () => {
    const r = mkPreflight({ artifact: { exists: true, sha256: "a", expectedSha256: "b", statuses: [] as never } });
    expect(r.status).toBe("ARTIFACT_BLOCKED");
  });

  it("artifact unavailable blocking → ARTIFACT_BLOCKED", () => {
    const r = mkPreflight({ artifact: { exists: false, sha256: null, expectedSha256: null, statuses: [] as never } });
    expect(r.status).toBe("ARTIFACT_BLOCKED");
  });

  it("simulation unavailable → SIMULATION_UNAVAILABLE", () => {
    const r = mkPreflight({ simulation: "UNAVAILABLE" });
    expect(r.status).toBe("SIMULATION_UNAVAILABLE");
  });
});

describe("Phase 22: Deployment transaction preparation (two-stage)", () => {
  it("successful upload simulation → PREPARED→SIMULATED", () => {
    expect(canPrepareUpload({ connectivityHealthy: true, artifactVerified: true, accountReady: true })).toBe(true);
    expect(canSimulateUpload({ prepared: true })).toBe(true);
    expect(canSimulateUpload({ prepared: false })).toBe(false);
  });

  it("creation blocked before upload simulation", () => {
    expect(canPrepareCreate({ uploadSimulated: false })).toBe(false);
    expect(canPrepareCreate({ uploadSimulated: true, uploadConfirmed: false })).toBe(false);
    expect(canPrepareCreate({ uploadSimulated: true, uploadConfirmed: true })).toBe(true);
    expect(canSimulateCreate({ createPrepared: true, uploadSimulated: false })).toBe(false);
  });

  it("successful creation simulation when prerequisites valid", () => {
    expect(canSimulateCreate({ createPrepared: true, uploadSimulated: true })).toBe(true);
  });
});

describe("Phase 22: Signing and submission boundaries (no auto)", () => {
  it("signing blocked before explicit confirmation", () => {
    expect(canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: false, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
    expect(canSignDeployment({ status: "SIMULATED" as never, userConfirmed: true, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
    expect(canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: true, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(true);
  });

  it("submission blocked before signing", () => {
    expect(canSubmitDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: true, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
    expect(canSubmitDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: true, simulationPassed: true, signedTransactionAvailable: true, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(true);
  });

  it("no automatic signing/submission/retry hidden behavior", () => {
    // Source must not contain autoSign/autoSubmit strings (checked via file content, but here we assert guards prevent auto)
    const autoSign = canSignDeployment({ status: "PREPARED" as never, userConfirmed: false, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false });
    expect(autoSign).toBe(false);
    const autoSubmit = canSubmitDeployment({ status: "PREPARED" as never, userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false });
    expect(autoSubmit).toBe(false);
  });
});

describe("Phase 22: Evidence progression strict", () => {
  it("evidence blocked before upload confirmation", () => {
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: true, contractId: "C", artifactVerified: true })).toBe(false);
  });
  it("evidence blocked before creation confirmation", () => {
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: true, creationConfirmed: false, contractId: "C", artifactVerified: true })).toBe(false);
  });
  it("evidence blocked before independent WASM verification", () => {
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: true, creationConfirmed: true, contractId: "C", artifactVerified: false })).toBe(false);
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: true, creationConfirmed: true, contractId: "C", artifactVerified: true })).toBe(true);
  });
  it("prepared cannot become deployed", () => {
    expect(canTransitionEvidence("PREPARED", "RECORDED")).toBe(false);
    expect(canTransitionEvidence("PREPARED", "CONFIRMED")).toBe(false);
    expect(isValidEvidenceProgression(["NO_EVIDENCE", "PREPARED", "RECORDED"])).toBe(false);
  });
  it("simulated cannot become verified", () => {
    expect(canTransitionEvidence("SIMULATED", "INDEPENDENTLY_VERIFIED")).toBe(false);
    expect(canTransitionEvidence("SIMULATED", "RECORDED")).toBe(false);
    expect(canTransitionEvidence("CONFIRMED", "RECORDED")).toBe(false);
    expect(isValidEvidenceProgression(["NO_EVIDENCE", "PREPARED", "SIMULATED", "INDEPENDENTLY_VERIFIED"])).toBe(false);
  });
});

// helper
function mkPreflight(overrides: Partial<Parameters<typeof runAccessControlPilotPreflight>[0]> = {}) {
  return runAccessControlPilotPreflight({
    component,
    network: "testnet",
    expectedPassphrase: passphrase,
    wallet: { connected: true, networkPassphrase: passphrase, address: account },
    rpcReachable: true,
    artifact: { exists: true, sha256: "h", expectedSha256: "h", statuses: ["VERIFIED_MATCH"] as const },
    constructorAdmin: account,
    account: { address: account, exists: true, sufficientBalance: true },
    plans: { uploadValid: true, createValid: true },
    simulation: "SUCCESS",
    explicitRequest: true,
    ...overrides,
  } as Parameters<typeof runAccessControlPilotPreflight>[0]);
}
