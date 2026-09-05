import { describe, expect, it, vi } from "vitest";
import { classifyConnectivityError, diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { inspectPublicAccount } from "@/lib/verification/account-inspection";
import { reconcileArtifacts } from "@/lib/verification/artifact-verification";
import { runAccessControlPilotPreflight } from "@/lib/verification/pilot-preflight";
import { canRecordDeploymentEvidence, canSignDeployment, canTransitionEvidence, isValidEvidenceProgression } from "@/lib/verification/deployment-guards";
import { stellarComponents } from "@/data/components";
import type { StellarComponent } from "@/data/components";

const account = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const passphrase = "Test SDF Network ; September 2015";
const healthyClient = { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase }) };
const component = stellarComponents.find((c) => c.slug === "access-control") as StellarComponent;

describe("Phase 21: Testnet connectivity classifications", () => {
  it("successful connectivity returns NETWORK_OK", async () => {
    const result = await diagnoseTestnetConnectivity({ client: healthyClient, observedAt: "2026-09-01T00:00:00.000Z" });
    expect(["NETWORK_OK", "HEALTHY"]).toContain(result.status);
    expect(result.dns).toBe("PASS");
    expect(result.tls).toBe("PASS");
    expect(result.http).toBe("PASS");
    expect(result.rpc).toBe("PASS");
    expect(result.sorobanRpc).toBe("PASS");
    expect(result.networkPassphrase).toBe("PASS");
  });

  it("DNS failure is distinguished", async () => {
    expect(classifyConnectivityError(new Error("getaddrinfo ENOTFOUND soroban-testnet.stellar.org")).category).toBe("DNS_FAILURE");
    const result = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")), getNetwork: vi.fn() } });
    expect(result.failureCategory).toBe("DNS_FAILURE");
    expect(result.dns).toBe("FAIL");
  });

  it("TLS failure is distinguished", async () => {
    expect(classifyConnectivityError(new Error("certificate verify failed")).category).toBe("TLS_FAILURE");
    const result = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("TLS certificate expired")), getNetwork: vi.fn() } });
    expect(result.failureCategory).toBe("TLS_FAILURE");
    expect(result.tls).toBe("FAIL");
  });

  it("HTTP failure is distinguished", async () => {
    expect(classifyConnectivityError(new Error("fetch failed")).category).toBe("HTTP_FAILURE");
    const result = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("fetch failed")), getNetwork: vi.fn() } });
    expect(result.failureCategory).toBe("HTTP_FAILURE");
    expect(result.http).toBe("FAIL");
  });

  it("RPC timeout is distinguished", async () => {
    expect(classifyConnectivityError(new Error("request timed out after 10000ms")).category).toBe("RPC_TIMEOUT");
    const result = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("ETIMEDOUT")), getNetwork: vi.fn() } });
    expect(result.failureCategory).toBe("RPC_TIMEOUT");
  });

  it("malformed RPC response is distinguished", async () => {
    expect(classifyConnectivityError(new Error("malformed JSON response")).category).toBe("RPC_MALFORMED_RESPONSE");
    const result = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "unknown" }), getNetwork: vi.fn() } });
    expect(result.failureCategory).toBe("RPC_MALFORMED_RESPONSE");
  });

  it("wrong passphrase returns PASSPHRASE_MISMATCH", async () => {
    const result = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase: "Public Global Stellar Network ; September 2015" }) } });
    expect(result.failureCategory).toBe("PASSPHRASE_MISMATCH");
    expect(result.networkPassphrase).toBe("FAIL");
  });
});

describe("Phase 21: Public deployment-account inspection", () => {
  it("account not supplied", async () => {
    const reader = { getNativeBalance: vi.fn() };
    const result = await inspectPublicAccount({ address: null, reader });
    expect(result.status).toBe("ACCOUNT_NOT_SUPPLIED");
    expect(result.exists).toBeNull();
  });

  it("unfunded account reports ACCOUNT_UNFUNDED", async () => {
    const reader = { getNativeBalance: vi.fn().mockResolvedValue("0.5") };
    const result = await inspectPublicAccount({ address: account, reader, minimumNativeBalance: "1" });
    expect(result.status).toBe("ACCOUNT_UNFUNDED");
    expect(result.sufficientBalance).toBe(false);
    expect(result.nativeBalance).toBe("0.5");
  });

  it("account not found is distinct", async () => {
    const reader = { getNativeBalance: vi.fn().mockRejectedValue(new Error("404 Not Found")) };
    const result = await inspectPublicAccount({ address: account, reader });
    expect(result.status).toBe("ACCOUNT_NOT_FOUND");
    expect(result.exists).toBe(false);
  });

  it("ready account reports ACCOUNT_READY with sequence and network", async () => {
    const reader = { getNativeBalance: vi.fn().mockResolvedValue("10"), getAccountDetails: vi.fn().mockResolvedValue({ sequence: "123", balances: [{ assetType: "native", balance: "10" }] }) } as unknown as { getNativeBalance: (a: string) => Promise<string>; getAccountDetails: (a: string) => Promise<{ sequence: string; balances: Array<{ assetType: string; balance: string }> }> };
    const result = await inspectPublicAccount({ address: account, reader, minimumNativeBalance: "1" });
    expect(result.status).toBe("ACCOUNT_READY");
    expect(result.sequenceNumber).toBe("123");
    expect(result.network).toBe("testnet");
    expect(result.sufficientBalance).toBe(true);
  });
});

