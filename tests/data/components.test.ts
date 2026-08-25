import { describe, expect, it } from "vitest";
import {
  componentMaturity,
  componentWasmPath,
  getComponentByPackage,
  getComponentBySlug,
  getConfigDefaults,
  stellarComponents,
} from "@/data/components";

const CONCEPT_SLUGS = [
  "access-control",
  "escrow",
  "subscription",
  "multi-signature",
];

describe("Component Standard v1 invariants", () => {
  describe("Token", () => {
    const token = getComponentBySlug("token");

    it("is implemented, sandbox-ready, and deployed on Testnet", () => {
      expect(token).toBeDefined();
      expect(token?.capabilities.implemented).toBe(true);
      expect(token?.capabilities.sandbox).toBe(true);
      expect(token?.capabilities.testnet).toBe(true);
    });
  });

  describe("Payment", () => {
    const payment = getComponentBySlug("payment");

    it("is implemented and sandbox-ready but not yet on Testnet", () => {
      expect(payment).toBeDefined();
      expect(payment?.capabilities.implemented).toBe(true);
      expect(payment?.capabilities.sandbox).toBe(true);
      expect(payment?.capabilities.testnet).toBe(false);
    });

    it("declares a dependency on a token aliased 'asset'", () => {
      const dependencies = payment?.dependencies ?? [];
      expect(dependencies).toHaveLength(1);
      const asset = dependencies[0];
      expect(asset.alias).toBe("asset");
      expect(asset.package).toBe("token");
      expect(asset.constructor).toMatchObject({ admin: "admin" });
      expect(asset.setup).toEqual([
        { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
      ]);
    });

    it("does not deploy to Testnet (no live address)", () => {
      expect(payment?.capabilities.testnet).toBe(false);
      expect(payment?.implementation?.package).toBe("payment");
    });
  });

  describe("getComponentByPackage", () => {
    it("resolves a component by its implementation package", () => {
      expect(getComponentByPackage("token")?.slug).toBe("token");
      expect(getComponentByPackage("payment")?.slug).toBe("payment");
    });

    it("returns undefined for an unknown package", () => {
      expect(getComponentByPackage("nope")).toBeUndefined();
    });
  });

  describe("Concept components", () => {
    it("keeps exactly the four current concepts", () => {
      const conceptSlugs = stellarComponents
        .filter((c) => c.capabilities.implemented === false)
        .map((c) => c.slug);
      expect(conceptSlugs.sort()).toEqual([...CONCEPT_SLUGS].sort());
    });

    it("marks every concept as not implemented, not sandbox, not testnet", () => {
      for (const slug of CONCEPT_SLUGS) {
        const component = getComponentBySlug(slug);
        expect(component, slug).toBeDefined();
        expect(component?.capabilities).toEqual({
          implemented: false,
          sandbox: false,
          testnet: false,
        });
      }
    });
  });

  describe("componentMaturity", () => {
    it("returns Implemented for the Token and Payment", () => {
      expect(componentMaturity(getComponentBySlug("token")!)).toBe(
        "Implemented",
      );
      expect(componentMaturity(getComponentBySlug("payment")!)).toBe(
        "Implemented",
      );
    });

    it("returns Concept for every concept component", () => {
      for (const slug of CONCEPT_SLUGS) {
        expect(componentMaturity(getComponentBySlug(slug)!)).toBe("Concept");
      }
    });

    it("only reports the two supported maturity states", () => {
      const states = stellarComponents.map(componentMaturity);
      expect(new Set(states)).toEqual(new Set(["Concept", "Implemented"]));
    });
  });

  describe("getComponentBySlug", () => {
    it("returns the matching component for a known slug", () => {
      const token = getComponentBySlug("token");
      expect(token?.slug).toBe("token");
      expect(token?.name).toBe("Token");
    });

    it("returns undefined for an unknown slug", () => {
      expect(getComponentBySlug("does-not-exist")).toBeUndefined();
    });
  });

  describe("getConfigDefaults", () => {
    it("maps each config field key to its default value", () => {
      const token = getComponentBySlug("token")!;
      const defaults = getConfigDefaults(token);
      expect(defaults).toEqual({
        name: "Forge Token",
        symbol: "FORGE",
        decimals: "7",
        network: "testnet",
      });
    });

    it("returns an empty object when the component has no config", () => {
      const component = {
        ...getComponentBySlug("token")!,
        config: undefined,
      };
      expect(getConfigDefaults(component)).toEqual({});
    });
  });

  describe("componentWasmPath", () => {
    it("builds the wasm path from the implementation metadata", () => {
      const token = getComponentBySlug("token")!;
      expect(componentWasmPath(token)).toBe(
        "contracts/target/wasm32v1-none/release/token.wasm",
      );
    });

    it("returns null when there is no implementation", () => {
      const component = getComponentBySlug("escrow")!;
      expect(component.implementation).toBeUndefined();
      expect(componentWasmPath(component)).toBeNull();
    });
  });
});
