import { describe, expect, it } from "vitest";
import { getComponentBySlug, getConfigDefaults } from "@/data/components";
import {
  buildConstructorRequest,
  defaultArgValue,
} from "@/lib/playground/execution";

const escrow = getComponentBySlug("escrow")!;
const addressOptions = ["admin", "user1", "user2", "asset"];

describe("Escrow Playground behavior (catalog-derived, no branching)", () => {
  it("builds constructor defaults from catalog metadata", () => {
    const request = buildConstructorRequest(escrow, getConfigDefaults(escrow));
    expect(request).toEqual({
      depositor: "user1",
      beneficiary: "user2",
      arbiter: "admin",
      asset: "asset",
    });
  });

  it("offers the asset dependency alias as an address option", () => {
    expect(
      defaultArgValue({ name: "asset", type: "Address" }, 3, addressOptions),
    ).toBe("asset");
  });

  it("seeds the depositor parameter from the identity fallback", () => {
    // "depositor" is not a known identity, so the first address argument falls
    // back to the admin identity; the user selects "user1" in the UI to match
    // the catalog-driven constructor default.
    expect(
      defaultArgValue({ name: "depositor", type: "Address" }, 0, addressOptions),
    ).toBe("admin");
  });
});
