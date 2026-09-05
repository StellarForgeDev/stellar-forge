import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { StellarComponent } from "../../data/components";
import type { ContractDeployment } from "../transactions/deployments.ts";
import type { TransactionNetwork } from "../transactions/networks.ts";
import {
  RECONCILIATION_STATUSES,
  type ReconciliationStatus,
} from "./artifact-status.ts";
import type { DeploymentEvidence } from "./deployment-evidence.ts";

export interface ArtifactInput {
  path: string;
  sha256: string | null;
}

export interface DeploymentArtifactReader {
  getWasm(contractId: string): Promise<Uint8Array>;
}

export interface ReconciliationInput {
  component: StellarComponent;
  network: TransactionNetwork;
  contractId: string | null;
  sourceArtifact: ArtifactInput;
  prebuiltArtifact: ArtifactInput;
  metadataCommit: string | null;
  currentRepositoryCommit: string | null;
  deployedArtifact: { sha256: string | null };
  verifiedAt: string | null;
  verificationMethod: DeploymentEvidence["verification"]["verificationMethod"];
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(path: string): string | null {
  return existsSync(path) ? sha256Bytes(readFileSync(path)) : null;
}

export function reconcileArtifacts(input: ReconciliationInput): DeploymentEvidence {
  const { sourceArtifact, prebuiltArtifact, deployedArtifact } = input;
  const sourceMatchesPrebuilt = equalHashes(sourceArtifact.sha256, prebuiltArtifact.sha256);
  const prebuiltMatchesDeployed = equalHashes(prebuiltArtifact.sha256, deployedArtifact.sha256);
  const sourceMatchesDeployed = equalHashes(sourceArtifact.sha256, deployedArtifact.sha256);
  const statuses: ReconciliationStatus[] = [];

  if (sourceMatchesPrebuilt === false) {
    statuses.push("LOCAL_ARTIFACT_MISMATCH");
  }
  if (prebuiltMatchesDeployed === false) statuses.push("DEPLOYMENT_MISMATCH");
  if (deployedArtifact.sha256 === null) statuses.push("DEPLOYMENT_UNAVAILABLE");
  if (
    input.metadataCommit !== null &&
    input.currentRepositoryCommit !== null &&
    input.metadataCommit !== input.currentRepositoryCommit
  ) {
    statuses.push("PROVENANCE_STALE");
  }
  if (
    sourceArtifact.sha256 === null ||
    prebuiltArtifact.sha256 === null ||
    (input.contractId !== null && deployedArtifact.sha256 === null)
  ) {
    statuses.push("UNKNOWN");
  }
  if (
    sourceMatchesPrebuilt === true &&
    prebuiltMatchesDeployed === true &&
    sourceMatchesDeployed === true
  ) {
    statuses.unshift("VERIFIED_MATCH");
  }

  return {
    componentId: input.component.slug,
    network: input.network,
    contractId: input.contractId,
    sourceArtifact,
    prebuiltArtifact,
    deployedArtifact,
    artifactParity: {
      sourceMatchesPrebuilt,
      prebuiltMatchesDeployed,
      sourceMatchesDeployed,
    },
    provenance: {
      metadataCommit: input.metadataCommit,
      currentRepositoryCommit: input.currentRepositoryCommit,
    },
    verification: {
      verifiedAt: input.verifiedAt,
      verificationMethod: input.verificationMethod,
    },
    status: statuses,
  };
}

function equalHashes(left: string | null, right: string | null): boolean | null {
  return left === null || right === null ? null : left === right;
}

export interface RegistryValidationResult {
  expectedCount: number;
  accountedCount: number;
  errors: string[];
}

export function validateVerificationRegistry(
  components: readonly StellarComponent[],
  deployments: readonly ContractDeployment[],
  prebuiltFiles: ReadonlySet<string>,
): RegistryValidationResult {
  const expected = components.filter((component) => component.capabilities.testnet);
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const component of expected) {
    const key = `${component.slug}:testnet`;
    if (!component.implementation?.package) errors.push(`${component.slug}: missing Cargo package mapping`);
    if (!componentWasmFile(component, prebuiltFiles)) errors.push(`${component.slug}: missing local artifact mapping`);
    const matches = deployments.filter((deployment) => deployment.network === "testnet" && deployment.componentSlug === component.slug);
    if (matches.length === 0) errors.push(`${component.slug}: missing Testnet deployment registry entry`);
    if (matches.length > 1) errors.push(`${component.slug}: duplicate Testnet deployment registry entries`);
    if (matches.length === 1 && seen.has(key)) errors.push(`${component.slug}: duplicate component evidence`);
    if (matches.length === 1) seen.add(key);
  }
  return { expectedCount: expected.length, accountedCount: seen.size, errors };
}

function componentWasmFile(component: StellarComponent, files: ReadonlySet<string>): string | null {
  const file = `${component.slug}.wasm`;
  return component.implementation && files.has(file) ? file : null;
}

export { RECONCILIATION_STATUSES };
