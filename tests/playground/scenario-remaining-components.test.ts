import { describe, expect, it } from "vitest";
import { getComponentByPackage } from "@/data/components";
import { getScenario } from "@/lib/playground/scenarios";
import { validateScenario } from "@/lib/playground/scenario-validation";

describe("remaining guided workflows", () => {
  it("registers a valid stateless Payment workflow", () => {
    const slug = getComponentByPackage("payment")?.slug ?? "";
    const scenario = getScenario(slug, "payment.transfer");
    expect(scenario?.steps.map((step) => step.method)).toEqual(["pay"]);
    expect(validateScenario(scenario!)).toEqual([]);
  });

  it("registers Allowance with numeric allowance comparisons", () => {
    const scenario = getScenario("allowance", "allowance.approve-and-spend")!;
    expect(scenario.steps.map((step) => step.method)).toEqual([
      "allowance", "approve", "allowance", "transfer_from", "allowance",
    ]);
    expect(scenario.steps[2].comparison?.relation).toBe("increased");
    expect(scenario.steps[4].comparison?.relation).toBe("decreased");
    expect(validateScenario(scenario)).toEqual([]);
  });

  it("registers Atomic Swap with a returned offer ID reference", () => {
    const scenario = getScenario("atomic-swap", "atomic-swap.create-and-execute")!;
    expect(scenario.steps.map((step) => step.method)).toEqual([
      "create_offer", "offer_active", "execute", "offer_active",
    ]);
    expect(scenario.steps[1].args[0]).toEqual({ reference: "atomic-swap-create.result" });
    expect(scenario.steps[2].args[1]).toEqual({ reference: "atomic-swap-create.result" });
    expect(validateScenario(scenario)).toEqual([]);
  });
});
