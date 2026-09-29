import { describe, expect, it, vi } from "vitest";
import type { StellarComponent } from "@/data/components";
import { stellarComponents } from "@/data/components";
import { DEPLOYMENTS } from "@/lib/transactions/deployments";
import { validateVerificationRegistry, reconcileArtifacts } from "@/lib/verification/artifact-verification";
import type { SimulateInvocationResult } from "@/lib/transactions/rpc";
import {
  READ_ONLY_SMOKE_SOURCE_ACCOUNT,
  defaultReadOnlyArguments,
  isTransportLevelFailure,
  runReadOnlySmoke,
  selectReadOnlyMethod,
} from "@/lib/verification/read-only-smoke";
import { renderTestnetReport } from "@/lib/verification/testnet-report";
import type {
  DeploymentEvidence,
  DeploymentStateEvidence,
} from "@/lib/verification/deployment-evidence";

const CONTRACT_ID = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";
const FIXED_NOW = "2026-01-01T00:00:00.000Z";
const HASH = (char: string) => char.repeat(64);

function simulation(overrides: Partial<{ isReadCall: boolean; value: string }> = {}): SimulateInvocationResult {
  return {
    ok: true,
    simulation: {
      success: true,
      latestLedger: 1,
      minResourceFee: "0",
      cost: { cpuInstructions: "0", memoryBytes: "0" },
      result: { type: "i32", value: overrides.value ?? "7" },
      isReadCall: overrides.isReadCall ?? true,
      sourceAccountFunded: false,
      transactionData: "",
      expiresAt: 0,
    },
  };
}

function fixture(overrides: Partial<StellarComponent>): StellarComponent {
  return {
    slug: "fixture",
    name: "Fixture",
    description: "",
    category: "Test",
    displayOrder: 1,
    capabilities: { implemented: true, sandbox: false, testnet: true },
    shortDescription: "",
    overview: "",
    useCases: [],
    implementation: {
      language: "rust",
      package: "fixture",
      sourcePath: "contracts/contracts/fixture",
      buildTarget: "wasm32v1-none",
    },
    ...overrides,
  } as StellarComponent;
}

const READ_ONLY_COMPONENT = fixture({
  interface: [
    { name: "__constructor", params: [], authorization: "none" },
    { name: "mutable_op", params: [{ name: "to", type: "Address" }], authorization: "first-address" },
    { name: "admin_op", params: [], authorization: "admin" },
    { name: "read_op", params: [], authorization: "none", returns: "u32", readOnly: true },
  ],
});

