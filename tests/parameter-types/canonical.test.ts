import { describe, expect, it } from "vitest";
import {
  SUPPORTED_PARAMETER_TYPES,
  isSupportedParameterType,
  validateParameterValue,
} from "@/lib/transactions/parameter-types";
import {
  argKindForType,
  validateCall,
  validateConstructor,
} from "@/app/api/playground/route";
import type { FunctionSpec } from "@/data/components";

const SUPPORTED = [
  "Address",
  "MuxedAddress",
  "i128",
  "u32",
  "String",
  "Symbol",
  "bool",
  "u64",
  "i64",
  "Timepoint",
  "Duration",
  "Bytes",
] as const;

// Types that must still be rejected: out-of-scope scalars plus malformed
// composite grammar (a bare `Vec`/`Map`/`Option` with no element type).
const UNSUPPORTED = [
  "u128",
  "i256",
  "number",
  "address",
  "",
  "Vec",
  "Map",
  "Option",
] as const;

describe("canonical parameter-type registry", () => {
  it("declares the supported input types", () => {
    expect([...SUPPORTED_PARAMETER_TYPES]).toEqual([...SUPPORTED]);
  });

  it("recognizes every supported type", () => {
    for (const type of SUPPORTED) {
      expect(isSupportedParameterType(type)).toBe(true);
    }
  });

  it("rejects representative unsupported types", () => {
    for (const type of UNSUPPORTED) {
      expect(isSupportedParameterType(type)).toBe(false);
    }
  });

  it("supports nested composite grammar", () => {
    expect(isSupportedParameterType("Vec<Address>")).toBe(true);
    expect(isSupportedParameterType("Map<Symbol, i128>")).toBe(true);
    expect(isSupportedParameterType("Option<Address>")).toBe(true);
    expect(isSupportedParameterType("Vec<Vec<u32>>")).toBe(true);
  });
});

describe("Playground API consumes the canonical registry", () => {
  it("recognizes every canonical supported type", () => {
    for (const type of SUPPORTED) {
      expect(argKindForType(type)).not.toBeNull();
    }
  });

  it("recognizes composite types", () => {
    expect(argKindForType("Vec<Address>")).not.toBeNull();
    expect(argKindForType("Map<Symbol, i128>")).not.toBeNull();
    expect(argKindForType("Option<Address>")).not.toBeNull();
  });

  it("rejects every unsupported type via the canonical gate", () => {
    for (const type of UNSUPPORTED) {
      expect(argKindForType(type)).toBeNull();
    }
  });

  it("accepts a supported constructor parameter unchanged", () => {
    const result = validateConstructor(
      { to: "admin" },
      [{ name: "to", type: "Address" }],
      new Set(["admin"]),
    );
    expect("value" in result).toBe(true);
  });

  it("returns the existing unsupported-type error for a bad constructor param", () => {
    const result = validateConstructor(
      { enabled: "true" },
      [{ name: "enabled", type: "u128" }],
      new Set(),
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.kind).toBe("input");
      expect(result.error.message).toContain("unsupported type u128");
    }
  });

  it("returns the existing unsupported-type error for a bad call argument", () => {
    const spec: FunctionSpec = {
      name: "demo",
      params: [{ name: "data", type: "i256" }],
    };
    const result = validateCall(
      { fn: "demo", args: ["anything"] },
      new Map([["demo", spec]]),
      new Set(),
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.kind).toBe("input");
      expect(result.error.message).toContain("unsupported type i256");
    }
  });
});

describe("numeric range validation", () => {
  it("accepts i64 values within the signed 64-bit range", () => {
    expect(validateParameterValue("i64", "0")).toBe(true);
    expect(validateParameterValue("i64", "9223372036854775807")).toBe(true);
    expect(validateParameterValue("i64", "-9223372036854775808")).toBe(true);
  });

  it("rejects i64 values outside the signed 64-bit range", () => {
    expect(validateParameterValue("i64", "9223372036854775808")).toBe(false);
    expect(validateParameterValue("i64", "-9223372036854775809")).toBe(false);
    expect(validateParameterValue("i64", "abc")).toBe(false);
    expect(validateParameterValue("i64", "1.5")).toBe(false);
  });

  it("rejects empty i64 values", () => {
    expect(validateParameterValue("i64", "")).toBe(false);
  });
});

describe("Playground/Transaction supported-set invariant", () => {
  it("Playground supported(type) === Transaction supported(type)", () => {
    const samples = [...SUPPORTED, ...UNSUPPORTED, "", "number", "address"];
    for (const type of samples) {
      expect(argKindForType(type) !== null).toBe(
        isSupportedParameterType(type),
      );
    }
  });
});
