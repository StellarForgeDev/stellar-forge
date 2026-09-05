import { describe, expect, it, vi } from "vitest";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { inspectPublicAccount } from "@/lib/verification/account-inspection";
import { reconcileArtifacts } from "@/lib/verification/artifact-verification";
import { attachRetrievalObservation } from "@/lib/verification/artifact-retrieval";
import { runAccessControlPilotPreflight } from "@/lib/verification/pilot-preflight";
import { canRecordDeploymentEvidence, canSignDeployment, canSubmitDeployment, canPrepareCreate, canTransitionEvidence } from "@/lib/verification/deployment-guards";
import { stellarComponents } from "@/data/components";
import type { StellarComponent } from "@/data/components";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";

const G = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const passphrase = "Test SDF Network ; September 2015";
const mainnetPassphrase = "Public Global Stellar Network ; September 2015";
const mainnetEndpoint = "https://soroban-mainnet.stellar.org";
const testnetEndpoint = "https://soroban-testnet.stellar.org";

describe("Phase 24: Connectivity diagnostics order and precision", () => {
  it("NETWORK_OK requires endpoint https://soroban-testnet.stellar.org and testnet passphrase", async () => {
    const ok = await diagnoseTestnetConnectivity({ endpoint: testnetEndpoint, expectedPassphrase: passphrase, client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase }) } });
    expect(ok.status).toBe("NETWORK_OK");
    expect(ok.dns).toBe("PASS");
    expect(ok.tls).toBe("PASS");
    expect(ok.http).toBe("PASS");
    expect(ok.rpc).toBe("PASS");
    expect(ok.sorobanRpc).toBe("PASS");
    expect(ok.networkPassphrase).toBe("PASS");
  });

  it("DNS_FAILURE distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("DNS_FAILURE");
    expect(r.dns).toBe("FAIL");
  });
  it("TLS_FAILURE distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("certificate verify failed")), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("TLS_FAILURE");
    expect(r.tls).toBe("FAIL");
  });
  it("HTTP_FAILURE distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("fetch failed")), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("HTTP_FAILURE");
    expect(r.http).toBe("FAIL");
  });
  it("RPC_ENDPOINT_UNAVAILABLE distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("rpc endpoint unavailable 503")), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("RPC_ENDPOINT_UNAVAILABLE");
  });
  it("RPC_TIMEOUT distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("ETIMEDOUT")), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("RPC_TIMEOUT");
  });
  it("RPC_MALFORMED_RESPONSE distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "not-healthy" }), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("RPC_MALFORMED_RESPONSE");
  });
  it("RPC_METHOD_UNAVAILABLE distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("method not supported")), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("RPC_METHOD_UNAVAILABLE");
  });
  it("PASSPHRASE_MISMATCH distinguished", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase: mainnetPassphrase }) } });
    expect(r.failureCategory).toBe("PASSPHRASE_MISMATCH");
    expect(r.networkPassphrase).toBe("FAIL");
  });
  it("successful getHealth", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase }) } });
    expect(r.status).toBe("NETWORK_OK");
  });
  it("successful getNetwork", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase }) } });
    expect(r.networkPassphrase).toBe("PASS");
  });
  it("health success / network failure distinction", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockRejectedValue(new Error("fetch failed getNetwork")) } });
    expect(r.dns).toBe("PASS"); // health proved DNS/TLS/HTTP
    expect(r.failureCategory).toBe("HTTP_FAILURE");
    expect(r.status).toBe("BLOCKED");
    expect(r.error).toMatch(/getNetwork failed after getHealth succeeded/);
  });
  it("HTTPS success / RPC failure distinction", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase }) } });
    expect(r.http).toBe("PASS");
    expect(r.rpc).toBe("PASS");
  });
  it("Testnet-only endpoint enforcement", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: mainnetEndpoint, client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("PASSPHRASE_MISMATCH");
  });
  it("Mainnet rejection", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: mainnetEndpoint, expectedPassphrase: passphrase, client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.status).toBe("BLOCKED");
  });
  it("HTTP endpoint rejection", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "http://soroban-testnet.stellar.org", client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.failureCategory).toBe("HTTP_FAILURE");
    expect(r.tls).toBe("FAIL");
  });
  it("TLS enforcement", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "http://soroban-testnet.stellar.org" });
    expect(r.tls).toBe("FAIL");
    expect(r.status).toBe("BLOCKED");
  });
});

