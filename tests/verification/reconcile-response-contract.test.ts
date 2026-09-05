import { describe, it, expect, vi } from "vitest";
import { createDeploymentSession, serializeDeploymentSession } from "@/lib/verification/deployment-session";

vi.mock("@/lib/verification/testnet-connectivity", () => ({
  diagnoseTestnetConnectivity: async () => ({
    network: "testnet",
    endpoint: "https://soroban-testnet.stellar.org",
    dns: "PASS",
    tls: "PASS",
    https: "PASS",
    http: "PASS",
    httpResponse: "PASS",
    rpc: "PASS",
    rpcTransport: "PASS",
    sorobanRpc: "PASS",
    networkMetadata: "PASS",
    networkPassphrase: "PASS",
    status: "NETWORK_OK",
    observedAt: "2026-01-01T00:00:00.000Z",
    healthMethod: "getHealth",
    networkMethod: "getNetwork",
  }),
}));

vi.mock("@/lib/verification/account-inspection", async () => {
  const actual = await vi.importActual<typeof import("@/lib/verification/account-inspection")>("@/lib/verification/account-inspection");
  return {
    ...actual,
    inspectPublicAccount: async () => ({
      status: "ACCOUNT_READY",
      address: DEPLOYMENT_ACCOUNT,
      nativeBalance: "9999",
      sequenceNumber: "1",
      network: "testnet",
      exists: true,
      sufficientBalance: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    }),
  };
});

const DEPLOYMENT_ACCOUNT = "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW";
const ADMIN = "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW";
const EXPECTED_HASH = "dbc9527173eb86ad1ba2d155a14910062f8c33a871fe59b871aaa83148f0abfd";

describe("reconcile response contract", () => {
  it("successful reconciliation returns session with PREFLIGHT_READY", async () => {
    const session = createDeploymentSession({ artifactHash: EXPECTED_HASH, deploymentAccount: null, constructorAdmin: null });
    const serialized = serializeDeploymentSession(session);
    const { POST } = await import("@/app/api/testnet/deployment-session/reconcile/route.ts");
    const req = new Request("http://localhost:3000/api/testnet/deployment-session/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serialized, account: DEPLOYMENT_ACCOUNT, admin: ADMIN }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      session?: { state: string; previousState: string | null; sessionId: string };
      lifecycleState: string;
      readinessState: string;
      blockingReason: string | null;
    };
    // Must contain authoritative session
    expect(json.session).toBeDefined();
    expect(json.session?.state).toBe("PREFLIGHT_READY");
    expect(json.lifecycleState).toBe("PREFLIGHT_READY");
    expect(json.readinessState).toBe("PREFLIGHT_READY");
    expect(json.blockingReason).toBeNull();
    // Preserve flat fields
    expect(json.session?.sessionId).toBeDefined();
  });

  it("preserves all existing flat fields alongside session", async () => {
    const session = createDeploymentSession({ artifactHash: EXPECTED_HASH, deploymentAccount: null, constructorAdmin: null });
    const serialized = serializeDeploymentSession(session);
    const { POST } = await import("@/app/api/testnet/deployment-session/reconcile/route.ts");
    const req = new Request("http://localhost:3000/api/testnet/deployment-session/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serialized, account: DEPLOYMENT_ACCOUNT, admin: ADMIN }),
    });
    const res = await POST(req);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.readOnly).toBe(true);
    expect(json.network).toBe("testnet");
    expect(json.endpoint).toBe("https://soroban-testnet.stellar.org");
    expect(json).toHaveProperty("lifecycleState");
    expect(json).toHaveProperty("previousState");
    expect(json).toHaveProperty("readinessState");
    expect(json).toHaveProperty("blockingReason");
    expect(json).toHaveProperty("blockingCategory");
    expect(json).toHaveProperty("reconciliationPerformed");
    expect(json).toHaveProperty("session");
    expect(json).toHaveProperty("sessionId");
    expect(json).toHaveProperty("historyLength");
  });
});
