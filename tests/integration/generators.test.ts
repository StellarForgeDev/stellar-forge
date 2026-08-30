import { describe, expect, it } from "vitest";
import {
  getComponentBySlug,
  getConfigDefaults,
  type StellarComponent,
} from "@/data/components";
import {
  generateIntegrationCode,
  generateRustIntegration,
  generateTypescriptIntegration,
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

  describe("Component without implementation", () => {
    it("returns null because concepts have no implementation or interface", () => {
      const base = getComponentBySlug("token")!;
      const concept = {
        ...base,
        implementation: undefined,
        interface: undefined,
      } as unknown as StellarComponent;
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

  describe("Network-aware TypeScript generation", () => {
    const token = getComponentBySlug("token")!;

    it("uses testnet RPC and passphrase by default", () => {
      const configValues = getConfigDefaults(token);
      const code = generateTypescriptIntegration({
        component: token,
        configValues,
      }) as string;
      expect(code).toContain("https://soroban-testnet.stellar.org");
      expect(code).toContain("Test SDF Network ; September 2015");
      expect(code).toContain("--network testnet");
    });

    it("uses mainnet RPC and passphrase when network is mainnet", () => {
      const configValues = { ...getConfigDefaults(token), network: "mainnet" };
      const code = generateTypescriptIntegration({
        component: token,
        configValues,
      }) as string;
      expect(code).toContain("https://soroban-mainnet.stellar.org");
      expect(code).toContain("Public Global Stellar Network ; September 2015");
      expect(code).toContain("--network mainnet");
    });
  });
});
