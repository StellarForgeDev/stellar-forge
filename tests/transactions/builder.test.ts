import { describe, expect, it } from "vitest";
import { getComponentBySlug, stellarComponents } from "@/data/components";
import {
  authorizationInfo,
  buildPreview,
  buildTransactionRequest,
  callableMethods,
  emptyParameters,
  initialBuilderState,
  parameterPlaceholder,
  transactionComponents,
  validateBuilderState,
} from "@/lib/transactions/builder";
import type { FunctionSpec, StellarComponent } from "@/data/components";

const token = getComponentBySlug("token")!;

describe("transaction builder", () => {
  describe("callableMethods", () => {
    it("excludes the constructor from callable methods", () => {
      const methods = callableMethods(token);
      expect(methods.some((m) => m.name === "__constructor")).toBe(false);
      expect(methods.length).toBe(token.interface!.length - 1);
    });
  });

  describe("transactionComponents", () => {
    it("includes exactly the testnet-capable components with a callable interface", () => {
      const result = transactionComponents(stellarComponents);
      const expected = stellarComponents
        .filter(
          (c) => c.capabilities.testnet && callableMethods(c).length > 0,
        )
        .map((c) => c.slug)
        .sort();
      expect(result.map((c) => c.slug).sort()).toEqual(expected);
    });

    it("excludes components without the testnet capability", () => {
      const testnetOnly: StellarComponent = {
        ...token,
        slug: "no-testnet",
        capabilities: { implemented: true, sandbox: true, testnet: false },
      };
      expect(transactionComponents([testnetOnly])).toHaveLength(0);
    });

    it("excludes testnet components that expose no callable methods", () => {
      const noMethods: StellarComponent = {
        ...token,
        slug: "no-methods",
        interface: undefined,
      };
      expect(transactionComponents([noMethods])).toHaveLength(0);
    });
  });

  describe("emptyParameters", () => {
    it("maps each parameter name to an empty string", () => {
      const params: FunctionSpec["params"] = [
        { name: "a", type: "Address" },
        { name: "b", type: "i128" },
      ];
      expect(emptyParameters(params)).toEqual({ a: "", b: "" });
    });
  });

  describe("parameterPlaceholder", () => {
    it("uses an explicit placeholder when provided", () => {
      expect(
        parameterPlaceholder({ name: "x", type: "String", placeholder: "CUSTOM" }),
      ).toBe("CUSTOM");
    });

    it("returns type-appropriate placeholders", () => {
      expect(parameterPlaceholder({ name: "a", type: "Address" })).toBe("G...");
      expect(parameterPlaceholder({ name: "a", type: "MuxedAddress" })).toBe(
        "G...",
      );
      expect(parameterPlaceholder({ name: "a", type: "i128" })).toBe("1000000");
      expect(parameterPlaceholder({ name: "a", type: "u32" })).toBe("200");
      expect(parameterPlaceholder({ name: "a", type: "String" })).toBe("text");
      expect(parameterPlaceholder({ name: "a", type: "Symbol" })).toBe("symbol");
    });

    it("returns an empty placeholder for unknown types", () => {
      expect(parameterPlaceholder({ name: "a", type: "Unknown" })).toBe("");
    });
  });

  describe("authorizationInfo", () => {
    it("reports admin authorization", () => {
      const info = authorizationInfo({
        name: "mint",
        params: [],
        authorization: "admin",
      });
      expect(info.kind).toBe("admin");
      expect(info.description).toContain("administrator");
    });

    it("reports first-address authorization with the first address param", () => {
      const info = authorizationInfo({
        name: "transfer",
        params: [
          { name: "from", type: "Address" },
          { name: "to", type: "MuxedAddress" },
        ],
        authorization: "first-address",
      });
      expect(info.kind).toBe("first-address");
      expect(info.paramName).toBe("from");
    });

    it("defaults to none", () => {
      expect(authorizationInfo(undefined).kind).toBe("none");
      expect(authorizationInfo({ name: "x", params: [] }).kind).toBe("none");
    });
  });

  describe("initialBuilderState", () => {
    it("selects the first testnet component and its first callable method", () => {
      const first = transactionComponents(stellarComponents)[0];
      const state = initialBuilderState(stellarComponents);
      expect(state.componentSlug).toBe(first.slug);
      expect(state.methodName).toBe(callableMethods(first)[0].name);
      expect(state.network).toBe("testnet");
      expect(state.sourceAccount).toBe("");
    });

    it("returns an empty draft when no component is available", () => {
      const state = initialBuilderState([]);
      expect(state.componentSlug).toBe("");
      expect(state.methodName).toBe("");
    });
  });

  describe("buildTransactionRequest", () => {
    it("maps builder state onto a transaction request", () => {
      const state = initialBuilderState(stellarComponents);
      const request = buildTransactionRequest(state);
      expect(request).toEqual({
        network: "testnet",
        component: state.componentSlug,
        method: state.methodName,
        sourceAccount: "",
        parameters: {},
      });
    });
  });

  describe("validateBuilderState", () => {
    it("reports validation errors and buildability from the request", () => {
      const state = initialBuilderState(stellarComponents);
      const validation = validateBuilderState(state, stellarComponents);
      expect(validation.canBuild).toBe(false);
      expect(validation.errors["sourceAccount"]).toBeDefined();
    });
  });

  describe("buildPreview", () => {
    it("renders a draft preview for the default state", () => {
      const state = initialBuilderState(stellarComponents);
      const preview = buildPreview(
        state,
        stellarComponents,
        { phase: "draft" },
        { status: "disconnected", address: null, networkName: null, networkPassphrase: null, error: null },
        { phase: "idle" },
        { phase: "idle" },
      );
      const firstComponent = transactionComponents(stellarComponents)[0];
      expect(preview.networkLabel).toBe("Stellar Testnet");
      expect(preview.componentName).toBe(firstComponent.name);
      expect(preview.methodName).toBe(callableMethods(firstComponent)[0].name);
      expect(preview.phase).toBe("draft");
      expect(preview.statusLabel).toBe("Waiting for required parameters");
    });
  });
});
