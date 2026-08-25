import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import {
  ADMIN_IDENTITY,
  buildConstructorRequest,
  callRequestFor,
  defaultArgValue,
  signerFor,
} from "@/lib/playground/execution";
import type { FunctionSpec } from "@/data/components";

const token = getComponentBySlug("token")!;

function fn(overrides: Partial<FunctionSpec>): FunctionSpec {
  return { name: "op", params: [], authorization: "none", ...overrides };
}

describe("playground execution helpers", () => {
  describe("defaultArgValue", () => {
    it("uses the admin identity for the first address argument", () => {
      expect(
        defaultArgValue({ name: "from", type: "Address" }, 0),
      ).toBe(ADMIN_IDENTITY);
    });

    it("uses user1 for subsequent address arguments", () => {
      expect(defaultArgValue({ name: "to", type: "Address" }, 1)).toBe("user1");
    });

    it("uses 1000 for i128 arguments", () => {
      expect(defaultArgValue({ name: "amount", type: "i128" }, 0)).toBe("1000");
    });

    it("defaults to an empty string for other types", () => {
      expect(defaultArgValue({ name: "name", type: "String" }, 0)).toBe("");
    });
  });

  describe("signerFor", () => {
    it("returns the admin for admin-authorized methods", () => {
      expect(signerFor(fn({ authorization: "admin" }), [])).toBe(ADMIN_IDENTITY);
    });

    it("returns the first address argument for first-address methods", () => {
      const method = fn({
        authorization: "first-address",
        params: [{ name: "from", type: "Address" }],
      });
      expect(signerFor(method, ["GABC"])).toBe("GABC");
    });

    it("returns undefined when there is no special authorization", () => {
      expect(signerFor(fn({ authorization: "none" }), [])).toBeUndefined();
    });

    it("returns undefined when first-address has no address argument", () => {
      const method = fn({
        authorization: "first-address",
        params: [{ name: "amount", type: "i128" }],
      });
      expect(signerFor(method, ["100"])).toBeUndefined();
    });
  });

  describe("callRequestFor", () => {
    it("includes the signer for authorized methods", () => {
      const request = callRequestFor(fn({ authorization: "admin" }), []);
      expect(request).toEqual({ fn: "op", args: [], signer: ADMIN_IDENTITY });
    });

    it("omits the signer for unauthorized methods", () => {
      const request = callRequestFor(fn({ authorization: "none" }), ["x"]);
      expect(request).toEqual({ fn: "op", args: ["x"] });
    });
  });

  describe("buildConstructorRequest", () => {
    it("uses the admin identity for address arguments and config values otherwise", () => {
      const request = buildConstructorRequest(token, getConfigDefaults(token));
      expect(request.admin).toBe(ADMIN_IDENTITY);
      expect(request.decimal).toBe("7");
      expect(request.name).toBe("Forge Token");
      expect(request.symbol).toBe("FORGE");
    });

    it("returns an empty request when there is no constructor", () => {
      const noConstructor = { ...token, interface: [] };
      expect(buildConstructorRequest(noConstructor, {})).toEqual({});
    });
  });
});
