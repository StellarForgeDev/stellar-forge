import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import { generateRustIntegration } from "@/lib/integration/generators";

describe("Subscription integration generator (generic machinery)", () => {
  const subscription = getComponentBySlug("subscription")!;
  const configValues = getConfigDefaults(subscription);

  it("produces a Rust integration example derived from metadata", () => {
    const code = generateRustIntegration({ component: subscription, configValues });
    expect(code).not.toBeNull();
    const output = code as string;
    expect(output).toContain("SubscriptionClient");
    expect(output).toContain("fn integration_example");
    expect(output).toContain("charge");
    expect(output).toContain("cancel");
    expect(output).toContain("is_active");
  });

  it("derives the client name from the package, not a hardcoded name", () => {
    const output = generateRustIntegration({
      component: subscription,
      configValues,
    }) as string;
    expect(output).toContain("use subscription::SubscriptionClient;");
    expect(output).not.toContain("TokenClient");
    expect(output).not.toContain("MultiSignatureClient");
  });

  it("handles the asset dependency and Address/amount/interval params generically", () => {
    const output = generateRustIntegration({
      component: subscription,
      configValues,
    }) as string;
    // The asset dependency alias resolves to a provisioned address.
    expect(output).toContain("&asset_address");
    // Each non-alias Address constructor param resolves to admin.clone().
    expect(output).toContain("admin.clone()");
    // Numeric constructor params are resolved from the component's catalog
    // constructorArgs (amount -> 1000, interval -> 3600) rather than a
    // Subscription-specific branch, so the generated Rust is compilable.
    expect(output).toContain("1000_i128");
    expect(output).toContain("3600_u32");
    expect(output).not.toContain("configure me");
    expect(output).not.toContain("MultiSignatureClient");
  });
});
