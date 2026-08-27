import { describe, expect, it } from "vitest";
import {
  getComponentBySlug,
  getConfigDefaults,
  type StellarComponent,
} from "@/data/components";
import {
  buildConstructorRequest,
  discoverIdentityNames,
  playgroundIdentityOptions,
} from "@/lib/playground/execution";
import { resolveIdentityContext } from "@/app/api/playground/route";

describe("Vesting catalog metadata", () => {
  const vesting = getComponentBySlug("vesting")!;

  it("exists as an implemented, sandbox-ready, non-Testnet component", () => {
    expect(vesting).toBeDefined();
    expect(vesting.capabilities).toEqual({
      implemented: true,
      sandbox: true,
      testnet: false,
    });
  });

  it("declares the beneficiary/asset as Address params and time as u32", () => {
    const names = (vesting.interface ?? [])
      .find((fn) => fn.name === "__constructor")
      ?.params.map((p) => p.name);
    expect(names).toEqual([
      "beneficiary",
      "asset",
      "total",
      "start",
      "duration",
      "cliff",
    ]);
    const types = (vesting.interface ?? [])
      .find((fn) => fn.name === "__constructor")
      ?.params.map((p) => p.type);
    expect(types).toEqual([
      "Address",
      "Address",
      "i128",
      "u32",
      "u32",
      "u32",
    ]);
  });

  it("exposes claim as first-address and claimable/released as none returning i128", () => {
    const claim = vesting.interface?.find((fn) => fn.name === "claim");
    expect(claim?.params.map((p) => p.type)).toEqual(["Address"]);
    expect(claim?.authorization).toBe("first-address");
    const claimable = vesting.interface?.find((fn) => fn.name === "claimable");
    expect(claimable?.returns).toBe("i128");
    expect(claimable?.authorization).toBe("none");
    const released = vesting.interface?.find((fn) => fn.name === "released");
    expect(released?.returns).toBe("i128");
    expect(released?.authorization).toBe("none");
  });
});

describe("Vesting novel identity discovery", () => {
  const vesting = getComponentBySlug("vesting")!;

  it("automatically discovers the novel identities from catalog metadata", () => {
    expect(discoverIdentityNames(vesting).sort()).toEqual([
      "admin",
      "beneficiary",
    ]);
  });

  it("exposes the novel identities and the asset alias in the options", () => {
    const options = playgroundIdentityOptions(vesting);
    expect(options).toContain("beneficiary");
    expect(options).toContain("asset");
    // Base defaults remain available alongside the novel names.
    expect(options).toContain("admin");
    expect(options).toContain("user1");
  });

  it("resolves the novel identities to deterministic addresses via the API", () => {
    const context = resolveIdentityContext(vesting);
    expect(context.knownNames.has("beneficiary")).toBe(true);
    expect(context.knownNames.has("asset")).toBe(true);

    const b1 = context.identities["beneficiary"];
    expect(b1).toBeDefined();
    expect(b1!.startsWith("G")).toBe(true);

    // Deterministic: the same name always yields the same address.
    const again = resolveIdentityContext(vesting).identities["beneficiary"];
    expect(again).toEqual(b1);
  });
});

describe("Vesting constructor handling", () => {
  const vesting = getComponentBySlug("vesting")!;

  it("builds catalog-driven constructor defaults from the novel identities", () => {
    const request = buildConstructorRequest(
      vesting as StellarComponent,
      getConfigDefaults(vesting),
    );
    expect(request).toEqual({
      beneficiary: "beneficiary",
      asset: "asset",
      total: "1000000",
      start: "0",
      duration: "86400",
      cliff: "3600",
    });
  });
});
