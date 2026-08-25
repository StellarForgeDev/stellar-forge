import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import {
  callableMethods,
  transactionComponents,
} from "@/lib/transactions/builder";
import { buildInvocationArgs } from "@/lib/transactions/args";
import { validateTransactionRequest } from "@/lib/transactions/validate";
import { buildConstructorRequest } from "@/lib/playground/execution";

const escrow = getComponentBySlug("escrow")!;
const validAddress = Keypair.random().publicKey();

const escrowRequest = {
  network: "testnet" as const,
  component: "escrow" as const,
  method: "release" as const,
  sourceAccount: validAddress,
  parameters: { arbiter: validAddress },
};

describe("Escrow discovery and sandbox readiness (generic machinery)", () => {
  describe("capabilities", () => {
    it("is implemented and sandbox-ready but not on Testnet", () => {
      expect(escrow.capabilities.implemented).toBe(true);
      expect(escrow.capabilities.sandbox).toBe(true);
      expect(escrow.capabilities.testnet).toBe(false);
    });
  });

  describe("discovery", () => {
    it("is excluded from Testnet transactions because testnet=false", () => {
      const slugs = transactionComponents([escrow]).map((c) => c.slug);
      expect(slugs).not.toContain("escrow");
    });

    it("exposes its interface generically through callableMethods", () => {
      const names = callableMethods(escrow).map((fn) => fn.name);
      expect(names).toEqual(["deposit", "release", "refund", "status"]);
      const release = callableMethods(escrow).find((fn) => fn.name === "release");
      expect(release?.authorization).toBe("first-address");
      expect(release?.params.map((p) => p.name)).toEqual(["arbiter"]);
    });
  });

  describe("validation gating", () => {
    it("rejects Escrow for Testnet because it is not deployed", () => {
      const result = validateTransactionRequest(escrowRequest, [escrow]);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => error.code === "component.not-deployed"),
      ).toBe(true);
    });
  });

  describe("argument encoding", () => {
    it("encodes release() arguments generically", () => {
      const release = escrow.interface!.find((fn) => fn.name === "release")!;
      const result = buildInvocationArgs(release.params, {
        arbiter: validAddress,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.scVals).toHaveLength(1);
    });
  });

  describe("catalog-driven constructor defaults", () => {
    it("derives constructor arguments from metadata, not a hardcoded admin", () => {
      const request = buildConstructorRequest(escrow, getConfigDefaults(escrow));
      expect(request.depositor).toBe("user1");
      expect(request.beneficiary).toBe("user2");
      expect(request.arbiter).toBe("admin");
      // The asset resolves to the dependency alias, not a literal address.
      expect(request.asset).toBe("asset");
    });
  });
});
