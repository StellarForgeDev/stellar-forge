import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { verifyCandidateArtifact, getContractWasmByContractId, confirmedTransactionExists, prepareDeploymentStage, evidencePersistenceMode, readFile, writeFile, buildInvocationArgs } = vi.hoisted(() => ({
  verifyCandidateArtifact: vi.fn(),
  getContractWasmByContractId: vi.fn(),
  confirmedTransactionExists: vi.fn(),
  prepareDeploymentStage: vi.fn(),
  evidencePersistenceMode: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  buildInvocationArgs: vi.fn(),
}));

vi.mock("@/lib/verification/artifact-provenance", () => ({ verifyCandidateArtifact }));
vi.mock("@/lib/transactions/deployment", () => ({
  canonicalTestnetServer: () => ({ getContractWasmByContractId }),
  confirmedTransactionExists,
  prepareDeploymentStage,
}));
vi.mock("@/lib/transactions/args", () => ({ buildInvocationArgs }));
vi.mock("@/lib/verification/evidence-persistence", () => ({ evidencePersistenceMode }));
vi.mock("node:fs/promises", () => ({ readFile, writeFile }));

import { POST as _verifyPost } from "@/app/api/transactions/deploy/[action]/route";
async function verifyPost(req: Request) { return _verifyPost(req, { params: Promise.resolve({ action: "verify" }) }); }
async function recordPost(req: Request) { return _verifyPost(req, { params: Promise.resolve({ action: "record" }) }); }
async function preparePost(req: Request) { return _verifyPost(req, { params: Promise.resolve({ action: "prepare" }) }); }

const CONTRACT = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";
const ACCOUNT = "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW";
const HISTORICAL_HASH = "dbc9527173eb86ad1ba2d155a14910062f8c33a871fe59b871aaa83148f0abfd";
const WASM = Buffer.from("current-candidate-wasm");
const MOCK_CANDIDATE_HASH = createHash("sha256").update(WASM).digest("hex");

function candidate(hash = MOCK_CANDIDATE_HASH) {
  return { status: "CANDIDATE_VERIFIED", actualHash: hash, candidateHash: hash, candidate: {}, verifiedArtifactBytes: WASM };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/transactions/deploy/record", { method: "POST", body: JSON.stringify(body) });
}

const recordBody = {
  network: "testnet",
  componentId: "access-control",
  contractId: CONTRACT,
  uploadTransactionHash: "a".repeat(64),
  deploymentTransactionHash: "b".repeat(64),
  deployer: ACCOUNT,
  constructorArguments: { admin: ACCOUNT },
};