describe("read-only method selection", () => {
  it("selects only methods explicitly marked readOnly:true", () => {
    const method = selectReadOnlyMethod(READ_ONLY_COMPONENT);
    expect(method?.name).toBe("read_op");
    expect(method?.readOnly).toBe(true);
  });

  it("never selects constructor, state-changing, or admin methods", () => {
    const method = selectReadOnlyMethod(READ_ONLY_COMPONENT);
    expect(method?.name).not.toBe("__constructor");
    expect(method?.name).not.toBe("mutable_op");
    expect(method?.name).not.toBe("admin_op");
  });

  it("treats a missing readOnly as not selectable", () => {
    const unmarked = fixture({
      interface: [
        { name: "query", params: [], authorization: "none", returns: "u32" },
      ],
    });
    expect(selectReadOnlyMethod(unmarked)).toBeNull();
  });

  it("does NOT accept authorization:none plus a return type as read-only", () => {
    // Exactly the shape of oracle.publish: no authorization, returns bool, mutates.
    const mutatingBool = fixture({
      interface: [
        { name: "publish", params: [{ name: "x", type: "i64" }], authorization: "none", returns: "bool" },
      ],
    });
    expect(selectReadOnlyMethod(mutatingBool)).toBeNull();
  });

  it("does NOT accept a zero-argument method as read-only when unmarked", () => {
    const zeroArgMutator = fixture({
      interface: [
        { name: "poke", params: [], authorization: "none" },
      ],
    });
    expect(selectReadOnlyMethod(zeroArgMutator)).toBeNull();
  });

  it("skips readOnly:true methods with unsupported parameter types", () => {
    const unsupported = fixture({
      interface: [
        { name: "query", params: [{ name: "x", type: "Weird<Type>" }], authorization: "none", returns: "u32", readOnly: true },
      ],
    });
    expect(selectReadOnlyMethod(unsupported)).toBeNull();
  });

  it("prefers a zero-argument method but still accepts parameterized ones", () => {
    const parameterized = fixture({
      interface: [
        { name: "is_thing", params: [{ name: "id", type: "u64" }], authorization: "none", returns: "bool", readOnly: true },
      ],
    });
    const method = selectReadOnlyMethod(parameterized);
    expect(method?.name).toBe("is_thing");
    expect(defaultReadOnlyArguments(method!.params)).toEqual({ id: "0" });

    const withZeroArg = fixture({
      interface: [
        { name: "with_arg", params: [{ name: "id", type: "u64" }], authorization: "none", returns: "bool", readOnly: true },
        { name: "no_arg", params: [], authorization: "none", returns: "bool", readOnly: true },
      ],
    });
    expect(selectReadOnlyMethod(withZeroArg)?.name).toBe("no_arg");
  });

  it("keeps every real catalog selection explicitly marked readOnly:true", () => {
    for (const component of stellarComponents) {
      const method = selectReadOnlyMethod(component);
      if (!method) continue;
      expect(method.readOnly).toBe(true);
      expect(method.name).not.toBe("__constructor");
      expect(method.authorization).toBe("none");
    }
  });

  it("never marks the known catalog mutators as readOnly", () => {
    const knownMutators: Record<string, string[]> = {
      oracle: ["publish", "set_signer"],
      timelock: ["release", "lock"],
      "multi-signature": ["execute", "approve"],
      "claimable-balance": ["claim", "cancel", "deposit"],
      crowdfund: ["withdraw", "claim_refund", "contribute", "create_campaign"],
      "merkle-airdrop": ["claim", "deposit", "update_root"],
      vesting: ["claim", "deposit"],
      staking: ["stake", "unstake", "claim", "fund_rewards"],
      escrow: ["deposit", "release", "refund"],
      subscription: ["charge", "cancel"],
      allowance: ["approve", "increase_allowance", "decrease_allowance", "transfer_from"],
      "atomic-swap": ["create_offer", "execute", "cancel_offer"],
      "access-control": ["grant_role", "revoke_role", "transfer_admin"],
      token: ["transfer", "approve", "transfer_from", "burn", "burn_from", "mint", "set_admin"],
      payment: ["pay"],
    };
    for (const component of stellarComponents) {
      const names = knownMutators[component.slug] ?? [];
      for (const name of names) {
        const method = (component.interface ?? []).find((fn) => fn.name === name);
        expect(method, `${component.slug}.${name} should exist`).toBeDefined();
        expect(method!.readOnly, `${component.slug}.${name} must not be readOnly`).not.toBe(true);
      }
    }
  });

  it("keeps Payment notQueryable (no read-only method)", () => {
    const payment = stellarComponents.find((c) => c.slug === "payment")!;
    expect(selectReadOnlyMethod(payment)).toBeNull();
  });
});

