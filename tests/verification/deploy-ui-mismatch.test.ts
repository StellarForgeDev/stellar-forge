import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Testnet Deploy UI invariants", () => {
  it("does not blindly trust historical VERIFIED_MATCH for the UI panel", () => {
    const pageContent = readFileSync(path.join(process.cwd(), "src/app/testnet/deploy/page.tsx"), "utf8");
    const panelContent = readFileSync(path.join(process.cwd(), "src/components/testnet/ControlledDeploymentPanel.tsx"), "utf8");

    // The page must use verifyArtifactEvidence instead of directly using accessEvidence.status
    expect(pageContent).toMatch(/verifyArtifactEvidence/);
    expect(pageContent).toMatch(/artifactStatus=\{verification\.status\}/);
    expect(pageContent).not.toMatch(/artifactVerified=\{accessEvidence\.status\.includes\("VERIFIED_MATCH"\)\}/);

    // The panel must accept artifactStatus as a string, not a boolean artifactVerified
    expect(panelContent).toMatch(/artifactStatus: string/);
    expect(panelContent).toMatch(/const isVerified = artifactStatus === "VERIFIED_MATCH";/);
    expect(panelContent).toMatch(/BLOCKED • \$\{artifactStatus\}/);
  });
});
