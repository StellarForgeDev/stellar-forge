import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import {
  generateIntegrationCode,
  generateRustIntegration,
} from "@/lib/integration/generators";

describe("integration generators", () => {
  describe("Token (implemented component)", () => {
    const token = getComponentBySlug("token")!;
    const configValues = getConfigDefaults(token);

    it("produces a meaningful Rust integration example", () => {
      const code = generateRustIntegration({ component: token, configValues });
      expect(code).not.toBeNull();
      const output = code as string;
      expect(output).toContain("Stellar-Forge");
      expect(output).toContain("use soroban_sdk::");
      expect(output).toContain("include_bytes!");
      expect(output).toContain("fn integration_example");
      expect(output).toContain("let admin = Address::generate(env);");
      expect(output).toContain("TokenClient");
    });

    it("delegates through the language router", () => {
      const code = generateIntegrationCode(
        { component: token, configValues },
        "rust",
      );
      expect(code).not.toBeNull();
      expect(code).toContain("integration_example");
    });
  });

  describe("Concept component", () => {
    it("returns null because concepts have no implementation or interface", () => {
      const payment = getComponentBySlug("payment")!;
      expect(payment.implementation).toBeUndefined();
      expect(payment.interface).toBeUndefined();
      expect(
        generateRustIntegration({
          component: payment,
          configValues: getConfigDefaults(payment),
        }),
      ).toBeNull();
    });
  });
});
