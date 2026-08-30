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

describe("Subscription catalog metadata", () => {
  const subscription = getComponentBySlug("subscription")!;

  it("exists as an implemented, sandbox-ready, Testnet-deployed component", () => {
    expect(subscription).toBeDefined();
    expect(subscription.capabilities).toEqual({
      implemented: true,
      sandbox: true,
      testnet: true,
    });
  });

  it("declares the subscriber/merchant/asset as Address params", () => {
    const names = (subscription.interface ?? [])
      .find((fn) => fn.name === "__constructor")
      ?.params.map((p) => p.name);
    expect(names).toEqual([
      "subscriber",
      "merchant",
      "asset",
      "amount",
      "interval",
    ]);
    const types = (subscription.interface ?? [])
      .find((fn) => fn.name === "__constructor")
      ?.params.map((p) => p.type);
    expect(types).toEqual(["Address", "Address", "Address", "i128", "u32"]);
  });

  it("exposes is_active returning bool and charge/cancel as first-address", () => {
    const charge = subscription.interface?.find((fn) => fn.name === "charge");
    expect(charge?.params.map((p) => p.type)).toEqual(["Address"]);
    expect(charge?.authorization).toBe("first-address");
    const isActive = subscription.interface?.find(
      (fn) => fn.name === "is_active",
    );
    expect(isActive?.returns).toBe("bool");
    expect(isActive?.authorization).toBe("none");
    const cancel = subscription.interface?.find((fn) => fn.name === "cancel");
    expect(cancel?.authorization).toBe("first-address");
  });
});

describe("Subscription novel identity discovery", () => {
  const subscription = getComponentBySlug("subscription")!;

  it("automatically discovers the novel identities from catalog metadata", () => {
    expect(discoverIdentityNames(subscription).sort()).toEqual([
      "admin",
      "merchant",
      "subscriber",
    ]);
  });

  it("exposes the novel identities and the asset alias in the options", () => {
    const options = playgroundIdentityOptions(subscription);
    expect(options).toContain("subscriber");
    expect(options).toContain("merchant");
    expect(options).toContain("asset");
    // Base defaults remain available alongside the novel names.
    expect(options).toContain("admin");
    expect(options).toContain("user1");
  });

  it("resolves the novel identities to deterministic addresses via the API", () => {
    const context = resolveIdentityContext(subscription);
    expect(context.knownNames.has("subscriber")).toBe(true);
    expect(context.knownNames.has("merchant")).toBe(true);
    expect(context.knownNames.has("asset")).toBe(true);

    const s1 = context.identities["subscriber"];
    const m1 = context.identities["merchant"];
    expect(s1).toBeDefined();
    expect(m1).toBeDefined();
    for (const addr of [s1!, m1!]) {
      expect(addr.startsWith("G")).toBe(true);
    }
    expect(s1).not.toEqual(m1);

    // Deterministic: the same name always yields the same address.
    const again = resolveIdentityContext(subscription).identities["subscriber"];
    expect(again).toEqual(s1);
  });
});

describe("Subscription constructor handling", () => {
  const subscription = getComponentBySlug("subscription")!;

  it("builds catalog-driven constructor defaults from the novel identities", () => {
    const request = buildConstructorRequest(
      subscription as StellarComponent,
      getConfigDefaults(subscription),
    );
    expect(request).toEqual({
      subscriber: "subscriber",
      merchant: "merchant",
      asset: "asset",
      amount: "1000",
      interval: "3600",
    });
  });
});
