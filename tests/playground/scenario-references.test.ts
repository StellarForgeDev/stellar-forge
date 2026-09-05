import { describe, expect, it } from "vitest";
import { getScenario } from "@/lib/playground/scenarios";
import { validateScenario } from "@/lib/playground/scenario-validation";
import {
  parseResultReference,
  resolveResultReference,
  resolveScenarioArguments,
} from "@/lib/playground/scenario-references";
import type { GuidedStepResult } from "@/lib/playground/scenario-types";

function result(stepId: string, actual?: unknown): GuidedStepResult {
  return {
    scenarioStep: {
      id: stepId,
      title: stepId,
      explanation: "",
      kind: "call",
      method: "create",
      args: [],
    },
    functionSpec: { name: "create", params: [], returns: "u64" },
    args: [],
    status: "complete",
    ...(actual === undefined ? {} : { actual }),
  };
}

describe("guided Playground result references", () => {
  const stepIds = ["create-campaign", "inspect-campaign", "step.with.dots"];

  it("resolves a direct result path and preserves the returned value", () => {
    const resolved = resolveResultReference(
      "create-campaign.result",
      [result("create-campaign", "9007199254740993")],
      stepIds,
    );

    expect(resolved).toEqual({ ok: true, value: "9007199254740993" });
  });

  it("supports nested object and array result paths", () => {
    const results = [
      result("create-campaign", { ids: ["first", "second"] }),
    ];

    expect(
      resolveResultReference("create-campaign.result.ids.1", results, stepIds),
    ).toEqual({ ok: true, value: "second" });
  });

  it("supports step IDs that contain dots", () => {
    expect(
      parseResultReference("step.with.dots.result", stepIds),
    ).toEqual({ ok: true, stepId: "step.with.dots", path: [] });
  });

  it("reports missing steps and unavailable results clearly", () => {
    expect(
      resolveResultReference("missing.result", [], stepIds),
    ).toMatchObject({ ok: false, error: { kind: "missing-step" } });
    expect(
      resolveResultReference("create-campaign.result", [result("create-campaign")], stepIds),
    ).toMatchObject({ ok: false, error: { kind: "missing-result" } });
  });

  it("substitutes an ID into a subsequent call without coercing it", () => {
    const resolved = resolveScenarioArguments(
      [{ reference: "create-campaign.result" }],
      [result("create-campaign", "42")],
      stepIds,
    );

    expect(resolved).toEqual({ ok: true, values: ["42"] });
  });

  it("resolves the Claimable Balance ID-producing workflow definition", () => {
    const scenario = getScenario(
      "claimable-balance",
      "claimable-balance.create-and-inspect",
    );

    expect(scenario?.steps[1].args).toEqual([
      { reference: "claimable-balance-deposit.result" },
    ]);
  });

  it("rejects malformed and forward references during scenario validation", () => {
    const scenario = getScenario(
      "claimable-balance",
      "claimable-balance.create-and-inspect",
    )!;
    const missing = {
      ...scenario,
      steps: scenario.steps.map((step, index) =>
        index === 1
          ? { ...step, args: [{ reference: "missing.result" }] }
          : step,
      ),
    };
    const forward = {
      ...scenario,
      steps: scenario.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              args: [
                { reference: "claimable-balance-read-amount.result" },
                "user1",
                "1000",
                "0",
                null,
                "1000",
              ],
            }
          : step,
      ),
    };
    const malformed = {
      ...scenario,
      steps: scenario.steps.map((step, index) =>
        index === 1
          ? { ...step, args: [{ reference: "claimable-balance-deposit" }] }
          : step,
      ),
    };

    expect(validateScenario(missing).some((issue) => issue.message.includes("existing step"))).toBe(true);
    expect(validateScenario(forward).some((issue) => issue.message.includes("earlier step"))).toBe(true);
    expect(validateScenario(malformed).some((issue) => issue.message.includes("existing step"))).toBe(true);
  });
});
