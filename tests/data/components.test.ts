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
  "subscription",
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

    it("is implemented, sandbox-ready, and deployed to Testnet", () => {
      expect(payment).toBeDefined();
      expect(payment?.capabilities.implemented).toBe(true);
      expect(payment?.capabilities.sandbox).toBe(true);
      expect(payment?.capabilities.testnet).toBe(true);
    });

    it("declares a dependency on a token aliased 'asset'", () => {
      const dependencies = payment?.dependencies ?? [];
      expect(dependencies).toHaveLength(1);
      const asset = dependencies[0];
      expect(asset.alias).toBe("asset");
      expect(asset.package).toBe("token");
      expect(asset.constructorArgs).toMatchObject({ admin: "admin" });
      expect(asset.setup).toEqual([
        { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
      ]);
    });

    it("is deployed to Testnet with a live address", () => {
      expect(payment?.capabilities.testnet).toBe(true);
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
    it("keeps exactly the current concepts", () => {
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

  describe("Escrow (third implemented component)", () => {
    const escrow = getComponentBySlug("escrow")!;

    it("is implemented, sandbox-ready, and not on Testnet", () => {
      expect(escrow?.capabilities).toEqual({
        implemented: true,
        sandbox: true,
        testnet: false,
      });
    });

    it("declares a token asset dependency aliased 'asset'", () => {
      const dependencies = escrow?.dependencies ?? [];
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].alias).toBe("asset");
      expect(dependencies[0].package).toBe("token");
    });

    it("declares catalog-driven constructor defaults", () => {
      const constructor = escrow?.constructorArgs ?? {};
      expect(constructor.depositor).toBe("user1");
      expect(constructor.beneficiary).toBe("user2");
      expect(constructor.arbiter).toBe("admin");
      expect(constructor.asset).toBe("asset");
    });

    it("exposes an interface matching the contract", () => {
      const names = (escrow?.interface ?? []).map((fn) => fn.name);
      expect(names).toEqual([
        "__constructor",
        "deposit",
        "release",
        "refund",
        "status",
      ]);
      const ctor = escrow?.interface?.find((fn) => fn.name === "__constructor");
      expect(ctor?.params.map((p) => p.name)).toEqual([
        "depositor",
        "beneficiary",
        "arbiter",
        "asset",
      ]);
    });
  });

  describe("Access Control (fourth implemented component)", () => {
    const accessControl = getComponentBySlug("access-control")!;

    it("is implemented, sandbox-ready, and not on Testnet", () => {
      expect(accessControl?.capabilities).toEqual({
        implemented: true,
        sandbox: true,
        testnet: false,
      });
    });

    it("declares a catalog-driven constructor default for the admin", () => {
      const constructor = accessControl?.constructorArgs ?? {};
      expect(constructor.admin).toBe("admin");
    });

    it("exposes an interface matching the contract", () => {
      const names = (accessControl?.interface ?? []).map((fn) => fn.name);
      expect(names).toEqual([
        "__constructor",
        "grant_role",
        "revoke_role",
        "has_role",
        "transfer_admin",
      ]);
      const ctor = accessControl?.interface?.find(
        (fn) => fn.name === "__constructor",
      );
      expect(ctor?.params.map((p) => p.name)).toEqual(["admin"]);
      const grant = accessControl?.interface?.find(
        (fn) => fn.name === "grant_role",
      );
      expect(grant?.params.map((p) => p.name)).toEqual(["role", "account"]);
      expect(grant?.params.map((p) => p.type)).toEqual(["Symbol", "Address"]);
      expect(grant?.authorization).toBe("admin");
      const hasRole = accessControl?.interface?.find(
        (fn) => fn.name === "has_role",
      );
      expect(hasRole?.returns).toBe("bool");
      expect(hasRole?.authorization).toBe("none");
    });

    it("declares only name and network configuration", () => {
      const keys = (accessControl?.config ?? []).map((f) => f.key);
      expect(keys).toEqual(["name", "network"]);
    });
  });

  describe("Multi-signature (fifth implemented component)", () => {
    const multiSig = getComponentBySlug("multi-signature")!;

    it("is implemented, sandbox-ready, and not on Testnet", () => {
      expect(multiSig?.capabilities).toEqual({
        implemented: true,
        sandbox: true,
        testnet: false,
      });
    });

    it("declares three novel signer identities as constructor defaults", () => {
      const constructor = multiSig?.constructorArgs ?? {};
      expect(constructor.signer1).toBe("signer1");
      expect(constructor.signer2).toBe("signer2");
      expect(constructor.signer3).toBe("signer3");
      expect(constructor.threshold).toBe("2");
    });

    it("exposes an interface matching the contract", () => {
      const names = (multiSig?.interface ?? []).map((fn) => fn.name);
      expect(names).toEqual([
        "__constructor",
        "approve",
        "execute",
        "is_approved",
      ]);
      const ctor = multiSig?.interface?.find(
        (fn) => fn.name === "__constructor",
      );
      expect(ctor?.params.map((p) => p.name)).toEqual([
        "signer1",
        "signer2",
        "signer3",
        "threshold",
      ]);
      expect(ctor?.params.map((p) => p.type)).toEqual([
        "Address",
        "Address",
        "Address",
        "u32",
      ]);
      const approve = multiSig?.interface?.find(
        (fn) => fn.name === "approve",
      );
      expect(approve?.params.map((p) => p.name)).toEqual([
        "signer",
        "proposal_id",
      ]);
      expect(approve?.params.map((p) => p.type)).toEqual([
        "Address",
        "Symbol",
      ]);
      expect(approve?.authorization).toBe("first-address");
      const isApproved = multiSig?.interface?.find(
        (fn) => fn.name === "is_approved",
      );
      expect(isApproved?.returns).toBe("bool");
      expect(isApproved?.authorization).toBe("none");
      const execute = multiSig?.interface?.find((fn) => fn.name === "execute");
      expect(execute?.authorization).toBe("none");
    });

    it("declares only name and network configuration", () => {
      const keys = (multiSig?.config ?? []).map((f) => f.key);
      expect(keys).toEqual(["name", "network"]);
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
      const component = getComponentBySlug("subscription")!;
      expect(component.implementation).toBeUndefined();
      expect(componentWasmPath(component)).toBeNull();
    });
  });
});
