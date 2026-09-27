import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateVerificationDecision } from "@/lib/verification/artifact-status";
import { resolvePanelVerificationDecision } from "@/components/testnet/ControlledDeploymentPanel";

describe("Testnet Deploy UI invariants", () => {
  it("does not blindly trust historical VERIFIED_MATCH for the UI panel", () => {
    const pageContent = readFileSync(path.join(process.cwd(), "src/app/testnet/deploy/page.tsx"), "utf8");
    const panelContent = readFileSync(path.join(process.cwd(), "src/components/testnet/ControlledDeploymentPanel.tsx"), "utf8");

    // The deployment page must use candidate authorization instead of historical evidence status.
    expect(pageContent).toMatch(/verifyCandidateArtifact/);
    expect(pageContent).toMatch(/artifactStatus=\{verification\.status\}/);
    expect(pageContent).not.toMatch(/artifactVerified=\{accessEvidence\.status\.includes\("VERIFIED_MATCH"\)\}/);

    // The panel must accept artifactStatus as a string, not a boolean artifactVerified
    expect(panelContent).toMatch(/artifactStatus: string/);
    expect(panelContent).toMatch(/const isVerified = artifactStatus === "CANDIDATE_VERIFIED";/);
    expect(panelContent).toMatch(/BLOCKED \u2022 \$\{artifactStatus\}/);
  });

  it("resolves verification correctly using candidateHash instead of relying on legacy artifactHash field", () => {
    const panelContent = readFileSync(path.join(process.cwd(), "src/components/testnet/ControlledDeploymentPanel.tsx"), "utf8");
    const helperContent = readFileSync(path.join(process.cwd(), "src/lib/verification/artifact-status.ts"), "utf8");
    expect(panelContent).toMatch(/candidateHash\?: string \| null;/);
    expect(panelContent).not.toMatch(/result\.artifactHash !== artifactHash/);
    expect(helperContent).toMatch(/input\.candidateHash !== input\.localArtifactHash/);
  });

  it("correctly evaluates verification decision conditions", () => {
    const localArtifactHash = "a1b2c3d4";

    // 1. valid verified=true + matching hashes => success
    expect(evaluateVerificationDecision({
      verified: true,
      deployedHash: localArtifactHash,
      candidateHash: localArtifactHash,
      localArtifactHash
    })).toEqual({ success: true });

    // 2. missing/false verified => failure
    expect(evaluateVerificationDecision({
      verified: false,
      deployedHash: localArtifactHash,
      candidateHash: localArtifactHash,
      localArtifactHash
    }).success).toBe(false);

    // 3. deployedHash mismatch => failure
    expect(evaluateVerificationDecision({
      verified: true,
      deployedHash: "mismatch",
      candidateHash: localArtifactHash,
      localArtifactHash
    }).success).toBe(false);

    // 4. candidateHash mismatch => failure
    expect(evaluateVerificationDecision({
      verified: true,
      deployedHash: localArtifactHash,
      candidateHash: "mismatch",
      localArtifactHash
    }).success).toBe(false);

    // 5. missing candidateHash => failure
    expect(evaluateVerificationDecision({
      verified: true,
      deployedHash: localArtifactHash,
      candidateHash: null,
      localArtifactHash
    }).success).toBe(false);
  });

  it("proves the panel integration boundary accurately rejects invalid responses and missing deployedHash", () => {
    const localArtifactHash = "a1b2c3d4";
    const validResult = {
      verified: true,
      deployedHash: localArtifactHash,
      candidateHash: localArtifactHash
    };

    // 1. Valid case (response.ok === true)
    expect(resolvePanelVerificationDecision(true, validResult, localArtifactHash).success).toBe(true);

    // 2. HTTP non-2xx rejection: response.ok === false + valid body => failure
    expect(resolvePanelVerificationDecision(false, validResult, localArtifactHash).success).toBe(false);

    // 3. Strict boolean rejection: string "true" is rejected
    expect(resolvePanelVerificationDecision(true, {
      ...validResult,
      verified: "true"
    }, localArtifactHash).success).toBe(false);

    // 4. Missing deployedHash => failure
    expect(resolvePanelVerificationDecision(true, {
      ...validResult,
      deployedHash: undefined
    }, localArtifactHash).success).toBe(false);

    // 5. Explicit error field propagated correctly
    const errResult = resolvePanelVerificationDecision(true, {
      ...validResult,
      error: "Some explicit server error"
    }, localArtifactHash);
    expect(errResult.success).toBe(false);
    expect(errResult.error).toBe("Some explicit server error");
  });
});
