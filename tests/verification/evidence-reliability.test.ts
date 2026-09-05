import { describe, expect, it, vi } from "vitest";
import { attachRetrievalObservation, classifyRetrievalError, mergeRetrievalObservation, retrieveArtifact } from "@/lib/verification/artifact-retrieval";
import { createTestnetAccountReader, inspectPublicAccount } from "@/lib/verification/account-inspection";
import { Server } from "@stellar/stellar-sdk/rpc";
import { runAccessControlPilotPreflight } from "@/lib/verification/pilot-preflight";
import { stellarComponents } from "@/data/components";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";

const account = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const contract = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";

describe("Testnet evidence reliability", () => {
  it("classifies network failures without fabricating a hash", async () => {
    const result = await retrieveArtifact({ source: "rpc", method: "getWasm", retrieve: vi.fn().mockRejectedValue(new Error("fetch failed")) }, contract, "2026-01-01T00:00:00.000Z");
    expect(result.observation.errorCategory).toBe("NETWORK_UNAVAILABLE");
    expect(result.observation.artifactHash).toBeNull();
    expect(result.observation.authoritative).toBe(false);
  });

  it("preserves verified evidence after a transient failure", () => {
    const verified = { source: "rpc", success: true, contractReachable: true, wasmAvailable: true, artifactHash: "a", observedAt: "1", retrievalMethod: "rpc", confidence: "VERIFIED" as const, authoritative: true, supersedesPrevious: true };
    const failed = { source: "rpc", success: false, contractReachable: null, wasmAvailable: false, artifactHash: null, observedAt: "2", retrievalMethod: "rpc", confidence: "TRANSIENT_FAILURE" as const, errorCategory: "TIMEOUT" as const, authoritative: false, supersedesPrevious: false };
    expect(mergeRetrievalObservation([verified], failed).effectiveStatus).toBe("HISTORICAL_VERIFIED");
  });

  it("keeps mismatch history distinct from a later unavailable observation", () => {
    const first = { source: "rpc", success: true, contractReachable: true, wasmAvailable: true, artifactHash: "a", observedAt: "1", retrievalMethod: "rpc", confidence: "VERIFIED" as const, authoritative: true, supersedesPrevious: true };
    const second = { ...first, artifactHash: "b", observedAt: "2" };
    const failed = { source: "rpc", success: false, contractReachable: null, wasmAvailable: false, artifactHash: null, observedAt: "3", retrievalMethod: "rpc", confidence: "TRANSIENT_FAILURE" as const, errorCategory: "RPC_UNAVAILABLE" as const, authoritative: false, supersedesPrevious: false };
    expect(mergeRetrievalObservation([first, second], failed).effectiveStatus).toBe("HISTORICAL_DEPLOYMENT_MISMATCH");
  });

  it("classifies unsupported methods and contract-not-found only from explicit errors", () => {
    expect(classifyRetrievalError(new Error("method not supported")).category).toBe("RPC_METHOD_UNSUPPORTED");
    expect(classifyRetrievalError(new Error("404 not found")).category).toBe("CONTRACT_NOT_FOUND");
    expect(classifyRetrievalError(new Error("socket reset")).category).toBe("UNKNOWN_ERROR");
  });

  it("inspects only public account data", async () => {
    const reader = { getNativeBalance: vi.fn().mockResolvedValue("10") };
    const result = await inspectPublicAccount({ address: account, reader, minimumNativeBalance: "5" });
    expect(["ACCOUNT_READY", "ACCOUNT_VERIFIED"]).toContain(result.status);
    expect(reader.getNativeBalance).toHaveBeenCalledWith(account);
    expect(JSON.stringify(result)).not.toMatch(/private|seed|secret/i);
    expect(result.network).toBe("testnet");
    expect(result.exists).toBe(true);
  });

  it("uses canonical Testnet Horizon for native balance alongside Soroban sequence", async () => {
    const getAccount = vi.spyOn(Server.prototype, "getAccount").mockResolvedValue({ sequenceNumber: () => "42" } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ balances: [{ asset_type: "native", balance: "10" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reader = createTestnetAccountReader("https://soroban-testnet.stellar.org");
    const result = await inspectPublicAccount({ address: account, reader, minimumNativeBalance: "1" });

    expect(result.status).toBe("ACCOUNT_READY");
    expect(result.sequenceNumber).toBe("42");
    expect(result.nativeBalance).toBe("10");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://horizon-testnet.stellar.org/accounts/"),
      expect.objectContaining({ signal: expect.anything() }),
    );
    getAccount.mockRestore();
    vi.unstubAllGlobals();
  });

  it("rejects non-canonical account-reader RPC configuration", async () => {
    const reader = createTestnetAccountReader("https://example.invalid");
    const result = await inspectPublicAccount({ address: account, reader, minimumNativeBalance: "1" });
    expect(result.status).toBe("RPC_UNAVAILABLE");
    expect(result.error).toMatch(/canonical Testnet RPC/i);
  });
});

describe("Access Control pilot preflight", () => {
  const base = { component: stellarComponents.find((item) => item.slug === "access-control") ?? null, network: "testnet", expectedPassphrase: "Test SDF Network ; September 2015", wallet: { connected: true, networkPassphrase: "Test SDF Network ; September 2015", address: account }, rpcReachable: true, artifact: { exists: true, sha256: "a", expectedSha256: "a", statuses: ["VERIFIED_MATCH"] as const }, constructorAdmin: account, account: { address: account, exists: true, sufficientBalance: true }, plans: { uploadValid: true, createValid: true }, simulation: "SUCCESS" as const, explicitRequest: true };

  it("reaches live-deployment readiness only when every gate passes", () => {
    expect(runAccessControlPilotPreflight(base).status).toBe("READY_FOR_LIVE_DEPLOYMENT");
  });

  it("blocks missing admin, wrong network, and unavailable simulation", () => {
    expect(runAccessControlPilotPreflight({ ...base, constructorAdmin: "" }).status).not.toBe("READY_FOR_LIVE_DEPLOYMENT");
    expect(runAccessControlPilotPreflight({ ...base, network: "mainnet" }).status).toBe("PREFLIGHT_BLOCKED");
    expect(runAccessControlPilotPreflight({ ...base, simulation: "UNAVAILABLE" }).status).toBe("SIMULATION_UNAVAILABLE");
  });
});

it("attachRetrievalObservation retains the observation trail", () => {
  const evidence: DeploymentEvidence = { componentId: "access-control", network: "testnet", contractId: contract, sourceArtifact: { path: "a", sha256: "a" }, prebuiltArtifact: { path: "b", sha256: "a" }, deployedArtifact: { sha256: "a" }, artifactParity: { sourceMatchesPrebuilt: true, prebuiltMatchesDeployed: true, sourceMatchesDeployed: true }, provenance: { metadataCommit: null, currentRepositoryCommit: null }, verification: { verifiedAt: "1", verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId" }, status: ["VERIFIED_MATCH"] };
  const observation = { source: "rpc", success: false, contractReachable: null, wasmAvailable: false, artifactHash: null, observedAt: "2", retrievalMethod: "rpc", confidence: "TRANSIENT_FAILURE" as const, errorCategory: "TIMEOUT" as const, authoritative: false, supersedesPrevious: false };
  expect(attachRetrievalObservation(evidence, observation).observations).toHaveLength(1);
});
