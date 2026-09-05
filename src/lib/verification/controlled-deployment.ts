import { Address, Operation } from "@stellar/stellar-sdk";
import type { StellarComponent } from "../../data/components";
import { buildInvocationArgs } from "../transactions/args";
import type { TransactionNetwork } from "../transactions/networks.ts";

export const CONTROLLED_DEPLOYMENT_STATUSES = [
  "NOT_STARTED", "PREFLIGHT_BLOCKED", "PREPARED", "SIMULATED", "AWAITING_CONFIRMATION",
  "AWAITING_SIGNATURE", "SUBMITTED", "CONFIRMED", "FAILED", "RECORDED",
] as const;
export type ControlledDeploymentStatus = (typeof CONTROLLED_DEPLOYMENT_STATUSES)[number];

export interface ControlledDeploymentEvidence {
  componentId: string;
  artifactPath: string;
  artifactHash: string;
  network: "testnet";
  contractId: string;
  deploymentTransactionHash: string;
  deployer: string;
  constructorArgs: Record<string, string>;
  deployedAt: string;
  artifactVerified: boolean;
  verificationPurpose: "controlled-testnet-workflow";
}

export interface ControlledDeployment {
  componentId: string;
  network: "testnet";
  artifact: { path: string; sha256: string };
  constructorArgs: Record<string, string>;
  deployer: string;
  status: ControlledDeploymentStatus;
  preparedTransaction: { upload: unknown; create: unknown } | null;
  simulation: unknown | null;
  signed: boolean;
  submission: { transactionHash: string; status: string } | null;
  confirmation: { contractId: string; deployedWasmHash: string } | null;
  evidence: ControlledDeploymentEvidence | null;
}

export interface DeploymentPreflightInput {
  network: TransactionNetwork;
  wallet: { connected: boolean; networkPassphrase: string | null; accountAvailable: boolean };
  expectedTestnetPassphrase: string;
  component: StellarComponent | null;
  artifact: { path: string; sha256: string | null; expectedSha256: string | null };
  constructorArgs: Record<string, string>;
  explicitRequest: boolean;
}

export const DEPLOYMENT_PREFLIGHT_STATUSES = [
  "READY", "WALLET_NOT_CONNECTED", "WRONG_NETWORK", "ACCOUNT_UNAVAILABLE", "UNKNOWN_COMPONENT",
  "ARTIFACT_UNAVAILABLE", "ARTIFACT_MISMATCH", "INVALID_CONSTRUCTOR", "INVALID_ARGUMENTS", "DEPLOYMENT_NOT_CONFIRMED",
] as const;
export type DeploymentPreflightStatus = (typeof DEPLOYMENT_PREFLIGHT_STATUSES)[number];
export interface DeploymentPreflightResult { status: DeploymentPreflightStatus; errors: string[]; canPrepare: boolean; }

export function createControlledDeployment(input: Pick<ControlledDeployment, "componentId" | "artifact" | "constructorArgs" | "deployer">): ControlledDeployment {
  return { ...input, network: "testnet", status: "NOT_STARTED", preparedTransaction: null, simulation: null, signed: false, submission: null, confirmation: null, evidence: null };
}

export function runDeploymentPreflight(input: DeploymentPreflightInput): DeploymentPreflightResult {
  const errors: string[] = [];
  if (input.network !== "testnet") errors.push("Controlled deployments are restricted to Stellar Testnet.");
  if (!input.wallet.connected) errors.push("Connect a wallet before preparing a deployment.");
  if (input.wallet.connected && input.wallet.networkPassphrase !== input.expectedTestnetPassphrase) errors.push("The connected wallet is not on Stellar Testnet.");
  if (!input.wallet.accountAvailable) errors.push("The deployer account is unavailable on Testnet.");
  if (!input.component) errors.push("The requested component is not in the catalog.");
  if (!input.artifact.sha256) errors.push("The local deployment artifact is unavailable.");
  if (input.artifact.sha256 && input.artifact.expectedSha256 && input.artifact.sha256 !== input.artifact.expectedSha256) errors.push("The local artifact hash does not match the expected artifact hash.");
  const constructor = input.component?.interface?.find((method) => method.name === "__constructor");
  if (!constructor) errors.push("The component has no constructor metadata.");
  if (constructor) {
    const args = buildInvocationArgs(constructor.params, input.constructorArgs);
    if (!args.ok) errors.push(args.error.message);
  }
  if (!input.explicitRequest) errors.push("Deployment must be explicitly requested by the user.");
  const status: DeploymentPreflightStatus = input.network !== "testnet" ? "WRONG_NETWORK" : !input.wallet.connected ? "WALLET_NOT_CONNECTED" : input.wallet.connected && input.wallet.networkPassphrase !== input.expectedTestnetPassphrase ? "WRONG_NETWORK" : !input.wallet.accountAvailable ? "ACCOUNT_UNAVAILABLE" : !input.component ? "UNKNOWN_COMPONENT" : !input.artifact.sha256 ? "ARTIFACT_UNAVAILABLE" : input.artifact.expectedSha256 !== null && input.artifact.sha256 !== input.artifact.expectedSha256 ? "ARTIFACT_MISMATCH" : !constructor ? "INVALID_CONSTRUCTOR" : !input.explicitRequest ? "DEPLOYMENT_NOT_CONFIRMED" : errors.length > 0 ? "INVALID_ARGUMENTS" : "READY";
  return { status, errors, canPrepare: status === "READY" };
}

export interface DeploymentOperationPlan { wasmHash: string; upload: ReturnType<typeof Operation.uploadContractWasm>; create: ReturnType<typeof Operation.createCustomContract>; }

/** Builds the two Soroban deployment operations without building, signing, or submitting a transaction. */
export function buildDeploymentOperationPlan(input: { deployer: string; wasm: Uint8Array; wasmHash: string; constructorArgs: import("@stellar/stellar-sdk").xdr.ScVal[] }): DeploymentOperationPlan {
  return {
    wasmHash: input.wasmHash,
    upload: Operation.uploadContractWasm({ wasm: Buffer.from(input.wasm), source: input.deployer }),
    create: Operation.createCustomContract({ address: new Address(input.deployer), wasmHash: Buffer.from(input.wasmHash, "hex"), constructorArgs: input.constructorArgs }),
  };
}

export function recordConfirmedDeployment(input: { componentId: string; artifact: { path: string; sha256: string }; deployer: string; constructorArgs: Record<string, string>; contractId: string; deploymentTransactionHash: string; deployedWasmHash: string; deployedAt: string }): ControlledDeploymentEvidence | null {
  if (input.artifact.sha256 !== input.deployedWasmHash) return null;
  return { componentId: input.componentId, artifactPath: input.artifact.path, artifactHash: input.artifact.sha256, network: "testnet", contractId: input.contractId, deploymentTransactionHash: input.deploymentTransactionHash, deployer: input.deployer, constructorArgs: input.constructorArgs, deployedAt: input.deployedAt, artifactVerified: true, verificationPurpose: "controlled-testnet-workflow" };
}