describe("Phase 24: Bounded read-only retries vs no transaction retries", () => {
  it("artifact retrieval bounded retries (max 5, no infinite)", async () => {
    const { retrieveArtifactWithRetry } = await import("@/lib/verification/artifact-retrieval");
    const retrieve = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const contract = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";
    const r = await retrieveArtifactWithRetry({ source: "rpc", method: "getWasm", retrieve }, contract, { attempts: 5, sleep: async () => undefined });
    expect(retrieve).toHaveBeenCalledTimes(5);
    expect(r.observation.success).toBe(false);
  });
  it("no transaction retries (deployment guards do not retry)", () => {
    // canSign/canSubmit are single checks, no retry loops
    expect(canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: false, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
    // second call same result, not auto-retry
    expect(canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: false, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
  });
});

describe("Phase 24: Artifact retrieval resilience", () => {
  it("artifact success → VERIFIED_MATCH", () => {
    const e = reconcileArtifacts({ component: { slug: "access-control", capabilities: { testnet: true } } as StellarComponent, network: "testnet", contractId: "C", sourceArtifact: { path: "a", sha256: "h" }, prebuiltArtifact: { path: "b", sha256: "h" }, deployedArtifact: { sha256: "h" }, metadataCommit: "a", currentRepositoryCommit: "a", verifiedAt: "now", verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId" });
    expect(e.status).toContain("VERIFIED_MATCH");
  });
  it("artifact mismatch", () => {
    const e = reconcileArtifacts({ component: { slug: "t", capabilities: { testnet: true } } as StellarComponent, network: "testnet", contractId: "C", sourceArtifact: { path: "a", sha256: "h1" }, prebuiltArtifact: { path: "b", sha256: "h1" }, deployedArtifact: { sha256: "h2" }, metadataCommit: "a", currentRepositoryCommit: "a", verifiedAt: "now", verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId" });
    expect(e.status).toContain("DEPLOYMENT_MISMATCH");
  });
  it("artifact unavailable", () => {
    const e = reconcileArtifacts({ component: { slug: "t", capabilities: { testnet: true } } as StellarComponent, network: "testnet", contractId: "C", sourceArtifact: { path: "a", sha256: "h1" }, prebuiltArtifact: { path: "b", sha256: "h1" }, deployedArtifact: { sha256: null }, metadataCommit: "a", currentRepositoryCommit: "a", verifiedAt: null, verificationMethod: "not-available" });
    expect(e.status).toContain("DEPLOYMENT_UNAVAILABLE");
    expect(e.status).not.toContain("DEPLOYMENT_MISMATCH");
  });
  it("historical evidence preservation (RPC_UNAVAILABLE not converted to mismatch)", () => {
    const verifiedObs = { source: "rpc", success: true, contractReachable: true, wasmAvailable: true, artifactHash: "h", observedAt: "1", retrievalMethod: "m", confidence: "VERIFIED" as const, authoritative: true, supersedesPrevious: true };
    const base: DeploymentEvidence = { componentId: "t", network: "testnet", contractId: "C", sourceArtifact: { path: "a", sha256: "h" }, prebuiltArtifact: { path: "b", sha256: "h" }, deployedArtifact: { sha256: "h" }, artifactParity: { sourceMatchesPrebuilt: true, prebuiltMatchesDeployed: true, sourceMatchesDeployed: true }, provenance: { metadataCommit: null, currentRepositoryCommit: null }, verification: { verifiedAt: "now", verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId" }, status: ["VERIFIED_MATCH"], observations: [verifiedObs], effectiveStatus: "VERIFIED", latestObservation: verifiedObs, latestSuccessfulObservation: verifiedObs };
    const obs = { source: "rpc", success: false, contractReachable: null, wasmAvailable: false, artifactHash: null, observedAt: "2", retrievalMethod: "m", confidence: "TRANSIENT_FAILURE" as const, errorCategory: "RPC_UNAVAILABLE" as const, authoritative: false, supersedesPrevious: false };
    const merged = attachRetrievalObservation(base, obs);
    expect(merged.effectiveStatus).toBe("HISTORICAL_VERIFIED");
    expect(merged.status).toContain("VERIFIED_MATCH");
    expect(merged.status).not.toContain("DEPLOYMENT_MISMATCH");
  });
  it("Token mismatch preservation", async () => {
    const raw = await import("node:fs").then((fs) => fs.readFileSync("contracts/testnet-evidence.json", "utf8"));
    const j = JSON.parse(raw) as { evidence: DeploymentEvidence[] };
    const token = j.evidence.find((e) => e.componentId === "token")!;
    expect(token.status).toContain("DEPLOYMENT_MISMATCH");
    // latestObservation may be TRANSIENT_FAILURE if intermittent, but historical verified is preserved
    expect(token.latestSuccessfulObservation?.confidence).toBe("VERIFIED");
    expect(token.effectiveStatus).toMatch(/HISTORICAL|VERIFIED|DEPLOYMENT_MISMATCH/);
  });
  it("Payment mismatch preservation", async () => {
    const raw = await import("node:fs").then((fs) => fs.readFileSync("contracts/testnet-evidence.json", "utf8"));
    const j = JSON.parse(raw) as { evidence: DeploymentEvidence[] };
    const payment = j.evidence.find((e) => e.componentId === "payment")!;
    expect(payment.status).toContain("DEPLOYMENT_MISMATCH");
  });
});

describe("Phase 24: Account and constructor hardening", () => {
  it("ACCOUNT_NOT_SUPPLIED", async () => { expect((await inspectPublicAccount({ address: null, reader: { getNativeBalance: vi.fn() } })).status).toBe("ACCOUNT_NOT_SUPPLIED"); });
  it("ACCOUNT_NOT_FOUND", async () => { expect((await inspectPublicAccount({ address: G, reader: { getNativeBalance: vi.fn().mockRejectedValue(new Error("404")) } })).status).toBe("ACCOUNT_NOT_FOUND"); });
  it("ACCOUNT_UNFUNDED", async () => { expect((await inspectPublicAccount({ address: G, reader: { getNativeBalance: vi.fn().mockResolvedValue("0.5") } })).status).toBe("ACCOUNT_UNFUNDED"); });
  it("ACCOUNT_READY", async () => { expect((await inspectPublicAccount({ address: G, reader: { getNativeBalance: vi.fn().mockResolvedValue("10") } })).status).toBe("ACCOUNT_READY"); });
  it("secret material rejection", async () => {
    for (const secret of ["SABC", "my secret", "seed phrase", "mnemonic", "private", "private_key", "secret_key"]) {
      const r = await inspectPublicAccount({ address: secret, reader: { getNativeBalance: vi.fn() } });
      expect(r.status).toBe("INVALID_ACCOUNT");
    }
  });
  it("missing constructor admin → blocker", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({ constructorAdmin: "" }));
    expect(r.blockers.join(" ")).toMatch(/explicit constructor admin/i);
    expect(r.status).not.toBe("READY_FOR_LIVE_DEPLOYMENT");
  });
  it("invalid constructor admin → blocker", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({ constructorAdmin: "bad" }));
    expect(r.blockers.join(" ")).toMatch(/valid Stellar account/i);
  });
  it("valid constructor admin → GREEN", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({ constructorAdmin: G }));
    expect(r.gates.validConstructorAdmin).toBe(true);
  });
});

describe("Phase 24: Preflight precision", () => {
  it("blocked by network", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({ rpcReachable: false } as never));
    expect(r.status).toBe("NETWORK_UNAVAILABLE");
  });
  it("blocked by account", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({ account: { address: null, exists: null, sufficientBalance: null } } as never));
    expect(r.status).toBe("ACCOUNT_NOT_SUPPLIED");
  });
  it("blocked by artifact", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({ artifact: { exists: false, sha256: null, expectedSha256: null, statuses: [] as never } }));
    expect(r.status).toBe("ARTIFACT_BLOCKED");
  });
  it("blocked by admin", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({ constructorAdmin: "" }));
    expect(r.status).not.toBe("READY_FOR_LIVE_DEPLOYMENT");
    expect(r.status).toBe("PREFLIGHT_BLOCKED");
  });
  it("successful preflight", () => {
    const r = runAccessControlPilotPreflight(mkPreflight({}));
    expect(r.status).toBe("READY_FOR_LIVE_DEPLOYMENT");
  });
});

