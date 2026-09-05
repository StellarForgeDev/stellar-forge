import { describe, expect, it } from "vitest";
import { reconcileArtifacts } from "@/lib/verification/artifact-verification";
import type { StellarComponent } from "@/data/components";

const component = { slug: "example", capabilities: { testnet: true } } as StellarComponent;

function evidence(overrides: Partial<Parameters<typeof reconcileArtifacts>[0]> = {}) {
  return reconcileArtifacts({
    component,
    network: "testnet",
    contractId: "CEXAMPLE",
    sourceArtifact: { path: "source.wasm", sha256: "a" },
    prebuiltArtifact: { path: "prebuilt.wasm", sha256: "a" },
    deployedArtifact: { sha256: "a" },
    metadataCommit: "same",
    currentRepositoryCommit: "same",
    verifiedAt: "2026-09-01T00:00:00.000Z",
    verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId",
    ...overrides,
  });
}

describe("artifact reconciliation", () => {
  it("classifies matching hashes as VERIFIED_MATCH", () => {
    expect(evidence().status).toEqual(["VERIFIED_MATCH"]);
    expect(evidence().artifactParity).toEqual({
      sourceMatchesPrebuilt: true,
      prebuiltMatchesDeployed: true,
      sourceMatchesDeployed: true,
    });
  });

  it("detects source/prebuilt mismatch", () => {
    expect(evidence({ sourceArtifact: { path: "source.wasm", sha256: "b" } }).status)
      .toContain("LOCAL_ARTIFACT_MISMATCH");
  });

  it("detects prebuilt/deployed mismatch", () => {
    expect(evidence({ deployedArtifact: { sha256: "b" } }).status)
      .toContain("DEPLOYMENT_MISMATCH");
  });

  it("reports simultaneous mismatch and stale provenance issues", () => {
    const result = evidence({
      sourceArtifact: { path: "source.wasm", sha256: "b" },
      deployedArtifact: { sha256: "c" },
      currentRepositoryCommit: "new",
    });
    expect(result.status).toEqual(["LOCAL_ARTIFACT_MISMATCH", "DEPLOYMENT_MISMATCH", "PROVENANCE_STALE"]);
  });

  it("represents a missing deployment without claiming parity", () => {
    const result = evidence({ deployedArtifact: { sha256: null }, verificationMethod: "not-available", verifiedAt: null });
    expect(result.status).toEqual(["DEPLOYMENT_UNAVAILABLE", "UNKNOWN"]);
    expect(result.artifactParity.prebuiltMatchesDeployed).toBeNull();
  });
});
