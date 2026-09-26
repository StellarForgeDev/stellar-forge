import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Account, Address, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { validateControlledDeploymentTransaction } from "@/lib/verification/controlled-deployment-transaction";

function buildUpload(wasm: Buffer): string {
  const keypair = Keypair.random();
  return new TransactionBuilder(new Account(keypair.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .setTimeout(300)
    .addOperation(Operation.uploadContractWasm({ wasm, source: keypair.publicKey() }))
    .build()
    .toXDR();
}

function buildCreate(wasmHash: Buffer): string {
  const keypair = Keypair.random();
  return new TransactionBuilder(new Account(keypair.publicKey(), "2"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .setTimeout(300)
    .addOperation(Operation.createCustomContract({ address: new Address(keypair.publicKey()), wasmHash, constructorArgs: [], source: keypair.publicKey() }))
    .build()
    .toXDR();
}

describe("controlled deployment signed-artifact binding", () => {
  it("accepts upload XDR only when embedded WASM matches the candidate hash", () => {
    const wasm = Buffer.from("candidate-wasm");
    const hash = createHash("sha256").update(wasm).digest("hex");
    const result = validateControlledDeploymentTransaction(buildUpload(wasm), hash);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.stage).toBe("upload");
  });

  it("rejects stale upload XDR", () => {
    const result = validateControlledDeploymentTransaction(buildUpload(Buffer.from("old")), createHash("sha256").update("new").digest("hex"));
    expect(result.ok).toBe(false);
  });

  it("accepts create XDR only when its referenced WASM hash matches", () => {
    const hash = Buffer.alloc(32, 7);
    const result = validateControlledDeploymentTransaction(buildCreate(hash), hash.toString("hex"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.stage).toBe("create");
  });

  it("rejects create XDR referencing a stale WASM hash", () => {
    const result = validateControlledDeploymentTransaction(buildCreate(Buffer.alloc(32, 1)), Buffer.alloc(32, 2).toString("hex"));
    expect(result.ok).toBe(false);
  });
});
