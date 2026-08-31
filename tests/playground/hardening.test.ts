import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  tryAcquirePlaygroundExecution,
  validateCall,
  validateIdentities,
} from "@/app/api/playground/route";
import type { FunctionSpec } from "@/data/components";

describe("Playground hardening", () => {
  it("accepts valid identities and rejects checksum-invalid strkeys", () => {
    const publicKey = Keypair.random().publicKey();
    expect(validateIdentities({ user: publicKey })).toEqual({
      value: { user: publicKey },
    });
    expect("error" in validateIdentities({ user: `${publicKey.slice(0, -1)}A` })).toBe(
      true,
    );
  });

  it("rejects unsafe u64 and i64 number values before they reach Rust", () => {
    const u64: FunctionSpec = {
      name: "u64_call",
      params: [{ name: "value", type: "u64" }],
    };
    const i64: FunctionSpec = {
      name: "i64_call",
      params: [{ name: "value", type: "i64" }],
    };
    const functions = new Map([
      [u64.name, u64],
      [i64.name, i64],
    ]);

    expect("value" in validateCall({ fn: u64.name, args: [Number.MAX_SAFE_INTEGER] }, functions, new Set())).toBe(true);
    expect("error" in validateCall({ fn: u64.name, args: [Number.MAX_SAFE_INTEGER + 1] }, functions, new Set())).toBe(true);
    expect("error" in validateCall({ fn: u64.name, args: [Infinity] }, functions, new Set())).toBe(true);
    expect("value" in validateCall({ fn: i64.name, args: ["-9223372036854775808"] }, functions, new Set())).toBe(true);
    expect("error" in validateCall({ fn: i64.name, args: ["9223372036854775808"] }, functions, new Set())).toBe(true);
  });

  it("admits only the configured number of executions per process", () => {
    const releases = [
      tryAcquirePlaygroundExecution(),
      tryAcquirePlaygroundExecution(),
    ];
    expect(releases[0]).not.toBeNull();
    expect(releases[1]).not.toBeNull();
    expect(tryAcquirePlaygroundExecution()).toBeNull();
    releases.forEach((release) => release?.());
    const finalRelease = tryAcquirePlaygroundExecution();
    expect(finalRelease).not.toBeNull();
    // Release the final slot so this test cannot affect another test.
    finalRelease?.();
  });
});
