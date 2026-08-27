import { describe, expect, it } from "vitest";

import { generateRustIntegration } from "@/lib/integration/generators";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";

const staking = getComponentBySlug("staking")!;
const configValues = getConfigDefaults(staking);
const code = generateRustIntegration({ component: staking, configValues }) as string;

describe("Staking integration example generation", () => {
  it("uses the StakingClient generated from the staking package", () => {
    expect(code).toContain("use staking::StakingClient;");
    expect(code).toContain("StakingClient::new(");
  });

  it("exercises fund_rewards, stake, unstake, claim and the read views", () => {
    expect(code).toContain("client.fund_rewards(");
    expect(code).toContain("client.stake(");
    expect(code).toContain("client.unstake(");
    expect(code).toContain("client.claim(");
    expect(code).toContain("client.staked_balance(");
    expect(code).toContain("client.earned(");
    expect(code).toContain("client.total_staked(");
    expect(code).toContain("client.reward_rate(");
  });

  it("provisions the asset dependency as an address", () => {
    expect(code).toContain("&asset_address");
    expect(code).not.toContain("configure me");
  });

  it("resolves the duration constructor argument to a u32 literal", () => {
    expect(code).toContain("86400_u32");
  });

  it("does not inline the admin placeholder", () => {
    expect(code).not.toContain("&admin");
  });

  it("authorizes first-address calls via the from argument", () => {
    expect(code).toContain("client.stake(&alice, &");
  });
});
