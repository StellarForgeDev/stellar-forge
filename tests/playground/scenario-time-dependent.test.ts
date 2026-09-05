import { describe, expect, it } from "vitest";
import { getComponentByPackage } from "@/data/components";
import { getScenario } from "@/lib/playground/scenarios";
import { validateScenario } from "@/lib/playground/scenario-validation";

describe("time-dependent guided workflows", () => {
  const cases = [
    ["vesting", "vesting.claim-after-cliff", ["claimable", "deposit", "", "claimable", "claim", "released"]],
    ["subscription", "subscription.charge-and-cancel", ["is_active", "charge", "", "charge", "cancel", "is_active"]],
    ["crowdfund", "crowdfund.reach-goal-and-withdraw", ["create_campaign", "contribute", "total_raised", "goal_reached", "", "withdraw"]],
    ["staking", "staking.earn-and-claim", ["staked_balance", "fund_rewards", "stake", "staked_balance", "earned", "", "earned", "claim", "earned"]],
  ] as const;

  it.each(cases)("registers and validates %s", (pkg, id, methods) => {
    const slug = getComponentByPackage(pkg)?.slug ?? "";
    const scenario = getScenario(slug, id);
    expect(scenario).toBeDefined();
    expect(scenario?.steps.map((step) => step.method)).toEqual(methods);
    expect(scenario ? validateScenario(scenario) : []).toEqual([]);
  });

  it("uses a backwards campaign ID reference", () => {
    const scenario = getScenario("crowdfund", "crowdfund.reach-goal-and-withdraw")!;
    const references = scenario.steps.flatMap((step) => step.args).filter((arg) => typeof arg === "object" && arg !== null && "reference" in arg);
    expect(references).toHaveLength(4);
    expect(validateScenario(scenario)).toEqual([]);
  });
});
