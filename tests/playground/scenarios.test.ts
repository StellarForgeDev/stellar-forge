import { describe, expect, it } from "vitest";
import { getComponentBySlug } from "@/data/components";
import {
  evaluateScenarioComparison,
  scenarioResultsEqual,
} from "@/lib/playground/scenario-comparison";
import { getScenario, playgroundScenarios } from "@/lib/playground/scenarios";
import { validateAllScenarios, validateScenario } from "@/lib/playground/scenario-validation";

describe("guided Playground scenarios", () => {
  it("registers the Access Control role lifecycle", () => {
    const scenario = getScenario("access-control", "role-lifecycle");

    expect(scenario).toBeDefined();
    expect(scenario?.steps).toHaveLength(5);
    expect(scenario?.steps.map((step) => step.method)).toEqual([
      "has_role",
      "grant_role",
      "has_role",
      "revoke_role",
      "has_role",
    ]);
  });

  it("validates every registered scenario against catalog metadata", () => {
    const validation = validateAllScenarios(playgroundScenarios);

    for (const issues of validation.values()) {
      expect(issues).toEqual([]);
    }
  });

  it("rejects unknown methods and duplicate step ids", () => {
    const scenario = getScenario("access-control", "role-lifecycle")!;
    const invalid = {
      ...scenario,
      steps: [
        { ...scenario.steps[0], id: "duplicate" },
        { ...scenario.steps[1], id: "duplicate", method: "missing_method" },
      ],
    };

    const issues = validateScenario(invalid);
    expect(issues.some((issue) => issue.message.includes("duplicate"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("unknown method"))).toBe(true);
  });

  it("references a real catalog component", () => {
    const scenario = getScenario("access-control", "role-lifecycle")!;
    expect(getComponentBySlug(scenario.componentSlug)).toBeDefined();
  });

  it("registers separate terminal Escrow release and refund scenarios", () => {
    const release = getScenario("escrow", "escrow.release-funds");
    const refund = getScenario("escrow", "escrow.refund-funds");

    expect(release).toBeDefined();
    expect(refund).toBeDefined();
    expect(release?.steps.map((step) => step.method)).toEqual([
      "status",
      "deposit",
      "status",
      "release",
      "status",
    ]);
    expect(refund?.steps.map((step) => step.method)).toEqual([
      "status",
      "deposit",
      "status",
      "refund",
      "status",
    ]);
  });

  it("uses the contract's numeric Escrow status values", () => {
    const release = getScenario("escrow", "escrow.release-funds")!;
    const refund = getScenario("escrow", "escrow.refund-funds")!;

    expect(release.steps.map((step) => step.expected)).toEqual([0, undefined, 0, undefined, 1]);
    expect(refund.steps.map((step) => step.expected)).toEqual([0, undefined, 0, undefined, 2]);
    expect(release.steps[2].resultLabel).toBe("Active / funded");
  });

  it("has unique scenario and step ids", () => {
    const scenarioIds = playgroundScenarios.map(
      (scenario) => `${scenario.componentSlug}:${scenario.id}`,
    );
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);

    for (const scenario of playgroundScenarios) {
      const stepIds = scenario.steps.map((step) => step.id);
      expect(new Set(stepIds).size, scenario.id).toBe(stepIds.length);
    }
  });

  it("registers the Token mint and transfer workflow", () => {
    const scenario = getScenario("token", "token.mint-and-transfer");

    expect(scenario).toBeDefined();
    expect(scenario?.steps.map((step) => step.method)).toEqual([
      "balance",
      "balance",
      "mint",
      "balance",
      "transfer",
      "balance",
      "balance",
    ]);
    expect(scenario?.steps.map((step) => step.expected)).toEqual([
      0,
      0,
      undefined,
      1000,
      undefined,
      750,
      250,
    ]);
  });

  it("uses backward numeric comparison references for Token observations", () => {
    const scenario = getScenario("token", "token.mint-and-transfer")!;

    expect(scenario.steps[3].comparison).toEqual({
      compareWith: "token-sender-initial-balance",
      relation: "increased",
    });
    expect(scenario.steps[5].comparison).toEqual({
      compareWith: "token-sender-after-mint",
      relation: "decreased",
    });
    expect(scenario.steps[6].comparison).toEqual({
      compareWith: "token-recipient-initial-balance",
      relation: "increased",
    });
  });

  it("compares numeric values without losing i128 precision", () => {
    const before = "170141183460469231731687303715884105727";
    const after = "170141183460469231731687303715884105728";

    expect(scenarioResultsEqual(1000, "1000")).toBe(true);
    expect(
      evaluateScenarioComparison(
        { compareWith: "before", relation: "increased" },
        before,
        after,
      ),
    ).toEqual({
      relation: "increased",
      before,
      after,
      delta: "1",
      passed: true,
    });
  });

  it("rejects invalid, forward, and non-numeric comparison references", () => {
    const token = getScenario("token", "token.mint-and-transfer")!;
    const forward = {
      ...token,
      steps: token.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              comparison: {
                compareWith: "token-sender-after-mint",
                relation: "increased" as const,
              },
            }
          : step,
      ),
    };
    const invalidSource = {
      ...token,
      steps: token.steps.map((step, index) =>
        index === 3
          ? {
              ...step,
              comparison: {
                compareWith: "missing-step",
                relation: "increased" as const,
              },
            }
          : step,
      ),
    };
    const accessControl = getScenario("access-control", "role-lifecycle")!;
    const nonNumeric = {
      ...accessControl,
      steps: accessControl.steps.map((step, index) =>
        index === 2
          ? {
              ...step,
              comparison: {
                compareWith: "check-initial-role",
                relation: "increased" as const,
              },
            }
          : step,
      ),
    };

    expect(validateScenario(forward).some((issue) => issue.path.includes("comparison"))).toBe(true);
    expect(validateScenario(invalidSource).some((issue) => issue.message.includes("earlier step"))).toBe(true);
    expect(validateScenario(nonNumeric).some((issue) => issue.message.includes("numeric return types"))).toBe(true);
  });
});
