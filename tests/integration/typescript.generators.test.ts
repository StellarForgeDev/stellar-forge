import { describe, expect, it } from "vitest";
import {
  getComponentBySlug,
  getConfigDefaults,
  stellarComponents,
  type StellarComponent,
} from "@/data/components";
import {
  generateIntegrationCode,
  generateRustIntegration,
  generateTypescriptIntegration,
} from "@/lib/integration/generators";
import { INTEGRATION_LANGUAGES } from "@/lib/integration/types";

const IMPLEMENTED = stellarComponents.filter(
  (component) =>
    component.implementation && (component.interface?.length ?? 0) > 0,
);

function ctx(component: StellarComponent) {
  return { component, configValues: getConfigDefaults(component) };
}

describe("integration language support", () => {
  it("exposes Rust and TypeScript as integration languages", () => {
    const values = INTEGRATION_LANGUAGES.map((option) => option.value);
    expect(values).toContain("rust");
    expect(values).toContain("typescript");
  });

  it("routes 'typescript' to the TypeScript generator and keeps Rust intact", () => {
    const token = getComponentBySlug("token")!;
    const ts = generateIntegrationCode(ctx(token), "typescript");
    expect(ts).not.toBeNull();
    expect(ts).toContain("new rpc.Server");
    const rust = generateIntegrationCode(ctx(token), "rust");
    expect(rust).toContain("fn integration_example");
    expect(rust).toContain("TokenClient");
  });
});

describe("TypeScript generation (generic, data-driven)", () => {
  it("produces non-null output for every implemented component", () => {
    expect(IMPLEMENTED.length).toBeGreaterThan(0);
    for (const component of IMPLEMENTED) {
      const code = generateTypescriptIntegration(ctx(component));
      expect(code, `${component.slug} should generate TypeScript`).not.toBeNull();
    }
  });

  it("uses @stellar/stellar-sdk and the generic contract invocation pattern", () => {
    for (const component of IMPLEMENTED) {
      const code = generateTypescriptIntegration(ctx(component)) as string;
      expect(code).toContain('from "@stellar/stellar-sdk"');
      expect(code).toContain("rpc.Server");
      expect(code).toContain("new Contract(");
      expect(code).toContain("contract.call(");
      expect(code).toContain("server.sendTransaction");
    }
  });

  it("emits an invoke call for every callable interface function", () => {
    for (const component of IMPLEMENTED) {
      const code = generateTypescriptIntegration(ctx(component)) as string;
      const callable = (component.interface ?? []).filter(
        (fn) => fn.name !== "__constructor",
      );
      for (const fn of callable) {
        expect(code, `${component.slug}: ${fn.name}`).toContain(
          `await invoke("${fn.name}"`,
        );
      }
    }
  });

  it("maps every parameter type used by callable functions to the correct SDK expression", () => {
    const seen = new Set<string>();
    for (const component of IMPLEMENTED) {
      const code = generateTypescriptIntegration(ctx(component)) as string;
      for (const fn of component.interface ?? []) {
        if (fn.name === "__constructor") continue;
        for (const param of fn.params) {
          seen.add(param.type);
          if (param.type === "i128") {
            expect(code).toContain('nativeToScVal(BigInt(1000000), { type: "i128" })');
          } else if (param.type === "u32") {
            expect(code).toContain('nativeToScVal(200, { type: "u32" })');
          } else if (param.type === "String") {
            expect(code).toContain('nativeToScVal("value", { type: "string" })');
          } else if (param.type === "Symbol") {
            expect(code).toContain('nativeToScVal("symbol", { type: "symbol" })');
          } else if (param.type === "Address" || param.type === "MuxedAddress") {
            expect(code).toContain(".toScVal()");
          }
        }
      }
    }
    // The catalog exercises the core SDK types at minimum.
    expect(seen.has("Address")).toBe(true);
    expect(seen.has("i128")).toBe(true);
  });

  it("represents MuxedAddress parameters honestly", () => {
    const muxedComponent = IMPLEMENTED.find((component) =>
      (component.interface ?? []).some((fn) =>
        fn.params.some((param) => param.type === "MuxedAddress"),
      ),
    );
    expect(muxedComponent, "at least one component exposes a MuxedAddress param").toBeTruthy();
    const code = generateTypescriptIntegration(
      ctx(muxedComponent!),
    ) as string;
    expect(code).toContain('new Address("<MUXED_ADDRESS>")');
    expect(code).toContain("muxed");
  });

  it("surfaces authorization requirements (token)", () => {
    const code = generateTypescriptIntegration(
      ctx(getComponentBySlug("token")!),
    ) as string;
    expect(code).toContain("administrator's authorization");
    expect(code).toContain("authorization from the first address");
  });

  it("keeps deployment out of the generated integration (per architecture)", () => {
    const code = generateTypescriptIntegration(
      ctx(getComponentBySlug("token")!),
    ) as string;
    expect(code).toContain("Deployment of this contract is performed separately");
    expect(code).toContain("stellar contract deploy");
  });

  it("does not introduce component-specific branching", () => {
    const tokenCode = generateTypescriptIntegration(
      ctx(getComponentBySlug("token")!),
    ) as string;
    expect(tokenCode).not.toContain("TokenClient");
    expect(tokenCode).not.toContain('slug === "token"');
    // It relies on the generic data-driven pattern, not a hardcoded client.
    expect(tokenCode).toContain("new Contract(CONTRACT_ID)");
  });

  it("keeps the existing Rust generation fully intact", () => {
    const rust = generateRustIntegration(ctx(getComponentBySlug("token")!));
    expect(rust).not.toBeNull();
    expect(rust).toContain("fn integration_example");
    expect(rust).toContain("TokenClient");
  });
});
