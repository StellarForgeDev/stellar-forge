import { describe, expect, it } from "vitest";
import {
  SUPPORTED_PARAMETER_TYPES,
  isSupportedParameterType,
} from "@/lib/transactions/parameter-types";
import {
  argKindForType,
  validateConstructor,
  validateCall,
} from "@/app/api/playground/route";
import type { FunctionSpec } from "@/data/components";

const SUPPORTED = [
  "Address",
  "MuxedAddress",
  "i128",
  "u32",
  "String",
  "Symbol",
] as const;

const UNSUPPORTED = ["bool", "u64", "i64", "u128", "Bytes", "Vec", "Map"];

describe("canonical parameter-type registry", () => {
  it("declares exactly the six supported input types", () => {
    expect([...SUPPORTED_PARAMETER_TYPES]).toEqual([...SUPPORTED]);
  });

  it("recognizes all six supported types", () => {
    for (const type of SUPPORTED) {
      expect(isSupportedParameterType(type)).toBe(true);
    }
  });

  it("rejects representative unsupported types", () => {
    for (const type of UNSUPPORTED) {
      expect(isSupportedParameterType(type)).toBe(false);
    }
  });
});

describe("Playground API consumes the canonical registry", () => {
  it("recognizes every canonical supported type", () => {
    for (const type of SUPPORTED) {
      expect(argKindForType(type)).not.toBeNull();
    }
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
      [{ name: "enabled", type: "bool" }],
      new Set(),
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.kind).toBe("input");
      expect(result.error.message).toContain("unsupported type bool");
    }
  });

  it("returns the existing unsupported-type error for a bad call argument", () => {
    const spec: FunctionSpec = {
      name: "demo",
      params: [{ name: "data", type: "bytes" }],
    };
    const result = validateCall(
      { fn: "demo", args: ["anything"] },
      new Map([["demo", spec]]),
      new Set(),
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.kind).toBe("input");
      expect(result.error.message).toContain("unsupported type bytes");
    }
  });
});

describe("Playground/Transaction supported-set invariant", () => {
  it("Playground supported(type) === Transaction supported(type)", () => {
    const samples = [...SUPPORTED, ...UNSUPPORTED, "", "number", "address"];
    for (const type of samples) {
      expect(argKindForType(type) !== null).toBe(isSupportedParameterType(type));
    }
  });
});
