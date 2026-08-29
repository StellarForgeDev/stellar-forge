// Shared Soroban parameter-type vocabulary.
//
// This module is the single source of truth for which parameter/return types
// Stellar-Forge understands across every layer: the catalog, the transaction
// pipeline, the Playground API, the sandbox-runner, and the integration
// generators. Adding a new type means extending the parser/validator/describer
// here AND the consumer in each layer — never a component-specific branch.

export type BaseParameterType =
  | "Address"
  | "MuxedAddress"
  | "i128"
  | "u32"
  | "String"
  | "Symbol"
  | "bool"
  | "u64"
  | "i64"
  | "Timepoint"
  | "Duration"
  | "Bytes";

// Composite types are expressed as a string grammar so they can live directly
// in catalog metadata (e.g. "Vec<Address>", "Map<Symbol, i128>", "Option<Address>").
export type ParameterType =
  | BaseParameterType
  | { kind: "Vec"; item: ParameterType }
  | { kind: "Map"; key: ParameterType; value: ParameterType }
  | { kind: "Option"; item: ParameterType };

export const SUPPORTED_PARAMETER_TYPES = [
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

export type SupportedParameterType = (typeof SUPPORTED_PARAMETER_TYPES)[number];

const I128_MIN = -(BigInt(2) ** BigInt(127));
const I128_MAX = BigInt(2) ** BigInt(127) - BigInt(1);
const U32_MAX = BigInt("4294967295");
const U64_MAX = BigInt(2) ** BigInt(64) - BigInt(1);
const I64_MIN = -(BigInt(2) ** BigInt(63));
const I64_MAX = BigInt(2) ** BigInt(63) - BigInt(1);

const SIGNED_INT = /^-?\d+$/;
const UNSIGNED_INT = /^\d+$/;
const HEX_STRING = /^(0x)?[0-9a-fA-F]*$/;

// Parses a catalog type string into a structured ParameterType, or null if the
// type (or any of its element types) is unsupported. Supports nested composites.
export function parseParameterType(input: string): ParameterType | null {
  const type = input.trim();

  const vec = /^Vec<(.+)>$/.exec(type);
  if (vec) {
    const item = parseParameterType(vec[1]);
    return item ? { kind: "Vec", item } : null;
  }

  const opt = /^Option<(.+)>$/.exec(type);
  if (opt) {
    const item = parseParameterType(opt[1]);
    return item ? { kind: "Option", item } : null;
  }

  const map = /^Map<(.+),\s*(.+)>$/.exec(type);
  if (map) {
    const key = parseParameterType(map[1]);
    const value = parseParameterType(map[2]);
    return key && value ? { kind: "Map", key, value } : null;
  }

  return (SUPPORTED_PARAMETER_TYPES as readonly string[]).includes(type)
    ? (type as BaseParameterType)
    : null;
}

export function isSupportedParameterType(type: string): boolean {
  return parseParameterType(type) !== null;
}

// Validates a raw user-supplied value (string) for a declared type without
// identity knowledge (addresses are checked as G/C/M strkeys). Used by the
// transaction validation layer.
export function validateParameterValue(type: string, rawValue: string): boolean {
  const parsed = parseParameterType(type);
  if (!parsed) return false;
  const value = rawValue.trim();
  if (value.length === 0) return false;
  return validateAST(parsed, value);
}

function validateAST(t: ParameterType, raw: string): boolean {
  if (typeof t === "string") {
    switch (t) {
      case "Address":
      case "MuxedAddress":
        return (
          raw.startsWith("G") || raw.startsWith("M") || raw.startsWith("C")
        );
      case "i128":
        return (
          SIGNED_INT.test(raw) &&
          (() => {
            try {
              const n = BigInt(raw);
              return n >= I128_MIN && n <= I128_MAX;
            } catch {
              return false;
            }
          })()
        );
      case "u32":
        return (
          UNSIGNED_INT.test(raw) &&
          (() => {
            try {
              return BigInt(raw) <= U32_MAX;
            } catch {
              return false;
            }
          })()
        );
      case "u64":
      case "Timepoint":
      case "Duration":
        return (
          UNSIGNED_INT.test(raw) &&
          (() => {
            try {
              return BigInt(raw) <= U64_MAX;
            } catch {
              return false;
            }
          })()
        );
      case "i64":
        return (
          SIGNED_INT.test(raw) &&
          (() => {
            try {
              const n = BigInt(raw);
              return n >= I64_MIN && n <= I64_MAX;
            } catch {
              return false;
            }
          })()
        );
      case "bool":
        return raw === "true" || raw === "false";
      case "String":
      case "Symbol":
        return raw.length > 0;
      case "Bytes":
        return HEX_STRING.test(raw);
    }
  }

  switch (t.kind) {
    case "Vec": {
      try {
        const arr = JSON.parse(raw);
        return (
          Array.isArray(arr) &&
          arr.every((el) =>
            validateAST(t.item, typeof el === "string" ? el : JSON.stringify(el)),
          )
        );
      } catch {
        return false;
      }
    }
    case "Map": {
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return false;
        return arr.every(
          (p) =>
            p &&
            typeof p === "object" &&
            "key" in p &&
            "value" in p &&
            validateAST(t.key, String(p.key)) &&
            validateAST(t.value, String(p.value)),
        );
      } catch {
        return false;
      }
    }
    case "Option": {
      if (raw === "null") return true;
      try {
        JSON.parse(raw);
      } catch {
        return false;
      }
      return validateAST(t.item, raw);
    }
  }
}

export function describeParameterType(type: string): string {
  const parsed = parseParameterType(type);
  if (!parsed) return `unknown type (${type})`;
  return describeAST(parsed);
}

function describeAST(t: ParameterType): string {
  if (typeof t === "string") {
    switch (t) {
      case "Address":
        return "a Stellar address (G/C strkey or identity name)";
      case "MuxedAddress":
        return "a Stellar muxed address (M strkey or identity name)";
      case "i128":
        return "an integer between -2^127 and 2^127-1";
      case "u32":
        return "an unsigned 32-bit integer (0-4294967295)";
      case "u64":
        return "an unsigned 64-bit integer";
      case "i64":
        return "a signed 64-bit integer";
      case "Timepoint":
        return "a Timepoint (ledger timestamp, u64)";
      case "Duration":
        return "a Duration (seconds, u64)";
      case "bool":
        return "a boolean (true/false)";
      case "Bytes":
        return "hex-encoded bytes";
      case "String":
        return "a string";
      case "Symbol":
        return "a Symbol (short uppercase string)";
    }
  }
  switch (t.kind) {
    case "Vec":
      return `a Vec of ${describeAST(t.item)}`;
    case "Map":
      return `a Map from ${describeAST(t.key)} to ${describeAST(t.value)}`;
    case "Option":
      return `an Option of ${describeAST(t.item)}`;
  }
}