describe("read-only smoke probe", () => {
  it("leaves payment notQueryable without invoking the simulator", async () => {
    const payment = stellarComponents.find((c) => c.slug === "payment")!;
    const simulate = vi.fn();
    const result = await runReadOnlySmoke({
      component: payment,
      network: "testnet",
      contractId: CONTRACT_ID,
      simulate: simulate as never,
    });
    expect(result.verification).toBe("notQueryable");
    expect(result.selectedMethod).toBeNull();
    expect(simulate).not.toHaveBeenCalled();
  });

  it("records a successful read-call simulation conservatively as partiallyVerified", async () => {
    const result = await runReadOnlySmoke({
      component: READ_ONLY_COMPONENT,
      network: "testnet",
      contractId: CONTRACT_ID,
      now: FIXED_NOW,
      simulate: async () => simulation({ isReadCall: true }),
    });
    expect(result.verification).toBe("partiallyVerified");
    expect(result.selectedMethod).toBe("read_op");
    expect(result.observations[0].status).toBe("observed");
    expect(result.observations[0].result).toEqual({ type: "i32", value: "7" });
    // Behavioral evidence carries no hash/parity claim of its own.
    expect(Object.keys(result).sort()).toEqual([
      "observations",
      "selectedMethod",
      "verification",
    ]);
    expect(result).not.toHaveProperty("artifactParity");
  });

  it("refuses behavioral success when the simulation is not a read call", async () => {
    const result = await runReadOnlySmoke({
      component: READ_ONLY_COMPONENT,
      network: "testnet",
      contractId: CONTRACT_ID,
      now: FIXED_NOW,
      simulate: async () => simulation({ isReadCall: false }),
    });
    expect(result.verification).not.toBe("partiallyVerified");
    expect(result.verification).toBe("notVerified");
    expect(result.observations[0].status).toBe("rejected");
    expect(result.observations[0].detail).toContain("isReadCall");
  });

  it("does not imply hash parity and does not erase a hash mismatch", async () => {
    const mismatch = reconcileArtifacts({
      component: READ_ONLY_COMPONENT,
      network: "testnet",
      contractId: CONTRACT_ID,
      sourceArtifact: { path: "s.wasm", sha256: HASH("a") },
      prebuiltArtifact: { path: "p.wasm", sha256: HASH("b") },
      deployedArtifact: { sha256: HASH("c") },
      metadataCommit: null,
      currentRepositoryCommit: null,
      verifiedAt: null,
      verificationMethod: "not-available",
    });
    expect(mismatch.status).toContain("DEPLOYMENT_MISMATCH");

    const behavior = await runReadOnlySmoke({
      component: READ_ONLY_COMPONENT,
      network: "testnet",
      contractId: CONTRACT_ID,
      now: FIXED_NOW,
      simulate: async () => simulation({ isReadCall: true }),
    });
    // The two claims coexist independently.
    expect(behavior.verification).toBe("partiallyVerified");
    expect(mismatch.status).toContain("DEPLOYMENT_MISMATCH");
  });

  it("classifies a transport failure as unavailable, never as a mismatch", async () => {
    const result = await runReadOnlySmoke({
      component: READ_ONLY_COMPONENT,
      network: "testnet",
      contractId: CONTRACT_ID,
      now: FIXED_NOW,
      simulate: async () => ({
        ok: false,
        error: { code: "rpc-unavailable", message: "RPC down" },
      }),
    });
    expect(result.verification).toBe("notQueryable");
    expect(result.verification).not.toBe("notVerified");
    expect(result.observations[0].status).toBe("unavailable");
    expect(result.observations[0].errorCode).toBe("rpc-unavailable");

    const outage = reconcileArtifacts({
      component: READ_ONLY_COMPONENT,
      network: "testnet",
      contractId: CONTRACT_ID,
      sourceArtifact: { path: "s.wasm", sha256: HASH("a") },
      prebuiltArtifact: { path: "p.wasm", sha256: HASH("b") },
      deployedArtifact: { sha256: null },
      metadataCommit: null,
      currentRepositoryCommit: null,
      verifiedAt: null,
      verificationMethod: "not-available",
    });
    expect(outage.status).toContain("DEPLOYMENT_UNAVAILABLE");
    expect(outage.status).not.toContain("DEPLOYMENT_MISMATCH");
  });

  it("treats a contract rejection as notVerified (not unavailable)", async () => {
    const result = await runReadOnlySmoke({
      component: READ_ONLY_COMPONENT,
      network: "testnet",
      contractId: CONTRACT_ID,
      now: FIXED_NOW,
      simulate: async () => ({
        ok: false,
        error: { code: "simulation-failed", message: "contract rejected" },
      }),
    });
    expect(result.verification).toBe("notVerified");
    expect(result.observations[0].status).toBe("rejected");
    expect(result.observations[0].errorCode).toBe("simulation-failed");
  });

  it("is deterministic and idempotent for the same input", async () => {
    const run = () =>
      runReadOnlySmoke({
        component: READ_ONLY_COMPONENT,
        network: "testnet",
        contractId: CONTRACT_ID,
        now: FIXED_NOW,
        simulate: async () => simulation({ isReadCall: true }),
      });
    expect(await run()).toEqual(await run());
  });

  it("uses the deterministic public placeholder source account", () => {
    expect(READ_ONLY_SMOKE_SOURCE_ACCOUNT.startsWith("G")).toBe(true);
  });

  it("classifies transport-level error codes distinctly", () => {
    expect(isTransportLevelFailure("rpc-unavailable")).toBe(true);
    expect(isTransportLevelFailure("parameter-unsupported-type")).toBe(true);
    expect(isTransportLevelFailure("simulation-failed")).toBe(false);
  });
});

