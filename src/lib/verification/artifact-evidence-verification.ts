import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";

export type ArtifactEvidenceVerificationResult =
  | { status: "VERIFIED_MATCH"; evidenceHash: string; wasmHash: string }
  | { status: "LOCAL_ARTIFACT_MISMATCH"; evidenceHash: string; wasmHash: string }
  | { status: "EVIDENCE_UNAVAILABLE"; error: string }
  | { status: "ARTIFACT_UNAVAILABLE"; error: string };

/**
 * Shared Authority Rule:
 * Historical evidence identifies what was independently deployed/observed. Current deployment readiness requires the actual current canonical artifact bytes to match that evidenced artifact.
 */
export async function verifyArtifactEvidence(componentSlug: string): Promise<ArtifactEvidenceVerificationResult> {
  if (!/^[a-z0-9\-]+$/.test(componentSlug)) {
    return { status: "ARTIFACT_UNAVAILABLE", error: `Invalid component slug format.` };
  }

  let wasm: Buffer;
  let wasmHash: string;
  try {
    const wasmPath = path.join(process.cwd(), "contracts", "prebuilt", `${componentSlug}.wasm`);
    wasm = await readFile(wasmPath);
    wasmHash = createHash("sha256").update(wasm).digest("hex");
  } catch {
    return { status: "ARTIFACT_UNAVAILABLE", error: `Failed to read canonical local artifact for ${componentSlug}.` };
  }

  let evidenceHash: string | null = null;
  try {
    const evidenceRaw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    const evidenceData = JSON.parse(evidenceRaw) as { evidence?: Array<DeploymentEvidence> };
    const accessEvidence = evidenceData.evidence?.find((item) => item.componentId === componentSlug);

    if (!accessEvidence) {
      return { status: "EVIDENCE_UNAVAILABLE", error: `No historical evidence found for ${componentSlug}.` };
    }
    if (!accessEvidence.status.includes("VERIFIED_MATCH")) {
      return { status: "EVIDENCE_UNAVAILABLE", error: `Historical evidence for ${componentSlug} does not include VERIFIED_MATCH.` };
    }
    if (typeof accessEvidence.sourceArtifact.sha256 !== "string") {
      return { status: "EVIDENCE_UNAVAILABLE", error: `Historical evidence for ${componentSlug} is missing a valid artifact hash.` };
    }
    evidenceHash = accessEvidence.sourceArtifact.sha256;
  } catch {
    return { status: "EVIDENCE_UNAVAILABLE", error: `Failed to read authoritative evidence file.` };
  }

  if (evidenceHash !== wasmHash) {
    return { status: "LOCAL_ARTIFACT_MISMATCH", evidenceHash, wasmHash };
  }

  return { status: "VERIFIED_MATCH", evidenceHash, wasmHash };
}
