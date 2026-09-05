import { describe, expect, it } from "vitest";
import { clockForScenarioPrefix } from "@/lib/playground/execution";
import { getScenario, playgroundScenarios } from "@/lib/playground/scenarios";
import { validateScenario } from "@/lib/playground/scenario-validation";

describe("guided Playground local clock", () => {
  it("registers and validates the Timelock workflow", () => {
    const scenario = getScenario("timelock", "timelock.unlock-and-release");
    expect(scenario).toBeDefined();
    expect(validateScenario(scenario!)).toEqual([]);
    expect(scenario?.steps.map((step) => step.kind)).toEqual([
      "call", "observation", "clock", "observation", "call", "observation",
    ]);
  });

  it("places a clock advance before the next contract call during replay", () => {
    const scenario = getScenario("timelock", "timelock.unlock-and-release")!;
    expect(clockForScenarioPrefix(scenario, 2)).toEqual({
      initialLedgerTimestamp: 0,
      advances: [{ beforeCall: 2, seconds: 86400 }],
    });
    expect(clockForScenarioPrefix(scenario, 3)).toEqual({
      initialLedgerTimestamp: 0,
      advances: [{ beforeCall: 2, seconds: 86400 }],
    });
  });

  it("rejects malformed clock steps and excessive advancement", () => {
    const scenario = getScenario("timelock", "timelock.unlock-and-release")!;
    const invalid = {
      ...scenario,
      clock: { initialLedgerTimestamp: -1 },
      steps: scenario.steps.map((step, index) =>
        index === 2 ? { ...step, clock: { advanceBySeconds: -1 } } : step,
      ),
    };
    expect(validateScenario(invalid).length).toBeGreaterThan(0);
  });

  it("keeps all registered scenarios present alongside the time workflow", () => {
    expect(playgroundScenarios.some((scenario) => scenario.id === "role-lifecycle")).toBe(true);
    expect(playgroundScenarios.some((scenario) => scenario.id === "timelock.unlock-and-release")).toBe(true);
  });
});
