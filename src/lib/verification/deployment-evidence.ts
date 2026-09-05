import type { TransactionNetwork } from "../transactions/networks.ts";
import type { EffectiveEvidenceStatus, EvidenceConfidence, ReconciliationStatus, RetrievalFailureCategory } from "./artifact-status.ts";

export type EvidenceVerificationMethod =
  | "stellar-sdk-rpc-getContractWasmByContractId"
  | "not-available";

export interface ArtifactEvidence {
  path: string;
  sha256: string | null;
}

export interface DeploymentArtifactEvidence {
  sha256: string | null;
}

export interface ArtifactParityEvidence {
  sourceMatchesPrebuilt: boolean | null;
  prebuiltMatchesDeployed: boolean | null;
  sourceMatchesDeployed: boolean | null;
}

export interface ProvenanceEvidence {
  metadataCommit: string | null;
  currentRepositoryCommit: string | null;
}

export interface DeploymentEvidence {
  componentId: string;
  network: TransactionNetwork;
  contractId: string | null;
  sourceArtifact: ArtifactEvidence;
  prebuiltArtifact: ArtifactEvidence;
  deployedArtifact: DeploymentArtifactEvidence;
  artifactParity: ArtifactParityEvidence;
  provenance: ProvenanceEvidence;
  verification: {
    verifiedAt: string | null;
    verificationMethod: EvidenceVerificationMethod;
  };
  status: ReconciliationStatus[];
  observations?: ArtifactRetrievalObservation[];
  latestObservation?: ArtifactRetrievalObservation;
  latestSuccessfulObservation?: ArtifactRetrievalObservation;
  effectiveStatus?: EffectiveEvidenceStatus;
}

export interface ArtifactRetrievalObservation {
  source: string;
  success: boolean;
  contractReachable: boolean | null;
  wasmAvailable: boolean;
  artifactHash: string | null;
  observedAt: string;
  retrievalMethod: string;
  confidence: EvidenceConfidence;
  errorCategory?: RetrievalFailureCategory;
  errorMessage?: string;
  authoritative: boolean;
  supersedesPrevious: boolean;
}

export type DeploymentStateVerification =
  | "verified"
  | "partiallyVerified"
  | "notVerified"
  | "notQueryable";

export interface DeploymentStateObservation {
  method: string;
  args: unknown[];
  result: unknown;
  verifiedAt: string;
}

export interface DeploymentStateEvidence {
  componentId: string;
  network: TransactionNetwork;
  contractId: string | null;
  verification: DeploymentStateVerification;
  constructorVerified: boolean;
  observations: DeploymentStateObservation[];
}
