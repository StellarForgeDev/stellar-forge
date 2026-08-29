import { describe, expect, it } from "vitest";
import {
  componentCategories,
  componentMaturity,
  componentWasmPath,
  getComponentByPackage,
  getComponentBySlug,
  getConfigDefaults,
  orderComponents,
  stellarComponents,
} from "@/data/components";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseParameterType } from "@/lib/transactions/parameter-types";

const ALLOWED_AUTH = ["none", "admin", "first-address"] as const;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// These invariants are intentionally generic: they validate the Component
// Standard v1 contract for EVERY catalog entry, so adding a new component is
// automatically covered. There are no per-component hand-maintained blocks —
// structural regressions (renamed methods, dropped authorization, broken
// dependency wiring, missing prebuilt wasm, etc.) are caught for every
// catalog entry (the count is derived from stellarComponents, never hardcoded).
describe("Component Standard v1 invariants (generic, catalog-driven)", () => {
  describe("catalog shape", () => {
    it("every component has valid core metadata", () => {
      for (const c of stellarComponents) {
        expect(typeof c.slug).toBe("string");
        expect(c.slug.length).toBeGreaterThan(0);
        expect(typeof c.name).toBe("string");
        expect(c.name.length).toBeGreaterThan(0);
        expect(typeof c.description).toBe("string");
        expect(c.description.length).toBeGreaterThan(0);
        expect(typeof c.category).toBe("string");
        expect(c.category.length).toBeGreaterThan(0);
        expect(typeof c.shortDescription).toBe("string");
        expect(c.shortDescription.length).toBeGreaterThan(0);
        expect(typeof c.overview).toBe("string");
        expect(c.overview.length).toBeGreaterThan(0);
        expect(Array.isArray(c.useCases)).toBe(true);
        expect(c.capabilities).toBeDefined();
        expect(typeof c.capabilities.implemented).toBe("boolean");
        expect(typeof c.capabilities.sandbox).toBe("boolean");
        expect(typeof c.capabilities.testnet).toBe("boolean");
      }
    });

    it("implemented components declare an interface and implementation", () => {
      for (const c of stellarComponents) {
        if (!c.capabilities.implemented) continue;
        expect(c.interface, c.slug).toBeDefined();
        expect(
          Array.isArray(c.interface) && c.interface.length > 0,
          c.slug,
        ).toBe(true);
        expect(c.implementation, c.slug).toBeDefined();
        expect(typeof c.implementation?.package).toBe("string");
        expect(typeof c.implementation?.sourcePath).toBe("string");
        expect(typeof c.implementation?.buildTarget).toBe("string");
      }
    });

    it("testnet capability implies implemented + sandbox-ready", () => {
      for (const c of stellarComponents) {
        if (c.capabilities.testnet) {
          expect(c.capabilities.implemented, c.slug).toBe(true);
          expect(c.capabilities.sandbox, c.slug).toBe(true);
        }
      }
    });
  });

  describe("interface + method metadata", () => {
    it("every function has valid name, params, types, and authorization", () => {
      for (const c of stellarComponents) {
        const seen = new Set<string>();
        let constructors = 0;
        for (const fn of c.interface ?? []) {
          expect(typeof fn.name, `${c.slug}.${fn?.name}`).toBe("string");
          expect(IDENTIFIER.test(fn.name), `${c.slug}.${fn.name}`).toBe(true);
          expect(
            seen.has(fn.name),
            `duplicate method ${c.slug}.${fn.name}`,
          ).toBe(false);
          seen.add(fn.name);
          if (fn.name === "__constructor") constructors += 1;
          const paramNames = new Set<string>();
          for (const p of fn.params) {
            expect(
              typeof p.name,
              `${c.slug}.${fn.name}.${p?.name}`,
            ).toBe("string");
            expect(
              IDENTIFIER.test(p.name),
              `${c.slug}.${fn.name}.${p.name}`,
            ).toBe(true);
            expect(
              paramNames.has(p.name),
              `duplicate param ${c.slug}.${fn.name}.${p.name}`,
            ).toBe(false);
            paramNames.add(p.name);
            expect(
              parseParameterType(p.type),
              `${c.slug}.${fn.name}.${p.name} type ${p.type}`,
            ).not.toBeNull();
          }
          if (fn.returns) {
            expect(
              parseParameterType(fn.returns),
              `${c.slug}.${fn.name} returns ${fn.returns}`,
            ).not.toBeNull();
          }
          expect(fn.authorization, `${c.slug}.${fn.name}`).toBeDefined();
          expect(ALLOWED_AUTH, `${c.slug}.${fn.name}`).toContain(
            fn.authorization,
          );
        }
        if (c.capabilities.implemented) {
          expect(
            constructors,
            `${c.slug} should declare exactly one constructor`,
          ).toBe(1);
        }
      }
    });
  });

  describe("authorization metadata", () => {
    it("marks at least one function as admin-only across the catalog", () => {
      const adminFns = stellarComponents.flatMap((c) =>
        (c.interface ?? []).filter((fn) => fn.authorization === "admin"),
      );
      expect(adminFns.length).toBeGreaterThan(0);
    });
  });

  describe("dependencies", () => {
    it("are internally consistent and resolve to implemented packages", () => {
      for (const c of stellarComponents) {
        const aliases = new Set<string>();
        for (const dep of c.dependencies ?? []) {
          expect(IDENTIFIER.test(dep.alias), `${c.slug} dep ${dep.alias}`).toBe(
            true,
          );
          expect(
            aliases.has(dep.alias),
            `${c.slug} duplicate dependency alias ${dep.alias}`,
          ).toBe(false);
          aliases.add(dep.alias);
          const pkg = getComponentByPackage(dep.package);
          expect(pkg, `${c.slug} -> ${dep.package}`).toBeDefined();
          expect(
            pkg?.capabilities.implemented,
            `${c.slug} -> ${dep.package}`,
          ).toBe(true);
          if (dep.constructorArgs) {
            expect(typeof dep.constructorArgs).toBe("object");
            for (const [k, v] of Object.entries(dep.constructorArgs)) {
              expect(typeof k).toBe("string");
              expect(typeof v).toBe("string");
            }
          }
          for (const call of dep.setup ?? []) {
            expect(typeof call.fn).toBe("string");
            expect(Array.isArray(call.args)).toBe(true);
            for (const a of call.args) expect(typeof a).toBe("string");
            const fn = (pkg?.interface ?? []).find((f) => f.name === call.fn);
            expect(
              fn,
              `${c.slug} setup calls ${dep.package}.${call.fn} which is not in its interface`,
            ).toBeDefined();
          }
        }
      }
    });
  });

  describe("configuration", () => {
    it("every config field is well-formed", () => {
      for (const c of stellarComponents) {
        for (const field of c.config ?? []) {
          expect(typeof field.key).toBe("string");
          expect(field.key.length).toBeGreaterThan(0);
          expect(typeof field.label).toBe("string");
          expect(field.label.length).toBeGreaterThan(0);
          expect(typeof field.type).toBe("string");
          expect(field.type.length).toBeGreaterThan(0);
          expect(typeof field.default).toBe("string");
          if (field.type === "select") {
            expect(Array.isArray(field.options)).toBe(true);
            expect((field.options ?? []).length).toBeGreaterThan(0);
            for (const opt of field.options ?? []) {
              expect(typeof opt.label).toBe("string");
              expect(typeof opt.value).toBe("string");
            }
          }
        }
      }
    });
  });

  describe("prebuilt WASM artifact integrity", () => {
    it("exposes a committed prebuilt wasm for every implemented component", () => {
      const missing: string[] = [];
      for (const c of stellarComponents) {
        if (!c.capabilities.implemented) continue;
        const pkg = c.implementation?.package;
        expect(
          pkg,
          `component ${c.slug} should declare implementation.package`,
        ).toBeDefined();
        const wasmPath = path.resolve(
          process.cwd(),
          "contracts",
          "prebuilt",
          `${pkg}.wasm`,
        );
        if (!existsSync(wasmPath)) missing.push(`${c.slug} -> ${pkg}.wasm`);
      }
      expect(
        missing,
        `missing committed prebuilt wasm: ${missing.join(", ")}`,
      ).toEqual([]);
    });
  });

  describe("slug registry + lookups", () => {
    it("slugs are unique", () => {
      const slugList = stellarComponents.map((c) => c.slug);
      expect(new Set(slugList).size).toBe(slugList.length);
    });

    it("getComponentBySlug resolves every component", () => {
      for (const c of stellarComponents) {
        expect(getComponentBySlug(c.slug), c.slug).toBe(c);
      }
    });

    it("getComponentByPackage resolves every implemented component", () => {
      for (const c of stellarComponents) {
        if (!c.capabilities.implemented) continue;
        expect(getComponentByPackage(c.implementation!.package), c.slug).toBe(c);
      }
    });
  });

  describe("getConfigDefaults", () => {
    it("returns one default per config field (or empty when none)", () => {
      for (const c of stellarComponents) {
        const defaults = getConfigDefaults(c);
        const keys = (c.config ?? []).map((f) => f.key);
        expect(Object.keys(defaults).sort()).toEqual([...keys].sort());
        for (const v of Object.values(defaults)) {
          expect(typeof v).toBe("string");
        }
      }
    });
  });

  describe("componentWasmPath", () => {
    it("builds the release wasm path from the implementation package", () => {
      for (const c of stellarComponents) {
        if (!c.capabilities.implemented) continue;
        const pkgFile = c.implementation!.package.replace(/-/g, "_");
        expect(componentWasmPath(c)).toBe(
          `contracts/target/wasm32v1-none/release/${pkgFile}.wasm`,
        );
      }
    });
  });

  describe("componentMaturity", () => {
    it("maps implemented -> Implemented and concept -> Concept", () => {
      const states = new Set<string>();
      for (const c of stellarComponents) {
        const maturity = componentMaturity(c);
        states.add(maturity);
        if (c.capabilities.implemented) {
          expect(maturity, c.slug).toBe("Implemented");
        } else {
          expect(maturity, c.slug).toBe("Concept");
        }
      }
      expect([...states]).toEqual(expect.arrayContaining(["Implemented"]));
      expect(new Set([...states]).size).toBeLessThanOrEqual(2);
    });
  });

  describe("concept components (data-driven)", () => {
    const conceptSlugs = stellarComponents
      .filter((c) => c.capabilities.implemented === false)
      .map((c) => c.slug);

    it("every concept is marked not implemented, not sandbox, not testnet", () => {
      for (const slug of conceptSlugs) {
        const c = getComponentBySlug(slug);
        expect(c, slug).toBeDefined();
        expect(c?.capabilities).toEqual({
          implemented: false,
          sandbox: false,
          testnet: false,
        });
      }
    });
  });
});

