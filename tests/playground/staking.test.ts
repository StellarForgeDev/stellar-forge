import { describe, expect, it } from "vitest";

import {
  buildConstructorRequest,
  discoverIdentityNames,
  playgroundIdentityOptions,
} from "@/lib/playground/execution";
import { resolveIdentityContext } from "@/app/api/playground/route";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import { SUPPORTED_PARAMETER_TYPES } from "@/lib/transactions/parameter-types";

const staking = getComponentBySlug("staking")!;
const iface = staking.interface!;

describe("Staking catalog metadata", () => {
  it("is implemented, sandbox-ready, and deployed on Testnet", () => {
    expect(staking.capabilities).toEqual({
      implemented: true,
      sandbox: true,
      testnet: true,
    });
  });

  it("is driven by the generic component pipeline", () => {
    expect(staking.implementation?.language).toBe("rust");
    expect(staking.implementation?.package).toBe("staking");
    expect(staking.implementation?.sourcePath).toBe("contracts/contracts/staking");
    expect(staking.implementation?.buildTarget).toBe("wasm32v1-none");
  });

  it("declares the constructor as (asset: Address, duration: u32)", () => {
    const names = iface[0].params.map((p) => p.name);
    const types = iface[0].params.map((p) => p.type);
    expect(names).toEqual(["asset", "duration"]);
    expect(types).toEqual(["Address", "u32"]);
  });

  it("exposes fund/stake/unstake/claim plus read views", () => {
    const names = iface.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "__constructor",
        "fund_rewards",
        "stake",
        "unstake",
        "claim",
        "staked_balance",
        "earned",
        "total_staked",
        "reward_rate",
      ]),
    );
  });

  it("fund_rewards is admin-authorized and claim is first-address returning i128", () => {
    const fund = iface.find((f) => f.name === "fund_rewards")!;
    const claim = iface.find((f) => f.name === "claim")!;
    const stake = iface.find((f) => f.name === "stake")!;
    expect(fund.authorization).toBe("admin");
    expect(stake.authorization).toBe("first-address");
    expect(claim.authorization).toBe("first-address");
    expect(claim.returns).toBe("i128");
  });

  it("only uses supported parameter types", () => {
    for (const fn of iface) {
      for (const param of fn.params) {
        expect(SUPPORTED_PARAMETER_TYPES).toContain(param.type);
      }
    }
  });

  it("declares a token asset dependency aliased 'asset'", () => {
    expect(staking.dependencies).toHaveLength(1);
    const dep = staking.dependencies![0];
    expect(dep.alias).toBe("asset");
    expect(dep.package).toBe("token");
    expect(dep.constructorArgs).toEqual({
      admin: "admin",
      decimal: "7",
      name: "Staking Asset",
      symbol: "STAKE",
    });
  });

  it("declares catalog-driven constructor defaults", () => {
    expect(staking.constructorArgs).toEqual({
      asset: "asset",
      duration: "86400",
    });
  });

  it("declares only name and network configuration", () => {
    const keys = (staking.config ?? []).map((c) => c.key);
    expect(keys).toEqual(["name", "network"]);
  });
});

describe("Staking identity and constructor resolution", () => {
  it("discovers the token admin identity from the dependency", () => {
    expect(discoverIdentityNames(staking)).toEqual(["admin"]);
  });

  it("offers the standard playground identities", () => {
    const options = playgroundIdentityOptions(staking);
    expect(options).toContain("admin");
    expect(options).toContain("user1");
    expect(options).toContain("asset");
  });

  it("exposes admin and the asset alias in the known identity names", () => {
    const ctx = resolveIdentityContext(staking);
    expect(ctx.knownNames.has("admin")).toBe(true);
    expect(ctx.knownNames.has("asset")).toBe(true);
    // admin is a default identity, so it is not materialized into the
    // identities map; staking introduces no non-default novel identity.
    expect(Object.keys(ctx.identities)).toEqual([]);
    const again = resolveIdentityContext(staking);
    expect([...again.knownNames].sort()).toEqual([...ctx.knownNames].sort());
    expect(again.identities).toEqual(ctx.identities);
  });

  it("builds a constructor request that references the asset alias and duration", () => {
    const request = buildConstructorRequest(staking, getConfigDefaults(staking));
    expect(request).toEqual({ asset: "asset", duration: "86400" });
  });
});
