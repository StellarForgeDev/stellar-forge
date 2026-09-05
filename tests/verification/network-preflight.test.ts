import { describe, expect, it } from "vitest";
import { stellarComponents } from "@/data/components";
import { runNetworkPreflight } from "@/lib/verification/network-preflight";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";

const evidence = { componentId: "access-control", contractId: "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY", status: ["VERIFIED_MATCH"] } as DeploymentEvidence;
const request = { network: "testnet" as const, component: "access-control", method: "has_role", sourceAccount: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", parameters: { role: "member", account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" } };
const wallet = { connected: true, networkPassphrase: "Test SDF Network ; September 2015", accountAvailable: true };

describe("network preflight", () => {
  it("accepts an artifact-verified Testnet read candidate", () => {
    const result = runNetworkPreflight({ request, components: stellarComponents, artifactEvidence: evidence, wallet, expectedTestnetPassphrase: wallet.networkPassphrase });
    expect(result.status).toBe("READY");
  });
  it("blocks artifact mismatches generically", () => {
    const result = runNetworkPreflight({ request, components: stellarComponents, artifactEvidence: { ...evidence, status: ["DEPLOYMENT_MISMATCH"] }, wallet, expectedTestnetPassphrase: wallet.networkPassphrase });
    expect(result.status).toBe("ARTIFACT_MISMATCH");
  });
  it("classifies wallet and network failures", () => {
    expect(runNetworkPreflight({ request, components: stellarComponents, artifactEvidence: evidence, wallet: { ...wallet, connected: false }, expectedTestnetPassphrase: wallet.networkPassphrase }).status).toBe("WALLET_NOT_CONNECTED");
    expect(runNetworkPreflight({ request: { ...request, network: "mainnet" }, components: stellarComponents, artifactEvidence: evidence, wallet, expectedTestnetPassphrase: wallet.networkPassphrase }).status).toBe("WRONG_NETWORK");
  });
  it("rejects invalid methods and arguments", () => {
    expect(runNetworkPreflight({ request: { ...request, method: "missing" }, components: stellarComponents, artifactEvidence: evidence, wallet, expectedTestnetPassphrase: wallet.networkPassphrase }).status).toBe("INVALID_METHOD");
    expect(runNetworkPreflight({ request: { ...request, parameters: {} }, components: stellarComponents, artifactEvidence: evidence, wallet, expectedTestnetPassphrase: wallet.networkPassphrase }).status).toBe("INVALID_ARGUMENTS");
  });
});
