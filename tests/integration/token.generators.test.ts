import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import { generateRustIntegration } from "@/lib/integration/generators";

describe("Token integration generator (generic machinery)", () => {
  const token = getComponentBySlug("token")!;
  const configValues = getConfigDefaults(token);

  it("derives client and constructor values from catalog metadata", () => {
    const code = generateRustIntegration({ component: token, configValues });
    expect(code).not.toBeNull();
    const output = code as string;
    // Client is derived from the package name, generically.
    expect(output).toContain("use token::TokenClient;");
    // Numeric decimal constructor arg is config-backed; no placeholder leaks.
    expect(output).toContain("7_u32");
    expect(output).toContain('String::from_str(env, "Forge Token")');
    expect(output).not.toContain("configure me");
  });
});
