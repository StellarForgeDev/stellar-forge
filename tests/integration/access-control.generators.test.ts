import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import { generateRustIntegration } from "@/lib/integration/generators";

describe("Access Control integration generator (generic machinery)", () => {
  const accessControl = getComponentBySlug("access-control")!;
  const configValues = getConfigDefaults(accessControl);

  it("produces a Rust integration example derived from metadata", () => {
    const code = generateRustIntegration({
      component: accessControl,
      configValues,
    });
    expect(code).not.toBeNull();
    const output = code as string;
    expect(output).toContain("AccessControlClient");
    expect(output).toContain("fn integration_example");
    expect(output).toContain("has_role");
  });

  it("derives the client name from the package, not a hardcoded name", () => {
    const output = generateRustIntegration({
      component: accessControl,
      configValues,
    }) as string;
    expect(output).toContain("use access_control::AccessControlClient;");
    expect(output).not.toContain("TokenClient");
  });

  it("represents admin-authorized methods generically", () => {
    const output = generateRustIntegration({
      component: accessControl,
      configValues,
    }) as string;
    expect(output).toContain("grant_role(");
    expect(output).toContain("revoke_role(");
    expect(output).toContain("transfer_admin(");
    expect(output).toContain(
      "requires the contract administrator's authorization",
    );
  });

  it("handles the Symbol role parameter generically", () => {
    const output = generateRustIntegration({
      component: accessControl,
      configValues,
    }) as string;
    // The constructor admin argument is an Address resolved to admin.clone().
    expect(output).toContain("admin.clone()");
    // Symbol import is present because the role parameter is a Symbol.
    expect(output).toContain("Symbol");
    expect(output).toContain('Symbol::new(env, "value")');
  });
});
