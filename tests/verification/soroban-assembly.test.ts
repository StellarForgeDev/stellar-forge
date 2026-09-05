import { describe, expect, it } from "vitest";
import {
  Account,
  BASE_FEE,
  Keypair,
  Operation,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Api } from "@stellar/stellar-sdk/rpc";
import { assembleAndValidateUploadTransaction, controlledTestnetRpcUrl } from "@/lib/transactions/deployment";

const passphrase = "Test SDF Network ; September 2015";
const keypair = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41));
const source = keypair.publicKey();

function rawUpload(): Transaction {
  return new TransactionBuilder(new Account(source, "17"), {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .setTimeout(30)
    .addOperation(Operation.uploadContractWasm({ wasm: Buffer.from([0, 1, 2, 3]) }))
    .build();
}

function simulation(options: { footprint?: boolean; transactionData?: object } = {}): Api.SimulateTransactionResponse {
  const footprintKey = xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 7) }),
  );
  const data = options.transactionData ?? new SorobanDataBuilder()
    .setResourceFee("5000")
    .setResources(1000, 2000, 3000)
    .setFootprint(options.footprint === false ? [] : [footprintKey], [])
    .build();
  return {
    _parsed: true,
    id: "offline-test",
    latestLedger: 123,
    events: [],
    transactionData: data instanceof SorobanDataBuilder ? data : { build: () => data },
    minResourceFee: "5000",
    result: { auth: [], retval: null },
  } as unknown as Api.SimulateTransactionResponse;
}

describe("controlled Soroban upload assembly", () => {
  it("fails closed when assembly throws and never returns raw XDR", () => {
    const result = assembleAndValidateUploadTransaction(
      rawUpload(),
      simulation({ transactionData: { build: () => { throw new Error("assembly test failure"); } } }),
      source,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCategory).toBe("ASSEMBLY_FAILED");
      expect(result.error).toMatch(/assembly failed/i);
      expect("transactionXdr" in result).toBe(false);
    }
  });

  it("returns only an assembled upload with Soroban data, footprint, fee, and unchanged source", () => {
    const raw = rawUpload();
    const result = assembleAndValidateUploadTransaction(raw, simulation(), source);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const envelope = result.transaction.toEnvelope().v1().tx();
      const sorobanData = envelope.ext().value();
      expect(sorobanData).not.toBeNull();
      if (!sorobanData) throw new Error("test fixture did not produce Soroban transaction data");
      expect(sorobanData.resources().footprint().readOnly().length + sorobanData.resources().footprint().readWrite().length).toBeGreaterThan(0);
      expect(sorobanData.resourceFee().toBigInt() > BigInt(0)).toBe(true);
      expect(result.transaction.source).toBe(source);
      expect(result.transaction.operations).toHaveLength(1);
      expect(result.transaction.operations[0].type).toBe("invokeHostFunction");
      const operation = result.transaction.operations[0] as unknown as { func: { _switch: { name: string } } };
      expect(operation.func._switch.name).toBe("hostFunctionTypeUploadContractWasm");
      expect(result.transaction.toXDR()).not.toBe(raw.toXDR());
    }
  });

  it("rejects an assembled upload without a footprint", () => {
    const result = assembleAndValidateUploadTransaction(rawUpload(), simulation({ footprint: false }), source);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/footprint/i);
  });

  it("rejects a missing Soroban transaction data response", () => {
    const result = assembleAndValidateUploadTransaction(rawUpload(), simulation({ transactionData: { build: () => { throw new Error("missing data"); } } }), source);
    expect(result.ok).toBe(false);
  });

  it("preserves Soroban data through local signed-XDR round trip", () => {
    const result = assembleAndValidateUploadTransaction(rawUpload(), simulation(), source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      result.transaction.sign(keypair);
      const roundTripped = TransactionBuilder.fromXDR(result.transaction.toXDR(), passphrase);
      const before = result.transaction.toEnvelope().v1().tx().ext().value();
      const after = roundTripped.toEnvelope().v1().tx().ext().value();
      expect(after).not.toBeNull();
      if (!before || !after) throw new Error("test fixture lost Soroban transaction data");
      expect(after.resources().footprint().readOnly().length + after.resources().footprint().readWrite().length).toBe(
        before.resources().footprint().readOnly().length + before.resources().footprint().readWrite().length,
      );
      expect(after.resourceFee().toString()).toBe(before.resourceFee().toString());
    }
  });
});

describe("controlled endpoint pinning", () => {
  it("uses the canonical Testnet URL independently of an environment override", () => {
    const original = process.env.STELLAR_RPC_TESTNET_URL;
    process.env.STELLAR_RPC_TESTNET_URL = "https://example.invalid";
    try {
      expect(controlledTestnetRpcUrl()).toBe("https://soroban-testnet.stellar.org");
    } finally {
      if (original === undefined) delete process.env.STELLAR_RPC_TESTNET_URL;
      else process.env.STELLAR_RPC_TESTNET_URL = original;
    }
  });
});
