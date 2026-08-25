import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import { generateRustIntegration } from "@/lib/integration/generators";

describe("Escrow integration generator (generic machinery)", () => {
  const escrow = getComponentBySlug("escrow")!;
  const configValues = getConfigDefaults(escrow);

  it("produces a Rust integration example derived from metadata", () => {
    const code = generateRustIntegration({ component: escrow, configValues });
    expect(code).not.toBeNull();
    const output = code as string;
    expect(output).toContain("EscrowClient");
    expect(output).toContain("fn integration_example");
    expect(output).not.toContain("TokenClient");
  });

  it("resolves the asset dependency alias inside the constructor", () => {
    const output = generateRustIntegration({
      component: escrow,
      configValues,
    }) as string;
    // The constructor's `asset` parameter must reference the provisioned
    // dependency address, not a hardcoded admin identity.
    expect(output).toContain("&asset_address");
    expect(output).toContain("alias: asset");
  });

  it("represents the methods with first-address authorization", () => {
    const output = generateRustIntegration({
      component: escrow,
      configValues,
    }) as string;
    expect(output).toContain("deposit(");
    expect(output).toContain("release(");
    expect(output).toContain("refund(");
    expect(output).toContain("requires authorization from arbiter");
  });
});
