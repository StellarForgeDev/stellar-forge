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
      const concept = getComponentBySlug("escrow")!;
      expect(concept.implementation).toBeUndefined();
      expect(concept.interface).toBeUndefined();
      expect(
        generateRustIntegration({
          component: concept,
          configValues: getConfigDefaults(concept),
        }),
      ).toBeNull();
    });
  });

  describe("Payment (implemented with a dependency)", () => {
    const payment = getComponentBySlug("payment")!;
    const configValues = getConfigDefaults(payment);

    it("produces a meaningful Rust integration example", () => {
      const code = generateRustIntegration({ component: payment, configValues });
      expect(code).not.toBeNull();
      const output = code as string;
      expect(output).toContain("Stellar-Forge");
      expect(output).toContain("use soroban_sdk::");
      expect(output).toContain("include_bytes!");
      expect(output).toContain("fn integration_example");
    });

    it("derives a Payment client generically and references the asset dependency", () => {
      const code = generateRustIntegration({ component: payment, configValues });
      const output = code as string;
      // Generic client derivation (package "payment" -> PaymentClient), not a
      // hardcoded TokenClient.
      expect(output).toContain("PaymentClient");
      expect(output).not.toContain("TokenClient");
      // The asset dependency is surfaced with a resolvable address placeholder.
      expect(output).toContain("asset_address");
      expect(output).toContain("alias: asset");
    });
  });
});
