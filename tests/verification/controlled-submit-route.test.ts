import { createHash } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Account, Address, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const { submitTransaction, verifyCandidateArtifact } = vi.hoisted(() => ({ submitTransaction: vi.fn(), verifyCandidateArtifact: vi.fn() }));

vi.mock("@/lib/transactions/submit", () => ({ submitTransaction }));
vi.mock("@/lib/verification/artifact-provenance", () => ({ verifyCandidateArtifact }));

import { POST } from "@/app/api/transactions/submit/route";

function candidate(hash: string) {
  return { status: "CANDIDATE_VERIFIED", actualHash: hash, candidateHash: hash, candidate: {} , verifiedArtifactBytes: Buffer.from("candidate") };
}

function signedUpload(wasm: Buffer): string {
  const keypair = Keypair.random();
  const tx = new TransactionBuilder(new Account(keypair.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .setTimeout(300)
    .addOperation(Operation.uploadContractWasm({ wasm, source: keypair.publicKey() }))
    .build();
  tx.sign(keypair);
  return tx.toXDR();
}

function signedCreate(hash: Buffer): string {
  const keypair = Keypair.random();
  const tx = new TransactionBuilder(new Account(keypair.publicKey(), "2"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .setTimeout(300)
    .addOperation(Operation.createCustomContract({ address: new Address(keypair.publicKey()), wasmHash: hash, constructorArgs: [], source: keypair.publicKey() }))
    .build();
  tx.sign(keypair);
  return tx.toXDR();
}

async function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/transactions/submit", { method: "POST", body: JSON.stringify(body) }));
}

describe("controlled submission candidate boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitTransaction.mockResolvedValue({ ok: true, submission: { status: "PENDING", transactionHash: "a".repeat(64) } });
  });

  it("allows a controlled upload whose embedded WASM matches the current candidate", async () => {
    const wasm = Buffer.from("candidate-upload");
    const hash = createHash("sha256").update(wasm).digest("hex");
    verifyCandidateArtifact.mockResolvedValue(candidate(hash));
    const response = await post({ network: "testnet", signedXdr: signedUpload(wasm), controlledDeployment: true });
    expect(response.status).toBe(200);
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects stale controlled upload before submission", async () => {
    const current = createHash("sha256").update("current").digest("hex");
    verifyCandidateArtifact.mockResolvedValue(candidate(current));
    const response = await post({ network: "testnet", signedXdr: signedUpload(Buffer.from("stale")), controlledDeployment: true });
    expect(response.status).toBe(409);
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("allows a controlled create referencing the current candidate hash", async () => {
    const hash = Buffer.alloc(32, 9);
    verifyCandidateArtifact.mockResolvedValue(candidate(hash.toString("hex")));
    const response = await post({ network: "testnet", signedXdr: signedCreate(hash), controlledDeployment: true });
    expect(response.status).toBe(200);
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a controlled create referencing a stale candidate hash", async () => {
    verifyCandidateArtifact.mockResolvedValue(candidate(Buffer.alloc(32, 2).toString("hex")));
    const response = await post({ network: "testnet", signedXdr: signedCreate(Buffer.alloc(32, 1)), controlledDeployment: true });
    expect(response.status).toBe(409);
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it.each(["CANDIDATE_MANIFEST_UNAVAILABLE", "CANDIDATE_MISMATCH"])("rejects controlled submission when candidate status is %s", async (status) => {
    verifyCandidateArtifact.mockResolvedValue({ status, error: "candidate unavailable" });
    const response = await post({ network: "testnet", signedXdr: signedUpload(Buffer.from("candidate")), controlledDeployment: true });
    expect(response.status).toBe(409);
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it("leaves normal submission on the existing submission path", async () => {
    const response = await post({ network: "testnet", signedXdr: "AAAA", controlledDeployment: false });
    expect(response.status).toBe(200);
    expect(verifyCandidateArtifact).not.toHaveBeenCalled();
    expect(submitTransaction).toHaveBeenCalledWith({ network: "testnet", signedXdr: "AAAA", controlledDeployment: false });
  });

  it("preserves invalid-network and secret-field validation", async () => {
    expect((await post({ network: "mainnet", signedXdr: "AAAA", controlledDeployment: true })).status).toBe(400);
    expect((await post({ network: "testnet", signedXdr: "AAAA", secretKey: "SSECRET" })).status).toBe(400);
    expect(submitTransaction).not.toHaveBeenCalled();
  });
});
