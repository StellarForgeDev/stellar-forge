import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import {
  callableMethods,
  transactionComponents,
} from "@/lib/transactions/builder";
import { validateTransactionRequest } from "@/lib/transactions/validate";
import { buildInvocationArgs } from "@/lib/transactions/args";
import { buildConstructorRequest } from "@/lib/playground/execution";

const accessControl = getComponentBySlug("access-control")!;
const validAddress = Keypair.random().publicKey();

const accessControlRequest = {
  network: "testnet" as const,
  component: "access-control" as const,
  method: "grant_role" as const,
  sourceAccount: validAddress,
  parameters: { role: "minter", account: validAddress },
};

describe("Access Control discovery and sandbox readiness (generic machinery)", () => {
  describe("capabilities", () => {
    it("is implemented and sandbox-ready but not on Testnet", () => {
      expect(accessControl.capabilities.implemented).toBe(true);
      expect(accessControl.capabilities.sandbox).toBe(true);
      expect(accessControl.capabilities.testnet).toBe(false);
    });
  });

  describe("discovery", () => {
    it("is excluded from Testnet transactions because testnet=false", () => {
      const slugs = transactionComponents([accessControl]).map((c) => c.slug);
      expect(slugs).not.toContain("access-control");
    });

    it("exposes its interface generically through callableMethods", () => {
      const names = callableMethods(accessControl).map((fn) => fn.name);
      expect(names).toEqual([
        "grant_role",
        "revoke_role",
        "has_role",
        "transfer_admin",
      ]);
      const grant = callableMethods(accessControl).find(
        (fn) => fn.name === "grant_role",
      );
      expect(grant?.authorization).toBe("admin");
      expect(grant?.params.map((p) => p.name)).toEqual(["role", "account"]);
    });
  });

  describe("argument encoding", () => {
    it("encodes grant_role() arguments generically", () => {
      const grant = accessControl.interface!.find(
        (fn) => fn.name === "grant_role",
      )!;
      const result = buildInvocationArgs(grant.params, {
        role: "minter",
        account: validAddress,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.scVals).toHaveLength(2);
    });
  });

  describe("validation gating", () => {
    it("rejects Access Control for Testnet because it is not deployed", () => {
      const result = validateTransactionRequest(accessControlRequest, [
        accessControl,
      ]);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some((error) => error.code === "component.not-deployed"),
      ).toBe(true);
    });
  });

  describe("catalog-driven constructor defaults", () => {
    it("derives constructor arguments from metadata, not a hardcoded admin", () => {
      const request = buildConstructorRequest(
        accessControl,
        getConfigDefaults(accessControl),
      );
      expect(request.admin).toBe("admin");
    });
  });
});
