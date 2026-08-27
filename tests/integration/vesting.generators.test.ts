import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import { generateRustIntegration } from "@/lib/integration/generators";

describe("Vesting integration generator (generic machinery)", () => {
  const vesting = getComponentBySlug("vesting")!;
  const configValues = getConfigDefaults(vesting);

  it("produces a Rust integration example derived from metadata", () => {
    const code = generateRustIntegration({ component: vesting, configValues });
    expect(code).not.toBeNull();
    const output = code as string;
    expect(output).toContain("VestingClient");
    expect(output).toContain("fn integration_example");
    expect(output).toContain("deposit");
    expect(output).toContain("claim");
    expect(output).toContain("claimable");
    expect(output).toContain("released");
  });

  it("derives the client name from the package, not a hardcoded name", () => {
    const output = generateRustIntegration({
      component: vesting,
      configValues,
    }) as string;
    expect(output).toContain("use vesting::VestingClient;");
    expect(output).not.toContain("TokenClient");
    expect(output).not.toContain("MultiSignatureClient");
  });

  it("handles the asset dependency and Address/total/time params generically", () => {
    const output = generateRustIntegration({
      component: vesting,
      configValues,
    }) as string;
    // The asset dependency alias resolves to a provisioned address.
    expect(output).toContain("&asset_address");
    // Each non-alias Address constructor param resolves to admin.clone().
    expect(output).toContain("admin.clone()");
    // Numeric constructor params are resolved from the component's catalog
    // constructorArgs (total -> 1000000, start -> 0, duration -> 86400,
    // cliff -> 3600) rather than a Vesting-specific branch, so the generated
    // Rust is compilable.
    expect(output).toContain("1000000_i128");
    expect(output).toContain("0_u32");
    expect(output).toContain("86400_u32");
    expect(output).toContain("3600_u32");
    expect(output).not.toContain("configure me");
    expect(output).not.toContain("MultiSignatureClient");
  });
});