describe("catalog ordering (generic, data-driven)", () => {
  it("every catalog component has a valid numeric displayOrder", () => {
    for (const c of stellarComponents) {
      expect(typeof c.displayOrder).toBe("number");
      expect(Number.isFinite(c.displayOrder)).toBe(true);
    }
  });

  it("orders the catalog by displayOrder then name deterministically", () => {
    const ordered = orderComponents(stellarComponents);
    expect(ordered.map((c) => c.slug)).toEqual([
      "token",
      "payment",
      "allowance",
      "atomic-swap",
      "claimable-balance",
      "merkle-airdrop",
      "oracle",
      "vesting",
      "subscription",
      "crowdfund",
      "staking",
      "timelock",
      "escrow",
      "access-control",
      "multi-signature",
    ]);
  });

  it("does not mutate the source catalog array", () => {
    const before = stellarComponents.map((c) => c.slug);
    orderComponents(stellarComponents);
    expect(stellarComponents.map((c) => c.slug)).toEqual(before);
  });

  it("resolves equal displayOrder deterministically (name then slug)", () => {
    const alpha = {
      ...stellarComponents[1],
      slug: "aaa",
      name: "Alpha",
      displayOrder: 5,
    };
    const zeta = {
      ...stellarComponents[0],
      slug: "zzz",
      name: "Zeta",
      displayOrder: 5,
    };
    expect(orderComponents([zeta, alpha]).map((c) => c.slug)).toEqual([
      "aaa",
      "zzz",
    ]);
  });

  it("orders any input (including reversed) and keeps every component", () => {
    const reversed = [...stellarComponents].reverse();
    const ordered = orderComponents(reversed);
    expect(ordered.map((c) => c.slug).sort()).toEqual(
      stellarComponents.map((c) => c.slug).sort(),
    );
  });

  it("automatically includes a brand-new component in the ordering", () => {
    const extra = {
      ...stellarComponents[0],
      slug: "future-component",
      name: "Future Component",
      displayOrder: 15,
    };
    const ordered = orderComponents([...stellarComponents, extra]);
    expect(ordered).toHaveLength(stellarComponents.length + 1);
    expect(ordered.some((c) => c.slug === "future-component")).toBe(true);
  });

  it("places the homepage showcase and playground default at displayOrder 10 (token)", () => {
    expect(orderComponents(stellarComponents)[0].slug).toBe("token");
    expect(orderComponents(stellarComponents).slice(0, 6)[0].slug).toBe("token");
  });
});

describe("catalog categories (generic, data-driven)", () => {
  it("every catalog component has a non-empty category", () => {
    for (const c of stellarComponents) {
      expect(typeof c.category).toBe("string");
      expect(c.category.length).toBeGreaterThan(0);
    }
  });

  it("derives the category list from the catalog, with All first", () => {
    expect(componentCategories[0]).toBe("All");
    const derived = componentCategories.slice(1);
    const catalogCats = [
      ...new Set(stellarComponents.map((c) => c.category)),
    ];
    expect(new Set(derived)).toEqual(new Set(catalogCats));
    for (const cat of derived) {
      expect(stellarComponents.some((c) => c.category === cat)).toBe(true);
    }
  });

  it("orders categories by the lowest displayOrder among their members", () => {
    expect(componentCategories).toEqual(["All", "Tokens", "Payments", "Security"]);
  });

  it("requires no separate hardcoded category list", () => {
    const catalogCats = new Set(stellarComponents.map((c) => c.category));
    for (const cat of catalogCats) {
      expect(componentCategories).toContain(cat);
    }
  });
});
