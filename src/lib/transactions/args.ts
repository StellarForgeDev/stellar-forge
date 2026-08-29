import { Account, Address, MuxedAccount, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { ParameterSpec } from "@/data/components";
import {
  parseParameterType,
  type BaseParameterType,
  type ParameterType,
} from "@/lib/transactions/parameter-types";
import type { TransactionPreparationError } from "@/lib/transactions/types";

export type InvocationArgsResult =
  | { ok: true; scVals: xdr.ScVal[] }
  | { ok: false; error: TransactionPreparationError };

export function buildInvocationArgs(
  params: ParameterSpec[],
  values: Record<string, string>,
): InvocationArgsResult {
  const scVals: xdr.ScVal[] = [];

  for (const param of params) {
    const converted = toScVal(param.type, values[param.name] ?? "");
    if (!converted.ok) return { ok: false, error: converted.error };
    scVals.push(converted.scVal);
  }

  return { ok: true, scVals };
}

function toScVal(
  type: string,
  raw: string,
): { ok: true; scVal: xdr.ScVal } | { ok: false; error: TransactionPreparationError } {
  const parsed = parseParameterType(type);
  if (!parsed) {
    return {
      ok: false,
      error: {
        code: "parameter-unsupported-type",
        message: `Unsupported Soroban parameter type: ${type}.`,
      },
    };
  }
  return convertAST(parsed, raw);
}

function convertAST(
  t: ParameterType,
  raw: string,
): { ok: true; scVal: xdr.ScVal } | { ok: false; error: TransactionPreparationError } {
  if (typeof t === "string") {
    return convertBase(t, raw);
  }
  switch (t.kind) {
    case "Vec":
      return convertVec(t, raw);
    case "Map":
      return convertMap(t, raw);
    case "Option":
      return convertOption(t, raw);
  }
}

function convertBase(
  type: BaseParameterType,
  raw: string,
): { ok: true; scVal: xdr.ScVal } | { ok: false; error: TransactionPreparationError } {
  switch (type) {
    case "Address":
      try {
        return { ok: true, scVal: new Address(raw).toScVal() };
      } catch {
        return invalid(`"${raw}" is not a valid Stellar address.`);
      }
    case "MuxedAddress":
      try {
        const muxedStrkey = raw.startsWith("M")
          ? raw
          : new MuxedAccount(new Account(raw, "0"), "0").accountId();
        return { ok: true, scVal: new Address(muxedStrkey).toScVal() };
      } catch {
        return invalid(`"${raw}" is not a valid Stellar address.`);
      }
    case "i128":
      try {
        return { ok: true, scVal: nativeToScVal(BigInt(raw), { type: "i128" }) };
      } catch {
        return invalid(`"${raw}" is not a valid i128 integer.`);
      }
    case "u32":
      try {
        return {
          ok: true,
          scVal: nativeToScVal(Number(raw), { type: "u32" }),
        };
      } catch {
        return invalid(`"${raw}" is not a valid u32 integer.`);
      }
    case "bool":
      if (raw === "true" || raw === "false") {
        return { ok: true, scVal: xdr.ScVal.scvBool(raw === "true") };
      }
      return invalid(`"${raw}" is not a valid boolean (expected true/false).`);
    case "u64":
      try {
        return {
          ok: true,
          scVal: xdr.ScVal.scvU64(xdr.Uint64.fromString(raw)),
        };
      } catch {
        return invalid(`"${raw}" is not a valid u64 integer.`);
      }
    case "i64":
      try {
        return {
          ok: true,
          scVal: xdr.ScVal.scvI64(xdr.Int64.fromString(raw)),
        };
      } catch {
        return invalid(`"${raw}" is not a valid i64 integer.`);
      }
    case "Timepoint":
      try {
        return {
          ok: true,
          scVal: xdr.ScVal.scvTimepoint(xdr.Uint64.fromString(raw)),
        };
      } catch {
        return invalid(`"${raw}" is not a valid Timepoint.`);
      }
    case "Duration":
      try {
        return {
          ok: true,
          scVal: xdr.ScVal.scvDuration(xdr.Uint64.fromString(raw)),
        };
      } catch {
        return invalid(`"${raw}" is not a valid Duration.`);
      }
    case "Bytes":
      try {
        return {
          ok: true,
          scVal: xdr.ScVal.scvBytes(
            Buffer.from(raw.replace(/^0x/, ""), "hex"),
          ),
        };
      } catch {
        return invalid(`"${raw}" is not valid hex-encoded bytes.`);
      }
    case "String":
      return { ok: true, scVal: nativeToScVal(raw) };
    case "Symbol":
      return { ok: true, scVal: xdr.ScVal.scvSymbol(raw) };
  }
}

function convertVec(
  t: Extract<ParameterType, { kind: "Vec" }>,
  raw: string,
): { ok: true; scVal: xdr.ScVal } | { ok: false; error: TransactionPreparationError } {
  let arr: unknown[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return invalid("expected a JSON array for Vec.");
    arr = parsed;
  } catch {
    return invalid("expected a JSON array for Vec.");
  }
  const items: xdr.ScVal[] = [];
  for (const el of arr) {
    const r = convertAST(
      t.item,
      typeof el === "string" ? el : JSON.stringify(el),
    );
    if (!r.ok) return r;
    items.push(r.scVal);
  }
  return { ok: true, scVal: xdr.ScVal.scvVec(items) };
}

function convertMap(
  t: Extract<ParameterType, { kind: "Map" }>,
  raw: string,
): { ok: true; scVal: xdr.ScVal } | { ok: false; error: TransactionPreparationError } {
  let arr: { key: unknown; value: unknown }[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return invalid("expected a JSON array of {key,value} for Map.");
    arr = parsed;
  } catch {
    return invalid("expected a JSON array of {key,value} for Map.");
  }
  const entries: xdr.ScMapEntry[] = [];
  for (const p of arr) {
    if (
      p === null ||
      typeof p !== "object" ||
      !("key" in p) ||
      !("value" in p)
    ) {
      return invalid("each Map entry requires a key and value.");
    }
    const k = convertAST(
      t.key,
      typeof p.key === "string" ? p.key : JSON.stringify(p.key),
    );
    if (!k.ok) return k;
    const v = convertAST(
      t.value,
      typeof p.value === "string" ? p.value : JSON.stringify(p.value),
    );
    if (!v.ok) return v;
    entries.push(new xdr.ScMapEntry({ key: k.scVal, val: v.scVal }));
  }
  return { ok: true, scVal: xdr.ScVal.scvMap(entries) };
}

function convertOption(
  t: Extract<ParameterType, { kind: "Option" }>,
  raw: string,
): { ok: true; scVal: xdr.ScVal } | { ok: false; error: TransactionPreparationError } {
  if (raw.trim() === "null") {
    return { ok: true, scVal: xdr.ScVal.scvVoid() };
  }
  const r = convertAST(t.item, raw);
  if (!r.ok) return r;
  return { ok: true, scVal: r.scVal };
}

function invalid(
  message: string,
): { ok: false; error: TransactionPreparationError } {
  return {
    ok: false,
    error: { code: "parameter-invalid-value", message },
  };
}
