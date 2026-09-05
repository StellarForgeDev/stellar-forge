import { describe, expect, it } from "vitest";
import { getScenario } from "@/lib/playground/scenarios";
import { createOracleSignatureFixture, resolveScenarioFixtureReference, validateScenarioFixtures } from "@/lib/playground/scenario-fixtures";
import { validateScenario } from "@/lib/playground/scenario-validation";
import { getComponentBySlug } from "@/data/components";

describe("guided Playground Oracle signature fixtures", () => {
  it("generates the same Ed25519 key and signature for the same inputs", () => {
    const input = { id: "oracle", signer: "user1", price: 125, timestamp: 100 };
    const first = createOracleSignatureFixture(input);
    const second = createOracleSignatureFixture(input);
    expect(first).toEqual(second);
    expect(first.publicKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(first.message).toMatch(/^0x[0-9a-f]{50}$/);
    expect(first.signature).toMatch(/^0x[0-9a-f]{128}$/);
    expect(createOracleSignatureFixture({ ...input, price: 126 }).signature).not.toBe(first.signature);
  });

  it("registers and validates the signed Oracle workflow", () => {
    const scenario = getScenario("oracle", "oracle.publish-signed-price")!;
    expect(validateScenario(scenario)).toEqual([]);
    expect(scenario.fixtures?.constructorValues?.signer).toBe(scenario.fixtures?.oracle?.[0].publicKey);
    expect(resolveScenarioFixtureReference("test-oracle.signature", scenario.fixtures)).toEqual({ ok: true, value: scenario.fixtures?.oracle?.[0].signature });
  });

  it("rejects invalid signature fixture metadata", () => {
    const scenario = getScenario("oracle", "oracle.publish-signed-price")!;
    const invalid = { ...scenario, fixtures: { ...scenario.fixtures, oracle: [{ ...scenario.fixtures!.oracle![0], signer: "admin", signature: "0x00" }] } };
    const issues = validateScenarioFixtures(invalid, getComponentBySlug("oracle")!);
    expect(issues.some((issue) => issue.includes("signature must be 64 bytes"))).toBe(true);
  });
});
