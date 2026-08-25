import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  getComponentBySlug,
  type StellarComponent,
} from "@/data/components";
import {
  callableMethods,
  transactionComponents,
} from "@/lib/transactions/builder";
import { buildInvocationArgs } from "@/lib/transactions/args";
import { getDeployment } from "@/lib/transactions/deployments";
import { validateTransactionRequest } from "@/lib/transactions/validate";

const payment = getComponentBySlug("payment")!;
const validAddress = Keypair.random().publicKey();

function paymentOnTestnet(): StellarComponent {
  return {
    ...payment,
    capabilities: { ...payment.capabilities, testnet: true },
  };
}

const payRequest = {
  network: "testnet" as const,
  component: "payment" as const,
  method: "pay" as const,
  sourceAccount: validAddress,
  parameters: {
    from: validAddress,
    to: validAddress,
    asset: validAddress,
    amount: "100",
  },
};

describe("Payment Testnet readiness (generic machinery)", () => {
  describe("discovery", () => {
    it("is excluded from Testnet transactions while testnet=false", () => {
      expect(transactionComponents([payment])).toHaveLength(0);
    });

    it("appears in transactionComponents once testnet=true", () => {
      const discovered = transactionComponents([paymentOnTestnet()]);
      expect(discovered.map((component) => component.slug)).toContain(
        "payment",
      );
    });

    it("discovers the pay method and its parameters", () => {
      const methods = callableMethods(paymentOnTestnet());
      const pay = methods.find((fn) => fn.name === "pay");
      expect(pay).toBeDefined();
      expect(pay!.params.map((param) => param.name)).toEqual([
        "from",
        "to",
        "asset",
        "amount",
      ]);
      expect(pay!.params.map((param) => param.type)).toEqual([
        "Address",
        "Address",
        "Address",
        "i128",
      ]);
    });
  });

  describe("validation gating", () => {
    it("rejects Payment for Testnet while testnet=false", () => {
      const result = validateTransactionRequest(payRequest, [payment]);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => error.code === "component.not-deployed"),
      ).toBe(true);
    });

    it("accepts a valid pay request once testnet=true", () => {
      const result = validateTransactionRequest(payRequest, [
        paymentOnTestnet(),
      ]);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("argument encoding", () => {
    it("encodes pay() arguments (asset Address + i128 amount) generically", () => {
      const pay = payment.interface!.find((fn) => fn.name === "pay")!;
      const result = buildInvocationArgs(pay.params, {
        from: validAddress,
        to: validAddress,
        asset: validAddress,
        amount: "100",
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.scVals).toHaveLength(4);
    });
  });

  describe("deployment registry", () => {
    it("is componentSlug-driven and null for the unregistered Payment", () => {
      expect(getDeployment("testnet", "payment")).toBeNull();
      expect(getDeployment("testnet", "does-not-exist")).toBeNull();
      expect(getDeployment("futurenet", "token")).toBeNull();
    });

    it("returns the registered Token address on Testnet", () => {
      const address = getDeployment("testnet", "token");
      expect(address).not.toBeNull();
      expect(address).toMatch(/^C[2-7A-Z]{55}$/);
    });
  });
});
