import { describe, expect, it } from "vitest";
import {
  getComponentBySlug,
  getConfigDefaults,
  stellarComponents,
  type StellarComponent,
} from "@/data/components";
import {
  generateIntegrationCode,
  generateRustIntegration,
  generateTypescriptIntegration,
} from "@/lib/integration/generators";
import { buildInvocationArgs } from "@/lib/transactions/args";
import {
  isSupportedParameterType,
  parseParameterType,
  SUPPORTED_PARAMETER_TYPES,
  validateParameterValue,
} from "@/lib/transactions/parameter-types";
import type { ParameterSpec } from "@/data/components";

// A valid zero-account G-strkey used to exercise Address/MuxedAddress conversion.
const VALID_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

// A synthetic component exercising the FULL parameter vocabulary plus multiple
// dependencies, a dependency alias referenced from the constructor (ordering
// critical), and composite types. This is the generic-registry stress test:
// if any type or dependency shape regresses, this single component catches it
// without any component-specific branching.
const ALL_TYPES_COMPONENT: StellarComponent = {
  slug: "generic-demo",
  name: "Generic Demo",
  description: "synthetic component for generic registry tests",
  category: "Demo",
  displayOrder: 0,
  capabilities: { implemented: true, sandbox: true, testnet: true },
  shortDescription: "demo",
  overview: "demo",
  useCases: [],
  implementation: {
    language: "rust",
    package: "generic-demo",
    sourcePath: "contracts/generic-demo/src/lib.rs",
    buildTarget: "generic_demo",
  },
  interface: [
    {
      name: "__constructor",
      params: [
        { name: "admin", type: "Address" },
        { name: "flag", type: "bool" },
        { name: "qty", type: "u64" },
        { name: "delta", type: "i64" },
        { name: "tp", type: "Timepoint" },
        { name: "dur", type: "Duration" },
        { name: "blob", type: "Bytes" },
        { name: "tags", type: "Vec<Symbol>" },
        { name: "meta", type: "Map<Symbol, i128>" },
        { name: "maybe", type: "Option<u32>" },
        { name: "asset", type: "Address" },
      ],
    },
    {
      name: "do_thing",
      params: [
        { name: "from", type: "Address" },
        { name: "amount", type: "i128" },
        { name: "ledger", type: "u32" },
        { name: "name", type: "String" },
        { name: "sym", type: "Symbol" },
        { name: "active", type: "bool" },
        { name: "rate", type: "u64" },
        { name: "offset", type: "i64" },
        { name: "start", type: "Timepoint" },
        { name: "window", type: "Duration" },
        { name: "data", type: "Bytes" },
        { name: "amounts", type: "Vec<u32>" },
        { name: "prices", type: "Map<String, i128>" },
        { name: "cap", type: "Option<u64>" },
      ],
      returns: "bool",
      authorization: "admin",
    },
  ],
  config: [
    { key: "name", label: "Name", type: "text", default: "Demo" },
    {
      key: "network",
      label: "Network",
      type: "select",
      default: "testnet",
      options: [
        { label: "Testnet", value: "testnet" },
        { label: "Futurenet", value: "futurenet" },
      ],
    },
  ],
  dependencies: [
    { alias: "asset", package: "token", constructorArgs: { admin: "admin" } },
    { alias: "oracle", package: "token" },
  ],
  constructorArgs: {
    admin: "admin",
    flag: "true",
    qty: "10",
    delta: "-3",
    tp: "5",
    dur: "7",
    blob: "00",
    tags: "[]",
    meta: "[]",
    maybe: "null",
    asset: "asset",
  },
};

describe("generic registry: no fabrication", () => {
  it("never fabricates admin.clone() in constructor arguments", () => {
    // The deployer legitimately uses `admin.clone()` once
    // (`with_address(admin.clone(), ...)`). The fabrication bug was a
    // constructor argument defaulting to `admin.clone()`; that would push the
    // occurrence count above one. So assert exactly one occurrence.
    for (const component of stellarComponents) {
      if (!component.implementation || !component.interface?.length) continue;
      const code = generateRustIntegration({
        component,
        configValues: getConfigDefaults(component),
      })!;
      const occurrences = (code.match(/admin\.clone\(\)/g) ?? []).length;
      expect(
        occurrences,
        `${component.slug} must not fabricate admin in a constructor argument`,
      ).toBe(1);
    }
  });

  it("honors catalog constructorArgs (strkey/alias) instead of fabricating", () => {
    const code = generateRustIntegration({
      component: ALL_TYPES_COMPONENT,
      configValues: getConfigDefaults(ALL_TYPES_COMPONENT),
    })!;
    // `admin` resolves from catalog constructorArgs, not a fabricated clone.
    expect((code.match(/admin\.clone\(\)/g) ?? []).length).toBe(1);
    expect(code).toContain("&admin");
    // The dependency alias is referenced by its provisioned address.
    expect(code).toContain("&asset_address");
  });
});

describe("generic registry: dependency alias ordering", () => {
  it("declares dependency addresses before the deploy call", () => {
    const code = generateRustIntegration({
      component: ALL_TYPES_COMPONENT,
      configValues: getConfigDefaults(ALL_TYPES_COMPONENT),
    })!;
    const declareAsset = code.indexOf("let asset_address = Address::generate");
    const declareOracle = code.indexOf("let oracle_address = Address::generate");
    const deploy = code.indexOf("deploy_v2");
    expect(declareAsset).toBeGreaterThan(-1);
    expect(declareOracle).toBeGreaterThan(-1);
    expect(declareAsset).toBeLessThan(deploy);
    expect(declareOracle).toBeLessThan(deploy);
  });
});

