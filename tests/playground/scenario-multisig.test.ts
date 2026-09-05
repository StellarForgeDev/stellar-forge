import { describe, expect, it } from "vitest";
import { getComponentByPackage } from "@/data/components";
import { playgroundScenarios } from "@/lib/playground/scenarios";
import { validateScenario } from "@/lib/playground/scenario-validation";

describe("multi-signature guided workflow", () => {
  const slug = getComponentByPackage("multi-signature")?.slug ?? "";
  const scenario = playgroundScenarios.find(
    (candidate) => candidate.id === "multi-signature.threshold-approval",
  );

  it("registers a valid 2-of-3 scenario", () => {
    expect(scenario?.componentSlug).toBe(slug);
    expect(scenario?.fixtures?.multisig?.[0]).toEqual({
      id: "test-multisig",
      signers: ["signer1", "signer2", "signer3"],
      threshold: 2,
    });
    expect(scenario ? validateScenario(scenario) : ["missing scenario"]).toEqual([]);
  });

  it("keeps approval and threshold steps ordered", () => {
    expect(scenario?.steps.map((step) => step.method)).toEqual([
      "is_approved",
      "approve",
      "is_approved",
      "approve",
      "is_approved",
      "execute",
      "is_approved",
    ]);
  });

  it("rejects duplicate signers and invalid thresholds generically", () => {
    const invalid = {
      ...scenario!,
      fixtures: {
        ...scenario!.fixtures,
        multisig: [{ id: "bad", signers: ["signer1", "signer1"], threshold: 3 }],
      },
    };
    const issues = validateScenario(invalid);
    expect(issues.some((issue) => issue.message.includes("duplicate signers"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("invalid threshold"))).toBe(true);
  });
});
