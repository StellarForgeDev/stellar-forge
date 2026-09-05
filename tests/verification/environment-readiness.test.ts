import { describe, expect, it } from "vitest";
import { canonicalTestnetAssets, isCanonicalAssetEligible } from "@/lib/verification/canonical-assets";
import { evaluateEnvironmentReadiness, buildReadinessMatrix } from "@/lib/verification/environment-preflight";
import { environmentProfiles, getEnvironmentProfile } from "@/lib/verification/environment-profiles";
import type { EnvironmentContext } from "@/lib/verification/environment-types";
import type { ReconciliationStatus } from "@/lib/verification/artifact-status";

const context: EnvironmentContext = { accounts: {}, assets: {}, deployments: {}, artifactStatuses: Object.fromEntries(environmentProfiles.map((profile) => [profile.componentId, ["VERIFIED_MATCH"]])), controlledDeployments: {} };

describe("Testnet environment readiness", () => {
  it("has exactly one declarative profile for all 15 components", () => {
    expect(environmentProfiles).toHaveLength(15);
    expect(new Set(environmentProfiles.map((profile) => profile.componentId)).size).toBe(15);
  });

  it("reports multiple missing blockers", () => {
    const result = evaluateEnvironmentReadiness(getEnvironmentProfile("escrow")!, context);
    expect(result.statuses).toEqual(expect.arrayContaining(["MISSING_ACCOUNT", "MISSING_ASSET"]));
    expect(result.blockers.length).toBeGreaterThan(1);
  });

  it("preserves Token and Payment artifact mismatch blockers", () => {
    const mismatchContext: EnvironmentContext = { ...context, artifactStatuses: { ...context.artifactStatuses, token: ["DEPLOYMENT_MISMATCH" as ReconciliationStatus], payment: ["DEPLOYMENT_MISMATCH" as ReconciliationStatus] } };
    expect(evaluateEnvironmentReadiness(getEnvironmentProfile("token")!, mismatchContext).statuses).toContain("ARTIFACT_MISMATCH");
    expect(evaluateEnvironmentReadiness(getEnvironmentProfile("payment")!, mismatchContext).statuses).toContain("ARTIFACT_MISMATCH");
  });

  it("requires the declared special strategies", () => {
    expect(getEnvironmentProfile("atomic-swap")!.fixtures).toContain("two-assets");
    expect(getEnvironmentProfile("multi-signature")!.fixtures).toContain("multisig");
    expect(getEnvironmentProfile("oracle")!.fixtures).toContain("oracle-signature");
    expect(getEnvironmentProfile("merkle-airdrop")!.fixtures).toContain("merkle");
  });

  it("does not treat artifact verification alone as execution readiness", () => {
    const row = buildReadinessMatrix(environmentProfiles, context).find((item) => item.componentId === "access-control")!;
    expect(row.artifactVerified).toBe(true);
    expect(row.readyForExecution).toBe(false);
  });

  it("starts with an empty canonical asset registry and rejects unverified assets", () => {
    expect(canonicalTestnetAssets).toEqual([]);
    expect(isCanonicalAssetEligible({ alias: "x", type: "contract", source: "UNVERIFIED", verificationStatus: "UNVERIFIED" })).toBe(false);
    expect(isCanonicalAssetEligible({ alias: "static", type: "contract", source: "STATIC_DEPLOYMENT", verificationStatus: "VERIFIED", contractId: "CABC" })).toBe(false);
    expect(isCanonicalAssetEligible({ alias: "external", type: "contract", source: "EXTERNAL_TESTNET_ASSET", verificationStatus: "VERIFIED", contractId: "CABC" })).toBe(true);
  });

  it("models two-asset, multi-party, and real-time requirements", () => {
    expect(getEnvironmentProfile("atomic-swap")!.assets).toHaveLength(2);
    const multisig = evaluateEnvironmentReadiness(getEnvironmentProfile("multi-signature")!, context);
    expect(multisig.statuses).toContain("MISSING_AUTHORIZATION_PARTICIPANT");
    expect(evaluateEnvironmentReadiness(getEnvironmentProfile("timelock")!, context).statuses).toContain("TIME_REQUIREMENT");
  });

  it("does not serialize local fixture secret material", () => {
    const serialized = JSON.stringify(buildReadinessMatrix(environmentProfiles, context));
    expect(serialized).not.toMatch(/privateKey|seed|mnemonic|secret|0x42424242/);
  });
});
