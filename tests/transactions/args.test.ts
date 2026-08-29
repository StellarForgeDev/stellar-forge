import { describe, expect, it } from "vitest";
import { buildInvocationArgs } from "@/lib/transactions/args";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";

const validAddress = Keypair.random().publicKey();

describe("buildInvocationArgs", () => {
  it("converts every supported parameter type to an ScVal", () => {
    const result = buildInvocationArgs(
      [
        { name: "to", type: "Address" },
        { name: "amount", type: "i128" },
        { name: "fee", type: "u32" },
        { name: "label", type: "String" },
        { name: "ticker", type: "Symbol" },
      ],
      {
        to: validAddress,
        amount: "1000",
        fee: "200",
        label: "hello",
        ticker: "FORGE",
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scVals).toHaveLength(5);
  });

  it("wraps a G-address into a muxed ScVal", () => {
    const result = buildInvocationArgs(
      [{ name: "to", type: "MuxedAddress" }],
      { to: validAddress },
    );
    expect(result.ok).toBe(true);
  });

  it("converts negative i128 values", () => {
    const result = buildInvocationArgs(
      [{ name: "amount", type: "i128" }],
      { amount: "-5" },
    );
    expect(result.ok).toBe(true);
  });

  it("propagates the first conversion error", () => {
    const result = buildInvocationArgs(
      [
        { name: "to", type: "Address" },
        { name: "amount", type: "i128" },
      ],
      { to: "not-an-address", amount: "100" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("parameter-invalid-value");
    }
  });

  it("rejects a non-integer i128 value", () => {
    const result = buildInvocationArgs(
      [{ name: "amount", type: "i128" }],
      { amount: "abc" },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported parameter type", () => {
    const result = buildInvocationArgs(
      [{ name: "data", type: "Blob" }],
      { data: "x" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("parameter-unsupported-type");
    }
  });
});

// Soroban `Option<T>` is encoded as `void` for `None` and the bare inner ScVal
// for `Some` (see soroban-env-common `option.rs`); there is no `scvOption`
// arm in the SDK. These tests pin that contract so a future SDK/encoder change
// cannot silently regress the wire format.
describe("buildInvocationArgs encodes Option<T> for Soroban", () => {
  it("encodes Option<i64> None as scvVoid", () => {
    const result = buildInvocationArgs(
      [{ name: "expiry", type: "Option<i64>" }],
      { expiry: "null" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scVals[0].switch().name).toBe("scvVoid");
    // Parity with the SDK's own encoder.
    expect(result.scVals[0].toXDR().toString("base64")).toBe(
      nativeToScVal(null, { type: "i64" }).toXDR().toString("base64"),
    );
  });

  it("encodes Option<i64> Some as the bare inner ScVal (not wrapped)", () => {
    const result = buildInvocationArgs(
      [{ name: "expiry", type: "Option<i64>" }],
      { expiry: "42" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = xdr.ScVal.scvI64(xdr.Int64.fromString("42"));
    expect(result.scVals[0].toXDR().toString("base64")).toBe(
      expected.toXDR().toString("base64"),
    );
  });

  it("encodes Option<Address> Some as the bare inner ScVal", () => {
    const result = buildInvocationArgs(
      [{ name: "beneficiary", type: "Option<Address>" }],
      { beneficiary: validAddress },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = new Address(validAddress).toScVal();
    expect(result.scVals[0].toXDR().toString("base64")).toBe(
      expected.toXDR().toString("base64"),
    );
  });

  it("rejects an out-of-range value inside Option<i64>", () => {
    const result = buildInvocationArgs(
      [{ name: "expiry", type: "Option<i64>" }],
      { expiry: "9223372036854775808" },
    );
    expect(result.ok).toBe(false);
  });
});