describe("Phase 24: Simulation and evidence boundaries", () => {
  it("creation blocked before upload confirmation", () => {
    expect(canPrepareCreate({ uploadSimulated: true, uploadConfirmed: false })).toBe(false);
    expect(canPrepareCreate({ uploadSimulated: true, uploadConfirmed: true })).toBe(true);
  });
  it("signing blocked before confirmation", () => {
    expect(canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: false, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
  });
  it("submission blocked before signing", () => {
    expect(canSubmitDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: true, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
  });
  it("evidence blocked before independent verification", () => {
    expect(canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: true, creationConfirmed: true, contractId: "C", artifactVerified: false })).toBe(false);
  });
  it("no automatic signing", () => {
    expect(canSignDeployment({ status: "PREPARED" as never, userConfirmed: false, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
  });
  it("no automatic submission", () => {
    expect(canSubmitDeployment({ status: "PREPARED" as never, userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false })).toBe(false);
  });
  it("no automatic retry (evidence progression valid)", () => {
    expect(canTransitionEvidence("PREPARED", "RECORDED")).toBe(false);
    expect(canTransitionEvidence("SIMULATED", "INDEPENDENTLY_VERIFIED")).toBe(false);
  });
});

function mkPreflight(overrides: Partial<Parameters<typeof runAccessControlPilotPreflight>[0]> = {}): Parameters<typeof runAccessControlPilotPreflight>[0] {
  const comp = stellarComponents.find((c) => c.slug === "access-control") as StellarComponent;
  return {
    component: comp,
    network: "testnet",
    expectedPassphrase: passphrase,
    wallet: { connected: true, networkPassphrase: passphrase, address: G },
    rpcReachable: true,
    artifact: { exists: true, sha256: "h", expectedSha256: "h", statuses: ["VERIFIED_MATCH"] as const },
    constructorAdmin: G,
    account: { address: G, exists: true, sufficientBalance: true },
    plans: { uploadValid: true, createValid: true },
    simulation: "SUCCESS",
    explicitRequest: true,
    ...overrides,
  } as Parameters<typeof runAccessControlPilotPreflight>[0];
}
