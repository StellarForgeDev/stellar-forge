import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import {
  buildConstructorRequest,
  callRequestFor,
  defaultArgValue,
  signerFor,
} from "@/lib/playground/execution";

const accessControl = getComponentBySlug("access-control")!;

describe("Access Control Playground behavior (catalog-derived, no branching)", () => {
  it("builds constructor defaults from catalog metadata", () => {
    const request = buildConstructorRequest(
      accessControl,
      getConfigDefaults(accessControl),
    );
    expect(request).toEqual({ admin: "admin" });
  });

  it("resolves the admin constructor argument to the admin identity", () => {
    expect(
      defaultArgValue({ name: "admin", type: "Address" }, 0),
    ).toBe("admin");
  });

  it("requires the admin signer for grant_role", () => {
    const fn = accessControl.interface!.find((f) => f.name === "grant_role")!;
    expect(signerFor(fn, ["minter", "user1"])).toBe("admin");
    expect(callRequestFor(fn, ["minter", "user1"])).toEqual({
      fn: "grant_role",
      args: ["minter", "user1"],
      signer: "admin",
    });
  });

  it("requires the admin signer for revoke_role", () => {
    const fn = accessControl.interface!.find((f) => f.name === "revoke_role")!;
    expect(signerFor(fn, ["minter", "user1"])).toBe("admin");
  });

  it("requires the admin signer for transfer_admin", () => {
    const fn = accessControl.interface!.find(
      (f) => f.name === "transfer_admin",
    )!;
    expect(signerFor(fn, ["user1"])).toBe("admin");
  });

  it("requires no signer for has_role", () => {
    const fn = accessControl.interface!.find((f) => f.name === "has_role")!;
    expect(signerFor(fn, ["minter", "user1"])).toBeUndefined();
    expect(callRequestFor(fn, ["minter", "user1"])).toEqual({
      fn: "has_role",
      args: ["minter", "user1"],
    });
  });
});