describe("deployment verify and record route boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCandidateArtifact.mockResolvedValue(candidate());
    getContractWasmByContractId.mockResolvedValue(WASM);
    confirmedTransactionExists.mockResolvedValue(true);
    prepareDeploymentStage.mockResolvedValue({ stage: "upload", transactionXdr: "prepared-xdr", simulation: { status: "SUCCESS", latestLedger: 1, result: null } });
    buildInvocationArgs.mockReturnValue({ ok: true, scVals: [] });
    evidencePersistenceMode.mockReturnValue("runtime-non-durable");
    readFile.mockResolvedValue(WASM);
    writeFile.mockResolvedValue(undefined);
  });

  it("verifies fresh RPC WASM against the candidate hash", async () => {
    const response = await verifyPost(new Request("http://localhost/api/transactions/deploy/verify", { method: "POST", body: JSON.stringify({ contractId: CONTRACT }) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.verified).toBe(true);
    expect(body.candidateHash).toBe(MOCK_CANDIDATE_HASH);
    expect(body.deployedHash).toBe(createHash("sha256").update(WASM).digest("hex"));
    expect(getContractWasmByContractId).toHaveBeenCalledWith(CONTRACT);
  });

  it("does not accept historical hash as a substitute for the candidate", async () => {
    getContractWasmByContractId.mockResolvedValue(Buffer.from(HISTORICAL_HASH));
    const response = await verifyPost(new Request("http://localhost/api/transactions/deploy/verify", { method: "POST", body: JSON.stringify({ contractId: CONTRACT }) }));
    expect(response.status).toBe(409);
    expect((await response.json()).verified).toBe(false);
  });

  it.each(["CANDIDATE_MANIFEST_UNAVAILABLE", "CANDIDATE_MISMATCH"])("fails closed when candidate is %s", async (status) => {
    verifyCandidateArtifact.mockResolvedValue({ status, error: "not authorized" });
    const response = await verifyPost(new Request("http://localhost/api/transactions/deploy/verify", { method: "POST", body: JSON.stringify({ contractId: CONTRACT }) }));
    expect(response.status).toBe(409);
    expect(getContractWasmByContractId).not.toHaveBeenCalled();
  });

  it("allows candidate-authorized recording without requiring historical hash equality", async () => {
    const response = await recordPost(request(recordBody));
    expect(response.status).toBe(200);
    expect((await response.json()).verified).toBe(true);
    expect(confirmedTransactionExists).toHaveBeenCalledTimes(2);
  });

  it("blocks candidate mismatch before reading deployed bytes", async () => {
    verifyCandidateArtifact.mockResolvedValue({ status: "CANDIDATE_MISMATCH", actualHash: HISTORICAL_HASH, candidateHash: MOCK_CANDIDATE_HASH, candidate: {} });
    const response = await recordPost(request(recordBody));
    expect(response.status).toBe(409);
    expect(getContractWasmByContractId).not.toHaveBeenCalled();
  });

  it("blocks local artifact mismatch", async () => {
    readFile.mockResolvedValue(Buffer.from("different-local-artifact"));
    const response = await recordPost(request(recordBody));
    expect(response.status).toBe(409);
  });

  it("blocks deployed artifact mismatch", async () => {
    getContractWasmByContractId.mockResolvedValue(Buffer.from("different-deployed-artifact"));
    const response = await recordPost(request(recordBody));
    expect(response.status).toBe(409);
  });

  it.each(["uploadTransactionHash", "deploymentTransactionHash"])("blocks when %s is not confirmed", async (field) => {
    const missingHash = recordBody[field as keyof typeof recordBody];
    confirmedTransactionExists.mockImplementation(async (_server: unknown, hash: string) => hash !== missingHash);
    const response = await recordPost(request(recordBody));
    expect(response.status).toBe(409);
  });

  it("blocks an unconfirmed valid transaction hash", async () => {
    confirmedTransactionExists.mockResolvedValueOnce(false);
    const response = await recordPost(request(recordBody));
    expect(response.status).toBe(409);
    expect(verifyCandidateArtifact).not.toHaveBeenCalled();
  });

  it("blocks invalid public metadata", async () => {
    const response = await recordPost(request({ ...recordBody, deployer: "SSECRET", constructorArguments: { admin: "not-an-account" } }));
    expect(response.status).toBe(400);
    expect(confirmedTransactionExists).not.toHaveBeenCalled();
  });

  it("blocks unavailable candidate before recording", async () => {
    verifyCandidateArtifact.mockResolvedValue({ status: "CANDIDATE_MANIFEST_UNAVAILABLE", error: "missing" });
    const response = await recordPost(request(recordBody));
    expect(response.status).toBe(409);
    expect(getContractWasmByContractId).not.toHaveBeenCalled();
  });

  it("prepares only from the server-authorized candidate", async () => {
    const response = await preparePost(new Request("http://localhost/api/transactions/deploy/prepare", {
      method: "POST",
      body: JSON.stringify({
        network: "testnet",
        component: "access-control",
        stage: "upload",
        sourceAccount: ACCOUNT,
        constructorArgs: { admin: ACCOUNT },
        candidateHash: HISTORICAL_HASH,
        wasm: "client-supplied-wasm-must-not-be-used",
      }),
    }));
    expect(response.status).toBe(200);
    expect(prepareDeploymentStage).toHaveBeenCalledWith(expect.objectContaining({
      stage: "upload",
      sourceAccount: ACCOUNT,
      wasm: WASM,
      wasmHash: MOCK_CANDIDATE_HASH,
    }));
    expect(prepareDeploymentStage.mock.calls[0]?.[0]).not.toHaveProperty("candidateHash");
  });

  it("blocks prepare when the current candidate is unavailable", async () => {
    verifyCandidateArtifact.mockResolvedValue({ status: "CANDIDATE_MANIFEST_UNAVAILABLE", error: "candidate unavailable" });
    const response = await preparePost(new Request("http://localhost/api/transactions/deploy/prepare", {
      method: "POST",
      body: JSON.stringify({ network: "testnet", component: "access-control", stage: "upload", sourceAccount: ACCOUNT, constructorArgs: { admin: ACCOUNT }, candidateHash: MOCK_CANDIDATE_HASH }),
    }));
    expect(response.status).toBe(409);
    expect(prepareDeploymentStage).not.toHaveBeenCalled();
  });

  it("does not let client candidate fields authorize evidence recording", async () => {
    const response = await recordPost(request({ ...recordBody, candidateHash: HISTORICAL_HASH, artifactHash: HISTORICAL_HASH }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.evidence.localArtifactHash).toBe(MOCK_CANDIDATE_HASH);
    expect(body.evidence.deployedArtifactHash).toBe(MOCK_CANDIDATE_HASH);
  });
});
