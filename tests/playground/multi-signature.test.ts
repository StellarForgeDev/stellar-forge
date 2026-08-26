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

describe("Multi-signature catalog metadata", () => {
  const multiSig = getComponentBySlug("multi-signature")!;

  it("exists as an implemented, sandbox-ready, non-Testnet component", () => {
    expect(multiSig).toBeDefined();
    expect(multiSig.capabilities).toEqual({
      implemented: true,
      sandbox: true,
      testnet: false,
    });
  });

  it("declares three novel signer identities as Address params", () => {
    const names = (multiSig.interface ?? [])
      .find((fn) => fn.name === "__constructor")
      ?.params.map((p) => p.name);
    expect(names).toEqual(["signer1", "signer2", "signer3", "threshold"]);
    const types = (multiSig.interface ?? [])
      .find((fn) => fn.name === "__constructor")
      ?.params.map((p) => p.type);
    expect(types).toEqual(["Address", "Address", "Address", "u32"]);
  });

  it("exposes is_approved returning bool and approve as first-address", () => {
    const approve = multiSig.interface?.find((fn) => fn.name === "approve");
    expect(approve?.params.map((p) => p.type)).toEqual([
      "Address",
      "Symbol",
    ]);
    expect(approve?.authorization).toBe("first-address");
    const isApproved = multiSig.interface?.find(
      (fn) => fn.name === "is_approved",
    );
    expect(isApproved?.returns).toBe("bool");
    expect(isApproved?.authorization).toBe("none");
  });
});

describe("Multi-signature novel identity discovery", () => {
  const multiSig = getComponentBySlug("multi-signature")!;

  it("automatically discovers the three novel signer identities", () => {
    expect(discoverIdentityNames(multiSig).sort()).toEqual([
      "signer1",
      "signer2",
      "signer3",
    ]);
  });

  it("exposes the novel identities in the Playground identity options", () => {
    const options = playgroundIdentityOptions(multiSig);
    expect(options).toContain("signer1");
    expect(options).toContain("signer2");
    expect(options).toContain("signer3");
    // Base defaults remain available alongside the novel names.
    expect(options).toContain("admin");
    expect(options).toContain("user1");
  });

  it("resolves the novel identities to deterministic addresses via the API", () => {
    const context = resolveIdentityContext(multiSig);
    expect(context.knownNames.has("signer1")).toBe(true);
    expect(context.knownNames.has("signer2")).toBe(true);
    expect(context.knownNames.has("signer3")).toBe(true);

    const s1 = context.identities["signer1"];
    const s2 = context.identities["signer2"];
    const s3 = context.identities["signer3"];
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s3).toBeDefined();
    for (const addr of [s1!, s2!, s3!]) {
      expect(addr.startsWith("G")).toBe(true);
    }
    expect(new Set([s1, s2, s3]).size).toBe(3);

    // Deterministic: the same name always yields the same address.
    const again = resolveIdentityContext(multiSig).identities["signer1"];
    expect(again).toEqual(s1);
  });
});

describe("Multi-signature constructor handling", () => {
  const multiSig = getComponentBySlug("multi-signature")!;

  it("builds catalog-driven constructor defaults from the novel identities", () => {
    const request = buildConstructorRequest(
      multiSig as StellarComponent,
      getConfigDefaults(multiSig),
    );
    expect(request).toEqual({
      signer1: "signer1",
      signer2: "signer2",
      signer3: "signer3",
      threshold: "2",
    });
  });
});
