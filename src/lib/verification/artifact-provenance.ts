import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyArtifactEvidence, type ArtifactEvidenceVerificationResult } from "@/lib/verification/artifact-evidence-verification";

const COMPONENT_SLUG_PATTERN = /^[a-z0-9-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

export interface ArtifactCandidate {
  component: string;
  artifactPath: string;
  artifactHash: string;
  contractsCommit: string;
  buildMetadataCommit: string;
  sdkVersion: string;
  target: string;
  toolchain: string;
  candidateStatus: "CANDIDATE";
}

export interface ArtifactCandidateManifest {
  schemaVersion: string;
  candidates: ArtifactCandidate[];
}

export interface CanonicalArtifactIdentity {
  component: string;
  artifactPath: string;
  sha256: string;
}

export type CandidateVerificationResult =
  | { status: "CANDIDATE_VERIFIED"; actualHash: string; candidateHash: string; candidate: ArtifactCandidate; verifiedArtifactBytes: Buffer }
  | { status: "CANDIDATE_MISMATCH"; actualHash: string; candidateHash: string; candidate: ArtifactCandidate }
  | { status: "CANDIDATE_MANIFEST_UNAVAILABLE"; error: string }
  | { status: "ARTIFACT_UNAVAILABLE"; error: string }
  | { status: "INVALID_CANDIDATE_METADATA"; error: string };

function canonicalArtifactPath(component: string): string | null {
  return COMPONENT_SLUG_PATTERN.test(component) ? `prebuilt/${component}.wasm` : null;
}

function isCandidate(value: unknown, component: string): value is ArtifactCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArtifactCandidate>;
  return candidate.component === component
    && candidate.artifactPath === canonicalArtifactPath(component)
    && typeof candidate.artifactHash === "string"
    && SHA256_PATTERN.test(candidate.artifactHash)
    && typeof candidate.contractsCommit === "string"
    && COMMIT_PATTERN.test(candidate.contractsCommit)
    && typeof candidate.buildMetadataCommit === "string"
    && COMMIT_PATTERN.test(candidate.buildMetadataCommit)
    && typeof candidate.sdkVersion === "string"
    && candidate.sdkVersion.length > 0
    && typeof candidate.target === "string"
    && candidate.target.length > 0
    && typeof candidate.toolchain === "string"
    && candidate.toolchain.length > 0
    && candidate.candidateStatus === "CANDIDATE";
}

async function readCanonicalArtifactBytes(component: string): Promise<{ identity: CanonicalArtifactIdentity; bytes: Buffer } | { error: string }> {
  const artifactPath = canonicalArtifactPath(component);
  if (!artifactPath) return { error: "Invalid component slug." };

  try {
    const bytes = await readFile(path.join(process.cwd(), "contracts", artifactPath));
    return {
      identity: {
        component,
        artifactPath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      bytes,
    };
  } catch {
    return { error: `Failed to read canonical local artifact for ${component}.` };
  }
}

export async function getCanonicalArtifactIdentity(component: string): Promise<CanonicalArtifactIdentity | { status: "ARTIFACT_UNAVAILABLE"; error: string }> {
  const result = await readCanonicalArtifactBytes(component);
  return "identity" in result ? result.identity : { status: "ARTIFACT_UNAVAILABLE", error: result.error };
}

export async function readCandidateManifest(): Promise<ArtifactCandidateManifest | { status: "CANDIDATE_MANIFEST_UNAVAILABLE" | "INVALID_CANDIDATE_METADATA"; error: string }> {
  let raw: string;
  try {
    raw = await readFile(path.join(process.cwd(), "contracts", "deployment-candidates.json"), "utf8");
  } catch {
    return { status: "CANDIDATE_MANIFEST_UNAVAILABLE", error: "Failed to read candidate manifest." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "INVALID_CANDIDATE_METADATA", error: "Candidate manifest is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { schemaVersion?: unknown }).schemaVersion !== "1.0.0" || !Array.isArray((parsed as { candidates?: unknown }).candidates)) {
    return { status: "INVALID_CANDIDATE_METADATA", error: "Candidate manifest has an invalid envelope." };
  }
  return parsed as ArtifactCandidateManifest;
}

export async function verifyCandidateArtifact(component: string): Promise<CandidateVerificationResult> {
  const manifest = await readCandidateManifest();
  if ("status" in manifest) return manifest;

  const candidates = manifest.candidates.filter((entry) => entry && typeof entry === "object" && (entry as Partial<ArtifactCandidate>).component === component);
  if (candidates.length !== 1) return { status: "INVALID_CANDIDATE_METADATA", error: candidates.length === 0 ? `No candidate metadata found for ${component}.` : `Multiple candidate entries found for ${component}.` };
  const candidate = candidates[0];
  if (!isCandidate(candidate, component)) return { status: "INVALID_CANDIDATE_METADATA", error: `Candidate metadata for ${component} is invalid.` };

  const artifact = await readCanonicalArtifactBytes(component);
  if ("error" in artifact) return { status: "ARTIFACT_UNAVAILABLE", error: artifact.error };

  if (artifact.identity.sha256 !== candidate.artifactHash) {
    return { status: "CANDIDATE_MISMATCH", actualHash: artifact.identity.sha256, candidateHash: candidate.artifactHash, candidate };
  }
  return { status: "CANDIDATE_VERIFIED", actualHash: artifact.identity.sha256, candidateHash: candidate.artifactHash, candidate, verifiedArtifactBytes: artifact.bytes };
}

export async function verifyHistoricalArtifact(component: string): Promise<ArtifactEvidenceVerificationResult> {
  return verifyArtifactEvidence(component);
}
