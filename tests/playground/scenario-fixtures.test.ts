import { describe, expect, it } from "vitest";
import { getComponentBySlug } from "@/data/components";
import { getScenario } from "@/lib/playground/scenarios";
import { scenarioAssets, validateScenarioFixtures } from "@/lib/playground/scenario-fixtures";

describe("guided Playground scenario fixtures", () => {
  it("registers reusable identities, asset aliases, and balances", () => {
    const scenario = getScenario("timelock", "timelock.unlock-and-release")!;
    expect(scenario.fixtures).toEqual({
      identities: ["admin", "user1"],
      assets: ["forge-token"],
      balances: [{ identity: "admin", asset: "forge-token", amount: 100 }],
    });
    expect(scenarioAssets[0]).toMatchObject({ id: "forge-token", dependencyAlias: "asset" });
    expect(validateScenarioFixtures(scenario, getComponentBySlug("timelock")!)).toEqual([]);
  });

  it("rejects duplicate names, missing assets, missing dependencies, and invalid amounts", () => {
    const scenario = getScenario("timelock", "timelock.unlock-and-release")!;
    const invalid = {
      ...scenario,
      fixtures: {
        identities: ["admin", "admin"],
        assets: ["missing", "missing"],
        balances: [{ identity: "unknown", asset: "missing", amount: "-1" }],
      },
    };
    const issues = validateScenarioFixtures(invalid, getComponentBySlug("token")!);
    expect(issues.some((issue) => issue.includes("unique"))).toBe(true);
    expect(issues.some((issue) => issue.includes("unknown asset"))).toBe(true);
    expect(issues.some((issue) => issue.includes("undeclared"))).toBe(true);
    expect(issues.some((issue) => issue.includes("non-negative"))).toBe(true);
  });
});
