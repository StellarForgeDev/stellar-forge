import { describe, expect, it } from "vitest";
import { getComponentBySlug } from "@/data/components";
import { getScenario } from "@/lib/playground/scenarios";
import { createMerkleFixture, resolveScenarioFixtureReference, validateScenarioFixtures } from "@/lib/playground/scenario-fixtures";
import { validateScenario } from "@/lib/playground/scenario-validation";

describe("guided Playground Merkle fixtures", () => {
  it("generates deterministic root, leaf proof data, and fixture references", () => {
    const input = { id: "example", leaves: [{ index: 0, claimant: "user1", amount: 1000 }] };
    const first = createMerkleFixture(input);
    const second = createMerkleFixture(input);
    expect(first).toEqual(second);
    expect(first.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(first.proofs["0"]).toBe("0x");
    expect(resolveScenarioFixtureReference("example.root", { merkle: [first] })).toEqual({ ok: true, value: first.root });
    expect(resolveScenarioFixtureReference("example.proof.0", { merkle: [first] })).toEqual({ ok: true, value: "0x" });
  });

  it("registers and validates the real Merkle Airdrop workflow", () => {
    const scenario = getScenario("merkle-airdrop", "merkle-airdrop.claim")!;
    expect(validateScenario(scenario)).toEqual([]);
    expect(scenario.steps.map((step) => step.method)).toEqual(["claimed", "deposit", "claim", "claimed"]);
    expect(scenario.steps[2].args[3]).toEqual({ fixture: "test-airdrop.proof.0" });
  });

  it("rejects missing claimants, empty trees, and undeclared assets", () => {
    const scenario = getScenario("merkle-airdrop", "merkle-airdrop.claim")!;
    const invalid = {
      ...scenario,
      fixtures: {
        ...scenario.fixtures,
        assets: [],
        merkle: [{ ...scenario.fixtures!.merkle![0], leaves: [] }],
      },
    };
    const issues = validateScenarioFixtures(invalid, getComponentBySlug("merkle-airdrop")!);
    expect(issues.some((issue) => issue.includes("must contain a leaf"))).toBe(true);
    expect(issues.some((issue) => issue.includes("undeclared asset"))).toBe(true);
  });
});