describe("evidence rendering preserves separate claims", () => {
  function minimalEvidence(): DeploymentEvidence[] {
    return [
      {
        componentId: "access-control",
        network: "testnet",
        contractId: CONTRACT_ID,
        sourceArtifact: { path: "s", sha256: null },
        prebuiltArtifact: { path: "p", sha256: HASH("b") },
        deployedArtifact: { sha256: HASH("c") },
        artifactParity: {
          sourceMatchesPrebuilt: null,
          prebuiltMatchesDeployed: false,
          sourceMatchesDeployed: null,
        },
        provenance: { metadataCommit: null, currentRepositoryCommit: null },
        verification: { verifiedAt: FIXED_NOW, verificationMethod: "not-available" },
        status: ["DEPLOYMENT_MISMATCH", "PROVENANCE_STALE"],
        rpcRetrievalStatus: "VERIFIED",
      },
    ] as unknown as DeploymentEvidence[];
  }

  const deploymentState = [
    {
      componentId: "access-control",
      network: "testnet",
      contractId: CONTRACT_ID,
      verification: "partiallyVerified",
      constructorVerified: false,
      observations: [
        { method: "has_role", args: [], result: false, verifiedAt: FIXED_NOW, status: "observed" },
      ],
    },
  ] as unknown as DeploymentStateEvidence[];

  it("labels retrieval explicitly and never as artifact verification", () => {
    const md = renderTestnetReport(minimalEvidence(), {
      expectedCount: 15,
      accountedCount: 15,
      errors: [],
    }, deploymentState);

    expect(md).toContain("| RPC retrieval |");
    expect(md).toContain("RPC retrieval: VERIFIED");
    expect(md).not.toContain("Effective status");
  });

  it("keeps registry, retrieval, artifact parity, provenance, and behavior distinct", () => {
    const md = renderTestnetReport(minimalEvidence(), {
      expectedCount: 15,
      accountedCount: 15,
      errors: [],
    }, deploymentState);

    expect(md).toContain("does not imply exact WASM hash parity");
    expect(md).toContain("Registry: 15 components checked; 15 explicitly accounted for (PASS)");
    expect(md).toContain("| Registry | Artifact status | Provenance | RPC retrieval |");
    expect(md).toContain("DEPLOYMENT_MISMATCH");
    expect(md).toContain("STALE");
    expect(md).toContain("partiallyVerified");
    expect(md).toContain("has_role");
    // Retrieval success must not be conflated with artifact parity success.
    expect(md).not.toContain("VERIFIED_MATCH");
  });
});

describe("registry validation remains complete", () => {
  it("accounts for all 15 Testnet components", () => {
    const prebuiltFiles = new Set(stellarComponents.map((c) => `${c.slug}.wasm`));
    const result = validateVerificationRegistry(stellarComponents, DEPLOYMENTS, prebuiltFiles);
    expect(result.expectedCount).toBe(15);
    expect(result.accountedCount).toBe(15);
    expect(result.errors).toEqual([]);
  });

  it("has exactly one Testnet registry entry per testnet component", () => {
    const testnet = stellarComponents.filter((c) => c.capabilities.testnet);
    expect(testnet).toHaveLength(15);
    for (const component of testnet) {
      const matches = DEPLOYMENTS.filter(
        (d) => d.network === "testnet" && d.componentSlug === component.slug,
      );
      expect(matches).toHaveLength(1);
    }
  });
});
