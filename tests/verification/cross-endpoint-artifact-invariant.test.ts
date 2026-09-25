import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET as getReadiness } from "@/app/api/testnet/readiness/route";
import { GET as getReconcile } from "@/app/api/testnet/deployment-session/reconcile/route";
import { POST as postPrepare } from "@/app/api/transactions/deploy/prepare/route";

vi.mock("@/lib/verification/testnet-connectivity", () => ({
  diagnoseTestnetConnectivity: async () => ({
    status: "NETWORK_OK",
    endpoint: "https://soroban-testnet.stellar.org",
    networkPassphrase: "PASS"
  })
}));

vi.mock("@/lib/verification/account-inspection", () => ({
  inspectPublicAccount: async () => ({
    status: "ACCOUNT_READY",
    exists: true,
    sufficientBalance: true
  }),
  createTestnetAccountReader: vi.fn()
}));

const mockVerify = vi.fn();
vi.mock("@/lib/verification/artifact-evidence-verification", () => ({
  verifyArtifactEvidence: (...args: unknown[]) => mockVerify(...args)
}));

vi.mock("@/lib/transactions/deployment", () => ({
  prepareDeploymentStage: async () => ({ status: "SIMULATED", stage: "upload" }),
  canonicalTestnetServer: {},
  confirmedTransactionExists: async () => false
}));



import * as fsPromises from "node:fs/promises";
vi.mock("node:fs/promises");

describe("Cross-Endpoint Artifact Invariant", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.spyOn(fsPromises, "readFile").mockImplementation(async (filePath: unknown) => {
      const pathStr = typeof filePath === "string" ? filePath : "";
      if (pathStr.endsWith("testnet-evidence.json")) {
        return JSON.stringify({
          evidence: [{
            componentId: "access-control",
            status: ["VERIFIED_MATCH"],
            sourceArtifact: { sha256: "dummy-hash" },
            prebuiltArtifact: { sha256: "dummy-hash" }
          }]
        });
      }
      return "{}";
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Current artifact matches evidence (all PASS)", async () => {
    mockVerify.mockResolvedValue({ status: "VERIFIED_MATCH", wasmHash: "dummy-hash", evidenceHash: "dummy-hash" });

    // Readiness
    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness?account=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW&admin=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW"));
    const readinessBody = await readinessRes.json();

    expect(readinessBody.gates.artifact.status).toBe("PASS");
    expect(readinessBody.finalReadiness).toBe("READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT");

    // Reconciliation
    const reconcileRes = await getReconcile(new Request("http://localhost/api/testnet/deployment-session/reconcile"));
    const reconcileBody = await reconcileRes.json();
    expect(reconcileBody.artifact.verified).toBe(true);
    expect(reconcileBody.artifact.status).toBe("VERIFIED_MATCH");

    // Prepare
    const prepareReq = new Request("http://localhost/api/transactions/deploy/prepare", {
      method: "POST",
      body: JSON.stringify({ component: "access-control", stage: "upload", network: "testnet", sourceAccount: "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW", constructorArgs: { admin: "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW" } })
    });
    const prepareRes = await postPrepare(prepareReq);
    if (prepareRes.status !== 200) {
      console.log(await prepareRes.json());
    }
    expect(prepareRes.status).toBe(200);
  });

  it("2. Current artifact mismatches evidence (BLOCKED / 409)", async () => {
    mockVerify.mockResolvedValue({ status: "LOCAL_ARTIFACT_MISMATCH", wasmHash: "different", evidenceHash: "dummy-hash", error: "Mismatch" });

    // Readiness
    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness?account=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW&admin=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW"));
    const readinessBody = await readinessRes.json();
    expect(readinessBody.gates.artifact.status).toBe("FAIL");
    expect(readinessBody.finalReadiness).toBe("LOCAL_ARTIFACT_MISMATCH");

    // Reconciliation
    const reconcileRes = await getReconcile(new Request("http://localhost/api/testnet/deployment-session/reconcile"));
    const reconcileBody = await reconcileRes.json();
    expect(reconcileBody.artifact.verified).toBe(false);
    expect(reconcileBody.lifecycleState).not.toBe("PREFLIGHT_READY");

    // Prepare
    const prepareReq = new Request("http://localhost/api/transactions/deploy/prepare", {
      method: "POST",
      body: JSON.stringify({ component: "access-control", stage: "upload", network: "testnet", sourceAccount: "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW", constructorArgs: {} })
    });
    const prepareRes = await postPrepare(prepareReq);
    expect(prepareRes.status).toBe(409);
  });

  it("3. Missing artifact", async () => {
    mockVerify.mockResolvedValue({ status: "ARTIFACT_UNAVAILABLE", error: "Missing wasm" });

    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness"));
    const readinessBody = await readinessRes.json();
    expect(readinessBody.finalReadiness).toBe("ARTIFACT_UNAVAILABLE");

    const reconcileRes = await getReconcile(new Request("http://localhost/api/testnet/deployment-session/reconcile"));
    const reconcileBody = await reconcileRes.json();
    expect(reconcileBody.artifact.status).toBe("ARTIFACT_UNAVAILABLE");

    const prepareReq = new Request("http://localhost/api/transactions/deploy/prepare", {
      method: "POST",
      body: JSON.stringify({ component: "access-control", stage: "upload", network: "testnet", sourceAccount: "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW", constructorArgs: {} })
    });
    const prepareRes = await postPrepare(prepareReq);
    expect(prepareRes.status).toBe(409);
  });

  it("4. Missing evidence", async () => {
    mockVerify.mockResolvedValue({ status: "EVIDENCE_UNAVAILABLE", error: "Missing evidence" });

    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness"));
    const readinessBody = await readinessRes.json();
    expect(readinessBody.finalReadiness).toBe("EVIDENCE_UNAVAILABLE");

    const reconcileRes = await getReconcile(new Request("http://localhost/api/testnet/deployment-session/reconcile"));
    const reconcileBody = await reconcileRes.json();
    expect(reconcileBody.artifact.status).toBe("EVIDENCE_UNAVAILABLE");

    const prepareReq = new Request("http://localhost/api/transactions/deploy/prepare", {
      method: "POST",
      body: JSON.stringify({ component: "access-control", stage: "upload", network: "testnet", sourceAccount: "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW", constructorArgs: {} })
    });
    const prepareRes = await postPrepare(prepareReq);
    expect(prepareRes.status).toBe(409);
  });
});
