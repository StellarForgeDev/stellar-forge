import { describe, expect, it } from "vitest";
import { validateVerificationRegistry } from "@/lib/verification/artifact-verification";
import type { ContractDeployment } from "@/lib/transactions/deployments";
import type { StellarComponent } from "@/data/components";

const component = {
  slug: "token",
  capabilities: { testnet: true },
  implementation: { language: "rust", package: "token", sourcePath: "x", buildTarget: "wasm32v1-none" },
} as StellarComponent;
const deployment: ContractDeployment = { network: "testnet", componentSlug: "token", address: "C" };

describe("verification registry validation", () => {
  it("accounts for a complete component mapping", () => {
    expect(validateVerificationRegistry([component], [deployment], new Set(["token.wasm"]))).toEqual({
      expectedCount: 1, accountedCount: 1, errors: [],
    });
  });

  it("reports missing mappings and Testnet addresses", () => {
    const incomplete = { slug: "missing", capabilities: { testnet: true } } as StellarComponent;
    const result = validateVerificationRegistry([incomplete], [], new Set());
    expect(result.errors).toEqual([
      "missing: missing Cargo package mapping",
      "missing: missing local artifact mapping",
      "missing: missing Testnet deployment registry entry",
    ]);
  });

  it("reports duplicate deployment registry entries", () => {
    const result = validateVerificationRegistry([component], [deployment, deployment], new Set(["token.wasm"]));
    expect(result.errors).toContain("token: duplicate Testnet deployment registry entries");
  });
});