describe("Phase 21: Artifact verification", () => {
  it("artifact mismatch is detected", () => {
    const result = reconcileArtifacts({
      component: { slug: "access-control", capabilities: { testnet: true } } as StellarComponent,
      network: "testnet",
      contractId: "C123",
      sourceArtifact: { path: "a", sha256: "hashA" },
      prebuiltArtifact: { path: "b", sha256: "hashA" },
      deployedArtifact: { sha256: "different" },
      metadataCommit: "same",
      currentRepositoryCommit: "same",
      verifiedAt: "now",
      verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId",
    });
    expect(result.status).toContain("DEPLOYMENT_MISMATCH");
  });

  it("artifact unavailable is distinct from mismatch", () => {
    const result = reconcileArtifacts({
      component: { slug: "access-control", capabilities: { testnet: true } } as StellarComponent,
      network: "testnet",
      contractId: "C123",
      sourceArtifact: { path: "a", sha256: "hashA" },
      prebuiltArtifact: { path: "b", sha256: "hashA" },
      deployedArtifact: { sha256: null },
      metadataCommit: "same",
      currentRepositoryCommit: "same",
      verifiedAt: null,
      verificationMethod: "not-available",
    });
    expect(result.status).toContain("DEPLOYMENT_UNAVAILABLE");
    expect(result.status).not.toContain("DEPLOYMENT_MISMATCH");
  });
});

describe("Phase 21: Access Control pilot preflight", () => {
  const base = {
    component,
    network: "testnet",
    expectedPassphrase: passphrase,
    wallet: { connected: true, networkPassphrase: passphrase, address: account },
    rpcReachable: true,
    artifact: { exists: true, sha256: "abc", expectedSha256: "abc", statuses: ["VERIFIED_MATCH"] as const },
    constructorAdmin: account,
    account: { address: account, exists: true, sufficientBalance: true },
    plans: { uploadValid: true, createValid: true },
    simulation: "SUCCESS" as const,
    explicitRequest: true,
  };

  it("successful Access Control preflight returns READY_FOR_LIVE_DEPLOYMENT", () => {
    expect(runAccessControlPilotPreflight(base).status).toBe("READY_FOR_LIVE_DEPLOYMENT");
  });

  it("simulation-unavailable blocks with SIMULATION_UNAVAILABLE", () => {
    expect(runAccessControlPilotPreflight({ ...base, simulation: "UNAVAILABLE" }).status).toBe("SIMULATION_UNAVAILABLE");
  });

  it("simulation success is required for live deployment", () => {
    const blocked = runAccessControlPilotPreflight({ ...base, simulation: "NOT_RUN" });
    expect(blocked.status).not.toBe("READY_FOR_LIVE_DEPLOYMENT");
    expect(blocked.status).toBe("READY_FOR_DRY_RUN");
  });
});

describe("Phase 21: Simulation and evidence boundaries", () => {
  it("confirmation cannot occur before simulation", () => {
    // canSign requires simulationPassed true and status AWAITING_CONFIRMATION
    expect(canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: true, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
    expect(canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: true, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(true);
    expect(canSignDeployment({ status: "NOT_STARTED", userConfirmed: true, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
  });

  it("evidence cannot be recorded before independent verification", () => {
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: true, creationConfirmed: true, contractId: "C123", artifactVerified: false })).toBe(false);
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: true, creationConfirmed: true, contractId: "C123", artifactVerified: true })).toBe(true);
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: true, contractId: "C123", artifactVerified: true })).toBe(false);
  });

  it("evidence progression guards prevent invalid transitions", () => {
    expect(canTransitionEvidence("SIMULATED", "RECORDED")).toBe(false);
    expect(canTransitionEvidence("SIMULATED", "AWAITING_USER_CONFIRMATION")).toBe(true);
    expect(canTransitionEvidence("CONFIRMED", "INDEPENDENTLY_VERIFIED")).toBe(true);
    expect(canTransitionEvidence("CONFIRMED", "RECORDED")).toBe(false);
    expect(canTransitionEvidence("PREPARED", "RECORDED")).toBe(false);
    expect(isValidEvidenceProgression(["NO_EVIDENCE", "PREPARED", "SIMULATED", "AWAITING_USER_CONFIRMATION", "SIGNED", "SUBMITTED", "CONFIRMED", "INDEPENDENTLY_VERIFIED", "RECORDED"])).toBe(true);
    expect(isValidEvidenceProgression(["NO_EVIDENCE", "SIMULATED"])).toBe(false);
    expect(isValidEvidenceProgression(["SIMULATED", "RECORDED"])).toBe(false);
  });
});
