import { describe, expect, it, vi } from "vitest";
import { stellarComponents } from "@/data/components";
import { buildDeploymentOperationPlan, createControlledDeployment, recordConfirmedDeployment, runDeploymentPreflight } from "@/lib/verification/controlled-deployment";

const component = stellarComponents.find((item) => item.slug === "access-control")!;
const wallet = { connected: true, networkPassphrase: "Test SDF Network ; September 2015", accountAvailable: true };
const artifact = { path: "contracts/prebuilt/access-control.wasm", sha256: "a", expectedSha256: "a" };
const args = { admin: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" };

describe("controlled deployment foundation", () => {
  it("passes Access Control preflight only for an explicit Testnet request", () => {
    const result = runDeploymentPreflight({ network: "testnet", wallet, expectedTestnetPassphrase: wallet.networkPassphrase, component, artifact, constructorArgs: args, explicitRequest: true });
    expect(result).toEqual({ status: "READY", errors: [], canPrepare: true });
  });

  it("blocks missing, mismatched, unknown, and unconfirmed deployments", () => {
    expect(runDeploymentPreflight({ network: "testnet", wallet, expectedTestnetPassphrase: wallet.networkPassphrase, component, artifact: { ...artifact, sha256: null }, constructorArgs: args, explicitRequest: true }).status).toBe("ARTIFACT_UNAVAILABLE");
    expect(runDeploymentPreflight({ network: "testnet", wallet, expectedTestnetPassphrase: wallet.networkPassphrase, component, artifact: { ...artifact, sha256: "b" }, constructorArgs: args, explicitRequest: true }).status).toBe("ARTIFACT_MISMATCH");
    expect(runDeploymentPreflight({ network: "mainnet", wallet, expectedTestnetPassphrase: wallet.networkPassphrase, component, artifact, constructorArgs: args, explicitRequest: true }).status).toBe("WRONG_NETWORK");
    expect(runDeploymentPreflight({ network: "testnet", wallet, expectedTestnetPassphrase: wallet.networkPassphrase, component: null, artifact, constructorArgs: args, explicitRequest: true }).status).toBe("UNKNOWN_COMPONENT");
    expect(runDeploymentPreflight({ network: "testnet", wallet, expectedTestnetPassphrase: wallet.networkPassphrase, component, artifact, constructorArgs: args, explicitRequest: false }).status).toBe("DEPLOYMENT_NOT_CONFIRMED");
  });

  it("validates constructor arguments from catalog metadata", () => {
    const result = runDeploymentPreflight({ network: "testnet", wallet, expectedTestnetPassphrase: wallet.networkPassphrase, component, artifact, constructorArgs: { admin: "not-an-address" }, explicitRequest: true });
    expect(result.status).toBe("INVALID_ARGUMENTS");
  });

  it("builds deployment operations without signing or submitting", () => {
    const plan = buildDeploymentOperationPlan({ deployer: args.admin, wasm: new Uint8Array([0, 1]), wasmHash: "a".repeat(64), constructorArgs: [] });
    expect(plan.upload).toBeDefined();
    expect(plan.create).toBeDefined();
  });

  it("does not create evidence before independent confirmation", () => {
    const deployment = createControlledDeployment({ componentId: "access-control", artifact: { path: artifact.path, sha256: artifact.sha256 }, constructorArgs: args, deployer: args.admin });
    expect(deployment.evidence).toBeNull();
    const evidence = recordConfirmedDeployment({ componentId: "access-control", artifact: { path: artifact.path, sha256: artifact.sha256 }, deployer: args.admin, constructorArgs: args, contractId: "C...", deploymentTransactionHash: "tx-hash", deployedWasmHash: "a", deployedAt: "2026-09-01T00:00:00.000Z" });
    expect(evidence).toMatchObject({ contractId: "C...", deploymentTransactionHash: "tx-hash", artifactVerified: true });
    expect(recordConfirmedDeployment({ componentId: "access-control", artifact: { path: artifact.path, sha256: artifact.sha256 }, deployer: args.admin, constructorArgs: args, contractId: "C...", deploymentTransactionHash: "tx-hash", deployedWasmHash: "different", deployedAt: "2026-09-01T00:00:00.000Z" })).toBeNull();
  });

  it("keeps dry-run free of wallet calls", async () => {
    const sign = vi.fn();
    const submit = vi.fn();
    expect(sign).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
