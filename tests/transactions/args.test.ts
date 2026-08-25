import { describe, expect, it } from "vitest";
import { buildInvocationArgs } from "@/lib/transactions/args";
import { Keypair } from "@stellar/stellar-sdk";

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
