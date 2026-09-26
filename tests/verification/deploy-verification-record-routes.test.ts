import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { verifyCandidateArtifact, getContractWasmByContractId, confirmedTransactionExists, evidencePersistenceMode, readFile, writeFile } = vi.hoisted(() => ({
  verifyCandidateArtifact: vi.fn(),
  getContractWasmByContractId: vi.fn(),
  confirmedTransactionExists: vi.fn(),
  evidencePersistenceMode: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/lib/verification/artifact-provenance", () => ({ verifyCandidateArtifact }));
vi.mock("@/lib/transactions/deployment", () => ({
  canonicalTestnetServer: () => ({ getContractWasmByContractId }),
  confirmedTransactionExists,
}));
vi.mock("@/lib/verification/evidence-persistence", () => ({ evidencePersistenceMode }));
vi.mock("node:fs/promises", () => ({ readFile, writeFile }));

import { POST as _verifyPost } from "@/app/api/transactions/deploy/[action]/route";
async function verifyPost(req: Request) { return _verifyPost(req, { params: Promise.resolve({ action: "verify" }) }); }
async function recordPost(req: Request) { return _verifyPost(req, { params: Promise.resolve({ action: "record" }) }); }

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
});
