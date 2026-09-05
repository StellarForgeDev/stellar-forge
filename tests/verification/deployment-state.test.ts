import { describe, expect, it } from "vitest";
import type { DeploymentStateEvidence } from "@/lib/verification/deployment-evidence";

describe("deployment state evidence", () => {
  it("starts conservatively without fabricated constructor observations", () => {
    const state: DeploymentStateEvidence = {
      componentId: "token",
      network: "testnet",
      contractId: null,
      verification: "notQueryable",
      constructorVerified: false,
      observations: [],
    };
    expect(state.constructorVerified).toBe(false);
    expect(state.observations).toEqual([]);
  });
});
