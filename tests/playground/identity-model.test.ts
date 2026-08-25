import { describe, expect, it } from "vitest";
import {
  getComponentBySlug,
  type StellarComponent,
} from "@/data/components";
import {
  discoverIdentityNames,
  playgroundIdentityOptions,
} from "@/lib/playground/execution";
import { resolveIdentityContext } from "@/app/api/playground/route";

const STRKEY = `G${"A".repeat(55)}`;

function synthetic(partial: Partial<StellarComponent>): StellarComponent {
  return {
    slug: "fixture",
    name: "Fixture",
    description: "",
    category: "Security",
    capabilities: { implemented: true, sandbox: true, testnet: false },
    shortDescription: "",
    overview: "",
    useCases: [],
    ...partial,
  } as unknown as StellarComponent;
}

describe("discoverIdentityNames", () => {
  it("finds novel identity names from a component constructor", () => {
    const component = synthetic({
      interface: [
        {
          name: "__constructor",
          params: [
            { name: "governor", type: "Address" },
            { name: "treasury", type: "Address" },
          ],
        },
      ],
      constructorArgs: { governor: "governor", treasury: "treasury" },
    });
    expect(discoverIdentityNames(component).sort()).toEqual([
      "governor",
      "treasury",
    ]);
  });

  it("excludes dependency aliases and literal strkeys", () => {
    const component = synthetic({
      interface: [
        {
          name: "__constructor",
          params: [
            { name: "asset", type: "Address" },
            { name: "owner", type: "Address" },
          ],
        },
      ],
      constructorArgs: { asset: "asset", owner: STRKEY },
      dependencies: [
        { alias: "asset", package: "token", constructorArgs: { admin: "admin" } },
      ],
    });
    const names = discoverIdentityNames(component);
    expect(names).toContain("admin"); // from the dependency constructor
    expect(names).not.toContain("asset"); // alias, not an identity
    expect(names).not.toContain(STRKEY); // literal strkey, not a name
  });

  it("returns admin for Access Control (regression)", () => {
    const accessControl = getComponentBySlug("access-control")!;
    expect(discoverIdentityNames(accessControl)).toEqual(["admin"]);
  });
});

describe("playgroundIdentityOptions", () => {
  it("includes novel names plus base defaults plus dependency aliases", () => {
    const component = synthetic({
      interface: [
        {
          name: "__constructor",
          params: [
            { name: "governor", type: "Address" },
            { name: "treasury", type: "Address" },
          ],
        },
      ],
      constructorArgs: { governor: "governor", treasury: "treasury" },
      dependencies: [
        { alias: "asset", package: "token", constructorArgs: {} },
      ],
    });
    const options = playgroundIdentityOptions(component);
    expect(options).toContain("admin");
    expect(options).toContain("user1");
    expect(options).toContain("user2");
    expect(options).toContain("governor");
    expect(options).toContain("treasury");
    expect(options).toContain("asset");
  });
});

describe("resolveIdentityContext", () => {
  it("generates deterministic addresses for novel identities", () => {
    const component = synthetic({
      interface: [
        {
          name: "__constructor",
          params: [
            { name: "governor", type: "Address" },
            { name: "treasury", type: "Address" },
          ],
        },
      ],
      constructorArgs: { governor: "governor", treasury: "treasury" },
    });
    const context = resolveIdentityContext(component);
    expect(context.knownNames.has("governor")).toBe(true);
    expect(context.knownNames.has("treasury")).toBe(true);

    const governor = context.identities["governor"];
    const treasury = context.identities["treasury"];
    expect(governor).toBeDefined();
    expect(treasury).toBeDefined();
    expect(governor!.startsWith("G")).toBe(true);
    expect(treasury!.startsWith("G")).toBe(true);
    expect(governor).not.toEqual(treasury);

    // Deterministic: the same name always yields the same address.
    const again = resolveIdentityContext(component).identities["governor"];
    expect(again).toEqual(governor);
  });

  it("does not generate addresses for base identities (regression)", () => {
    const accessControl = getComponentBySlug("access-control")!;
    const context = resolveIdentityContext(accessControl);
    expect(context.identities["admin"]).toBeUndefined();
    expect(context.knownNames.has("admin")).toBe(true);
  });

  it("keeps user-provided identities and lets them override", () => {
    const component = synthetic({
      interface: [
        {
          name: "__constructor",
          params: [{ name: "governor", type: "Address" }],
        },
      ],
      constructorArgs: { governor: "governor" },
    });
    const context = resolveIdentityContext(component, {
      governor: "GUSERPROVIDEDADDRESS234567ABCDEFGHIJKLMNOPQRSTUVWXYZ234",
    });
    expect(context.identities["governor"]).toBe(
      "GUSERPROVIDEDADDRESS234567ABCDEFGHIJKLMNOPQRSTUVWXYZ234",
    );
  });
});
