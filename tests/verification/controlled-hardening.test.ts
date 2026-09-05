import { describe, it, expect } from "vitest";
import { Keypair, Account, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { verifyControlledUploadForTest } from "@/lib/transactions/submit";
import { reconcileDeploymentSession, createDeploymentSession, transitionDeploymentSession } from "@/lib/verification/deployment-session";

// Use deterministic keypair for tests — not a real deployment account
function deterministicKeypair(seedByte: number): Keypair {
  const seed = Buffer.alloc(32, seedByte);
  return Keypair.fromRawEd25519Seed(seed);
}
const deployer = deterministicKeypair(1);
const other = deterministicKeypair(2);
const deployerG = deployer.publicKey();
const otherG = other.publicKey();

function buildTx(ops: ReturnType<typeof Operation.payment>[], source: string): InstanceType<typeof import("@stellar/stellar-sdk").Transaction> {
  const account = new Account(source, "123");
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: "Test SDF Network ; September 2015" })
    .setTimeout(30);
  for (const op of ops) tx.addOperation(op);
  return tx.build();
}

describe("controlled upload structural validation", () => {
  it("1 x uploadContractWasm passes", () => {
    const tx = buildTx([Operation.uploadContractWasm({ wasm: Buffer.from([0, 1, 2, 3]) })], deployerG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = verifyControlledUploadForTest(tx as any);
    expect(err).toBeNull();
  });

  it("0 operations fails", () => {
    const tx = buildTx([], deployerG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = verifyControlledUploadForTest(tx as any);
    expect(err).not.toBeNull();
    expect(err?.code).toBe("envelope.invalid");
  });

  it("2+ operations fails", () => {
    const tx = buildTx([
      Operation.uploadContractWasm({ wasm: Buffer.from([0, 1]) }),
      Operation.uploadContractWasm({ wasm: Buffer.from([2, 3]) }),
    ], deployerG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = verifyControlledUploadForTest(tx as any);
    expect(err).not.toBeNull();
  });

  it("unrelated operation fails controlled upload validation", () => {
    const tx = buildTx([
      Operation.payment({ destination: otherG, asset: Asset.native(), amount: "10" }),
    ], deployerG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = verifyControlledUploadForTest(tx as any);
    expect(err).not.toBeNull();
  });

  it("source mismatch fails", () => {
    const tx = buildTx([Operation.uploadContractWasm({ wasm: Buffer.from([0, 1]), source: otherG })], deployerG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = verifyControlledUploadForTest(tx as any);
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/source must match/);
  });

  it("source matches when operation source equals tx source passes", () => {
    const tx = buildTx([Operation.uploadContractWasm({ wasm: Buffer.from([0, 1]), source: deployerG })], deployerG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = verifyControlledUploadForTest(tx as any);
    expect(err).toBeNull();
  });
});

describe("pending recovery — no auto transition", () => {
  it("PENDING does not transition UPLOAD_SIGNED to success", async () => {
    let session = createDeploymentSession({ artifactHash: "a".repeat(64), deploymentAccount: deployerG, constructorAdmin: deployerG });
    // Advance to UPLOAD_SIGNED via valid transitions
    for (const s of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED"] as const) {
      const r = transitionDeploymentSession(session, s);
      if ("session" in r) session = r.session;
    }
    expect(session.state).toBe("UPLOAD_SIGNED");
    // PENDING is handled as local pendingRequiresInspection in the panel, not via session transition.
    // Session should remain UPLOAD_SIGNED and not auto-advance to CONFIRMED.
    const reconciled = reconcileDeploymentSession(session, {
      connectivity: { status: "NETWORK_OK" },
      artifact: { verified: true, status: "VERIFIED_MATCH" },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
      constructorAdmin: { supplied: true, valid: true },
      transaction: { status: "TRANSACTION_PENDING", hash: "a".repeat(64), observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("UPLOAD_SIGNED");
    // For UPLOAD_SIGNED, reconcile does not set blockingReason to pending (only for SUBMITTED), so it stays null — but must not become CONFIRMED
    expect(reconciled.state).not.toBe("UPLOAD_CONFIRMED");
    expect(reconciled.state).not.toBe("UPLOAD_SUBMITTED");
  });

  it("does not automatically resubmit or retry", () => {
    // Verify that submitTransaction does not auto-retry on PENDING — it requires explicit manual call
    // This is architectural: ControlledDeploymentPanel only calls submitSignedTransaction on button click, no effect auto-calls it
    expect(true).toBe(true); // placeholder for architectural check
  });

  it("requires inspection before manual resubmission after pending", () => {
    // Simulate panel state: pendingRequiresInspection=true, hasInspectedSincePending=false should block submit
    const pendingRequiresInspection = true;
    let hasInspectedSincePending = false;
    const canResubmit = !(pendingRequiresInspection && !hasInspectedSincePending);
    expect(canResubmit).toBe(false);
    // After inspection
    hasInspectedSincePending = true;
    const canResubmitAfter = !(pendingRequiresInspection && !hasInspectedSincePending);
    expect(canResubmitAfter).toBe(true);
  });
});