describe("generic registry: every supported parameter type", () => {
  it("parses for every declared supported type", () => {
    for (const type of SUPPORTED_PARAMETER_TYPES) {
      expect(parseParameterType(type), type).not.toBeNull();
    }
  });

  it("generates Rust integration code covering every base + composite type", () => {
    const code = generateRustIntegration({
      component: ALL_TYPES_COMPONENT,
      configValues: getConfigDefaults(ALL_TYPES_COMPONENT),
    })!;
    // New scalar placeholders.
    expect(code).toContain("true"); // bool
    expect(code).toContain("10u64"); // u64
    expect(code).toContain("-3i64"); // i64
    expect(code).toContain("5u64"); // Timepoint
    expect(code).toContain("7u64"); // Duration
    expect(code).toContain("Bytes::from_slice"); // Bytes
    // Composite placeholders.
    expect(code).toContain("soroban_sdk::vec!"); // Vec
    expect(code).toContain("soroban_sdk::Map::new"); // Map
    expect(code).toContain("soroban_sdk::Option::Some"); // Option exercises the Some path
  });

  it("generates TypeScript integration code covering every base type", () => {
    const code = generateTypescriptIntegration({
      component: ALL_TYPES_COMPONENT,
      configValues: getConfigDefaults(ALL_TYPES_COMPONENT),
    })!;
    expect(code).toContain("nativeToScVal(true)"); // bool
    expect(code).toContain("nativeToScVal(1n)"); // u64/i64
    expect(code).toContain("nativeToScVal(0n)"); // Timepoint/Duration
    expect(code).not.toContain("admin.clone()");
  });

  it("routes both languages without throwing", () => {
    expect(
      generateIntegrationCode(
        { component: ALL_TYPES_COMPONENT, configValues: {} },
        "rust",
      ),
    ).not.toBeNull();
    expect(
      generateIntegrationCode(
        { component: ALL_TYPES_COMPONENT, configValues: {} },
        "typescript",
      ),
    ).not.toBeNull();
  });
});

describe("generic registry: args conversion end-to-end", () => {
  const params: ParameterSpec[] = [
    { name: "a", type: "Address" },
    { name: "m", type: "MuxedAddress" },
    { name: "i", type: "i128" },
    { name: "u", type: "u32" },
    { name: "b", type: "bool" },
    { name: "u6", type: "u64" },
    { name: "i6", type: "i64" },
    { name: "tp", type: "Timepoint" },
    { name: "du", type: "Duration" },
    { name: "by", type: "Bytes" },
    { name: "s", type: "String" },
    { name: "sy", type: "Symbol" },
    { name: "v", type: "Vec<Address>" },
    { name: "mp", type: "Map<Symbol, i128>" },
    { name: "op", type: "Option<u32>" },
  ];
  const values: Record<string, string> = {
    a: VALID_ADDRESS,
    m: VALID_ADDRESS,
    i: "1000000",
    u: "7",
    b: "true",
    u6: "10",
    i6: "-3",
    tp: "5",
    du: "7",
    by: "00",
    s: "hello",
    sy: "TAG",
    v: JSON.stringify([VALID_ADDRESS]),
    mp: JSON.stringify([{ key: "TAG", value: "5" }]),
    op: "null",
  };

  it("converts every supported parameter type to an ScVal", () => {
    const result = buildInvocationArgs(params, values);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scVals).toHaveLength(params.length);
    }
  });

  it("validates every supported parameter type", () => {
    for (const param of params) {
      expect(
        validateParameterValue(param.type, values[param.name]),
        `${param.name}:${param.type}`,
      ).toBe(true);
    }
  });

  it("rejects malformed values per type", () => {
    expect(validateParameterValue("i128", "not-a-number")).toBe(false);
    expect(validateParameterValue("u32", "-1")).toBe(false);
    expect(validateParameterValue("Address", "nope")).toBe(false);
    expect(validateParameterValue("bool", "maybe")).toBe(false);
    expect(validateParameterValue("Bytes", "zz")).toBe(false);
    expect(validateParameterValue("Vec<u32>", "[1, 2, 'x']")).toBe(false);
    expect(validateParameterValue("Option<u32>", "[]")).toBe(false);
  });
});

describe("generic registry: vocabulary completeness", () => {
  it("supports composite grammar nested arbitrarily", () => {
    expect(isSupportedParameterType("Vec<Vec<u32>>")).toBe(true);
    expect(isSupportedParameterType("Map<Symbol, Vec<i128>>")).toBe(true);
    expect(isSupportedParameterType("Option<Address>")).toBe(true);
    expect(isSupportedParameterType("Vec<")).toBe(false);
    expect(isSupportedParameterType("Map<Symbol>")).toBe(false);
  });

  it("every shipped component still generates without error", () => {
    for (const component of stellarComponents) {
      if (!component.implementation || !component.interface?.length) continue;
      const rust = generateRustIntegration({
        component,
        configValues: getConfigDefaults(component),
      });
      expect(rust, component.slug).not.toBeNull();
      const ts = generateIntegrationCode(
        { component, configValues: getConfigDefaults(component) },
        "typescript",
      );
      expect(ts, component.slug).not.toBeNull();
    }
  });

  it("Token's constructor no longer fabricates an admin address", () => {
    // Regression guard for the original fabrication bug: the token's
    // initial_admin used to emit `admin.clone()`.
    const token = getComponentBySlug("token")!;
    const code = generateRustIntegration({
      component: token,
      configValues: getConfigDefaults(token),
    })!;
    expect((code.match(/admin\.clone\(\)/g) ?? []).length).toBe(1);
    expect(code).toContain("&admin");
  });
});
