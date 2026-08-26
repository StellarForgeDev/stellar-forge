import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import { generateRustIntegration } from "@/lib/integration/generators";

describe("Multi-signature integration generator (generic machinery)", () => {
  const multiSig = getComponentBySlug("multi-signature")!;
  const configValues = getConfigDefaults(multiSig);

  it("produces a Rust integration example derived from metadata", () => {
    const code = generateRustIntegration({
      component: multiSig,
      configValues,
    });
    expect(code).not.toBeNull();
    const output = code as string;
    expect(output).toContain("MultiSignatureClient");
    expect(output).toContain("fn integration_example");
    expect(output).toContain("approve");
    expect(output).toContain("execute");
    expect(output).toContain("is_approved");
  });

  it("derives the client name from the package, not a hardcoded name", () => {
    const output = generateRustIntegration({
      component: multiSig,
      configValues,
    }) as string;
    expect(output).toContain("use multi_signature::MultiSignatureClient;");
    expect(output).not.toContain("TokenClient");
  });

  it("handles the novel Address signer params generically", () => {
    const output = generateRustIntegration({
      component: multiSig,
      configValues,
    }) as string;
    // Each Address constructor param is resolved to admin.clone() by the
    // generic generator (no component-specific map).
    expect(output).toContain("admin.clone()");
    // Symbol import is present because the proposal_id parameter is a Symbol.
    expect(output).toContain("Symbol");
    expect(output).toContain('Symbol::new(env, "value")');
  });

  it("uses catalog constructorArgs for the numeric threshold", () => {
    const output = generateRustIntegration({
      component: multiSig,
      configValues,
    }) as string;
    // threshold is a u32 constructor param sourced from catalog constructorArgs.
    expect(output).toContain("2_u32");
    expect(output).not.toContain("configure me");
  });
});
