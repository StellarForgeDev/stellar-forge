import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET as getReadiness } from "@/app/api/testnet/readiness/route";
import { GET as getReconcile } from "@/app/api/testnet/deployment-session/reconcile/route";
import { POST as _postPrepare } from "@/app/api/transactions/deploy/[action]/route";
async function postPrepare(req: Request) { return _postPrepare(req, { params: Promise.resolve({ action: "prepare" }) }); }

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

const mockCandidateVerify = vi.fn();
vi.mock("@/lib/verification/artifact-provenance", () => ({
  verifyCandidateArtifact: (...args: unknown[]) => mockCandidateVerify(...args),
  verifyHistoricalArtifact: async () => ({ status: "VERIFIED_MATCH", wasmHash: "historical-hash", evidenceHash: "historical-hash" }),
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
    mockCandidateVerify.mockResolvedValue({ status: "CANDIDATE_VERIFIED", actualHash: "dummy-hash", candidateHash: "dummy-hash", candidate: {} });

    // Readiness
    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness?account=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW&admin=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW"));
    const readinessBody = await readinessRes.json();

    expect(readinessBody.gates.artifact.status).toBe("PASS");
    expect(readinessBody.finalReadiness).toBe("READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT");

    // Reconciliation
    const reconcileRes = await getReconcile(new Request("http://localhost/api/testnet/deployment-session/reconcile"));
    const reconcileBody = await reconcileRes.json();
    expect(reconcileBody.artifact.verified).toBe(true);
    expect(reconcileBody.artifact.status).toBe("CANDIDATE_VERIFIED");

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
    mockCandidateVerify.mockResolvedValue({ status: "CANDIDATE_MISMATCH", actualHash: "different", candidateHash: "dummy-hash", candidate: {} });

    // Readiness
    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness?account=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW&admin=GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW"));
    const readinessBody = await readinessRes.json();
    expect(readinessBody.gates.artifact.status).toBe("FAIL");
    expect(readinessBody.finalReadiness).toBe("NOT_READY");

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
    mockCandidateVerify.mockResolvedValue({ status: "ARTIFACT_UNAVAILABLE", error: "Missing wasm" });

    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness"));
    const readinessBody = await readinessRes.json();
    expect(readinessBody.finalReadiness).toBe("NOT_READY");

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
    mockCandidateVerify.mockResolvedValue({ status: "CANDIDATE_MANIFEST_UNAVAILABLE", error: "Missing evidence" });

    const readinessRes = await getReadiness(new Request("http://localhost/api/testnet/readiness"));
    const readinessBody = await readinessRes.json();
    expect(readinessBody.finalReadiness).toBe("NOT_READY");

    const reconcileRes = await getReconcile(new Request("http://localhost/api/testnet/deployment-session/reconcile"));
    const reconcileBody = await reconcileRes.json();
    expect(reconcileBody.artifact.status).toBe("CANDIDATE_MANIFEST_UNAVAILABLE");

    const prepareReq = new Request("http://localhost/api/transactions/deploy/prepare", {
      method: "POST",
      body: JSON.stringify({ component: "access-control", stage: "upload", network: "testnet", sourceAccount: "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW", constructorArgs: {} })
    });
    const prepareRes = await postPrepare(prepareReq);
    expect(prepareRes.status).toBe(409);
  });
});
