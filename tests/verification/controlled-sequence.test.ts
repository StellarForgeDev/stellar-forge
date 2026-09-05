import { describe, expect, it, vi } from "vitest";
import {
  Account,
  Keypair,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { prepareDeploymentStage } from "@/lib/transactions/deployment";

const passphrase = "Test SDF Network ; September 2015";
const keypair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 43));
const source = keypair.publicKey();

function successfulSimulation(): Api.SimulateTransactionResponse {
  const footprintKey = xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 9) }),
  );
  const data = new SorobanDataBuilder()
    .setResourceFee("5000")
    .setResources(1000, 2000, 3000)
    .setFootprint([footprintKey], [])
    .build();
  return {
    _parsed: true,
    id: "offline-sequence-test",
    latestLedger: 456,
    events: [],
    transactionData: { build: () => data },
    minResourceFee: "5000",
    result: { auth: [], retval: null },
  } as unknown as Api.SimulateTransactionResponse;
}

describe("controlled deployment account sequence", () => {
  it("fetches and uses the current account sequence before simulation", async () => {
    const getAccount = vi.spyOn(Server.prototype, "getAccount")
      .mockResolvedValue(new Account(source, "19038937188139017"));
    const simulate = vi.spyOn(Server.prototype, "simulateTransaction")
      .mockResolvedValue(successfulSimulation());

    try {
      const result = await prepareDeploymentStage({
        stage: "upload",
        network: "testnet",
        sourceAccount: source,
        wasm: Buffer.from([0, 1, 2, 3]),
        wasmHash: "00".repeat(32),
      });

      expect(getAccount).toHaveBeenCalledWith(source);
      expect(simulate).toHaveBeenCalledOnce();
      expect(result).toHaveProperty("stage", "upload");
      if ("transactionXdr" in result) {
        const tx = TransactionBuilder.fromXDR(result.transactionXdr, passphrase) as Transaction;
        // TransactionBuilder uses the next sequence after the account's current sequence.
        expect(tx.sequence).toBe("19038937188139018");
      }
    } finally {
      getAccount.mockRestore();
      simulate.mockRestore();
    }
  });

  it("fails closed when account sequence lookup fails and never simulates with sequence zero", async () => {
    const getAccount = vi.spyOn(Server.prototype, "getAccount")
      .mockRejectedValue(new Error("account lookup unavailable"));
    const simulate = vi.spyOn(Server.prototype, "simulateTransaction");

    try {
      const result = await prepareDeploymentStage({
        stage: "upload",
        network: "testnet",
        sourceAccount: source,
        wasm: Buffer.from([0, 1, 2, 3]),
        wasmHash: "00".repeat(32),
      });

      expect(result).toMatchObject({
        status: "FAILED",
        errorCategory: "ACCOUNT_LOOKUP_FAILED",
      });
      expect(simulate).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain('"0"');
    } finally {
      getAccount.mockRestore();
      simulate.mockRestore();
    }
  });

  it("performs a fresh account lookup for each preparation", async () => {
    const sequences = ["41", "42"];
    const getAccount = vi.spyOn(Server.prototype, "getAccount")
      .mockImplementation(async () => new Account(source, sequences.shift() ?? "99"));
    const simulate = vi.spyOn(Server.prototype, "simulateTransaction")
      .mockResolvedValue(successfulSimulation());

    try {
      const input = {
        stage: "upload" as const,
        network: "testnet" as const,
        sourceAccount: source,
        wasm: Buffer.from([0, 1, 2, 3]),
        wasmHash: "00".repeat(32),
      };
      const first = await prepareDeploymentStage(input);
      const second = await prepareDeploymentStage(input);

      expect(getAccount).toHaveBeenCalledTimes(2);
      expect("transactionXdr" in first).toBe(true);
      expect("transactionXdr" in second).toBe(true);
      if ("transactionXdr" in first && "transactionXdr" in second) {
        expect((TransactionBuilder.fromXDR(first.transactionXdr, passphrase) as Transaction).sequence).toBe("42");
        expect((TransactionBuilder.fromXDR(second.transactionXdr, passphrase) as Transaction).sequence).toBe("43");
      }
    } finally {
      getAccount.mockRestore();
      simulate.mockRestore();
    }
  });
});
