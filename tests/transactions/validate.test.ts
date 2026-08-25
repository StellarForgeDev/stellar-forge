import { describe, expect, it } from "vitest";
import { getComponentBySlug, type StellarComponent } from "@/data/components";
import { validateTransactionRequest } from "@/lib/transactions/validate";
import type { TransactionRequest } from "@/lib/transactions/types";
import { Keypair } from "@stellar/stellar-sdk";

const validAddress = Keypair.random().publicKey();

function tokenTransferRequest(
  overrides: Partial<TransactionRequest> = {},
): TransactionRequest {
  return {
    network: "testnet",
    component: "token",
    method: "transfer",
    sourceAccount: validAddress,
    parameters: {
      from: validAddress,
      to: validAddress,
      amount: "100",
    },
    ...overrides,
  };
}

describe("validateTransactionRequest", () => {
  describe("Testnet gate", () => {
    it("accepts a valid Token request", () => {
      const result = validateTransactionRequest(tokenTransferRequest(), [
        getComponentBySlug("token")!,
      ]);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects a component that is implemented but not on Testnet", () => {
      const nonTestnet: StellarComponent = {
        slug: "sandbox-only",
        name: "Sandbox Only",
        description: "",
        category: "Tokens",
        shortDescription: "",
        overview: "",
        useCases: [],
        capabilities: { implemented: true, sandbox: true, testnet: false },
        interface: [
          {
            name: "do_thing",
            params: [{ name: "x", type: "u32" }],
            authorization: "none",
          },
        ],
        config: [],
      };

      const result = validateTransactionRequest(
        {
          network: "testnet",
          component: "sandbox-only",
          method: "do_thing",
          sourceAccount: validAddress,
          parameters: { x: "5" },
        },
        [nonTestnet],
      );

      expect(result.ok).toBe(false);
      const error = result.errors.find((e) => e.code === "component.not-deployed");
      expect(error).toBeDefined();
      expect(error?.message).toContain("not available on Testnet");
    });

    it("rejects a component whose capabilities are all false", () => {
      const concept = {
        ...getComponentBySlug("payment")!,
        capabilities: { implemented: false, sandbox: false, testnet: false },
      };
      const result = validateTransactionRequest(
        {
          network: "testnet",
          component: "payment",
          method: "pay",
          sourceAccount: validAddress,
          parameters: {},
        },
        [concept],
      );

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "component.not-deployed"),
      ).toBe(true);
    });

    it("accepts both Payment and Token for Testnet once deployed", () => {
      const components = [
        getComponentBySlug("token")!,
        getComponentBySlug("payment")!,
      ];

      const paymentResult = validateTransactionRequest(
        {
          network: "testnet",
          component: "payment",
          method: "pay",
          sourceAccount: validAddress,
          parameters: {
            from: validAddress,
            to: validAddress,
            asset: validAddress,
            amount: "100",
          },
        },
        components,
      );
      expect(paymentResult.ok).toBe(true);

      const tokenResult = validateTransactionRequest(
        tokenTransferRequest(),
        components,
      );
      expect(tokenResult.ok).toBe(true);
    });
  });

  describe("interface validation", () => {
    it("flags a component with no interface", () => {
      const noInterface: StellarComponent = {
        slug: "no-iface",
        name: "No Interface",
        description: "",
        category: "Tokens",
        shortDescription: "",
        overview: "",
        useCases: [],
        capabilities: { implemented: true, sandbox: true, testnet: true },
        config: [],
      };

      const result = validateTransactionRequest(
        {
          network: "testnet",
          component: "no-iface",
          method: "anything",
          sourceAccount: validAddress,
          parameters: {},
        },
        [noInterface],
      );

      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "component.no-interface"),
      ).toBe(true);
    });

    it("flags an unknown method", () => {
      const result = validateTransactionRequest(tokenTransferRequest(), [
        getComponentBySlug("token")!,
      ]);
      const unknown = validateTransactionRequest(
        { ...tokenTransferRequest(), method: "not_a_method" },
        [getComponentBySlug("token")!],
      );
      expect(result.ok).toBe(true);
      expect(unknown.ok).toBe(false);
      expect(
        unknown.errors.some((e) => e.code === "method.missing"),
      ).toBe(true);
    });

    it("rejects the constructor as a transaction method", () => {
      const result = validateTransactionRequest(
        { ...tokenTransferRequest(), method: "__constructor" },
        [getComponentBySlug("token")!],
      );
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "method.constructor"),
      ).toBe(true);
    });
  });

  describe("parameter validation", () => {
    it("flags a missing required parameter", () => {
      const result = validateTransactionRequest(
        {
          ...tokenTransferRequest(),
          parameters: { to: validAddress, amount: "100" },
        },
        [getComponentBySlug("token")!],
      );
      expect(result.ok).toBe(false);
      const error = result.errors.find((e) => e.field === "from");
      expect(error?.code).toBe("parameter.missing");
    });

    it("flags an invalid parameter value", () => {
      const result = validateTransactionRequest(
        {
          ...tokenTransferRequest(),
          parameters: { from: "not-an-address", to: validAddress, amount: "100" },
        },
        [getComponentBySlug("token")!],
      );
      expect(result.ok).toBe(false);
      const error = result.errors.find((e) => e.field === "from");
      expect(error?.code).toBe("parameter.invalid-type");
    });

    it("flags an unsupported parameter type declared in the interface", () => {
      const custom: StellarComponent = {
        slug: "custom-type",
        name: "Custom Type",
        description: "",
        category: "Tokens",
        shortDescription: "",
        overview: "",
        useCases: [],
        capabilities: { implemented: true, sandbox: true, testnet: true },
        interface: [
          {
            name: "store",
            params: [{ name: "data", type: "Blob" }],
            authorization: "none",
          },
        ],
        config: [],
      };
      const result = validateTransactionRequest(
        {
          network: "testnet",
          component: "custom-type",
          method: "store",
          sourceAccount: validAddress,
          parameters: { data: "anything" },
        },
        [custom],
      );
      expect(result.ok).toBe(false);
      const error = result.errors.find((e) => e.field === "data");
      expect(error?.code).toBe("parameter.unsupported-type");
    });
  });

  describe("request envelope validation", () => {
    it("flags an unsupported network", () => {
      const result = validateTransactionRequest(
        { ...tokenTransferRequest(), network: "mainnet" as TransactionRequest["network"] },
        [getComponentBySlug("token")!],
      );
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "network.unsupported"),
      ).toBe(true);
    });

    it("flags a missing source account", () => {
      const result = validateTransactionRequest(
        { ...tokenTransferRequest(), sourceAccount: "" },
        [getComponentBySlug("token")!],
      );
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "source-account.missing"),
      ).toBe(true);
    });

    it("flags a missing component", () => {
      const result = validateTransactionRequest(
        { ...tokenTransferRequest(), component: "ghost" },
        [getComponentBySlug("token")!],
      );
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((e) => e.code === "component.missing"),
      ).toBe(true);
    });
  });
});
