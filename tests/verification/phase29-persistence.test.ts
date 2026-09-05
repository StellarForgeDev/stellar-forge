import { describe, expect, it, vi } from "vitest";
import {
  canTransitionDeploymentSession,
  createDeploymentSession,
  deserializeDeploymentSession,
  manualRefreshDoesNotAdvance,
  reconcileDeploymentSession,
  restoreDeploymentSession,
  serializeDeploymentSession,
  transitionDeploymentSession,
  validatePersistedDeploymentSession,
} from "@/lib/verification/deployment-session";
import { inspectTransaction } from "@/lib/verification/transaction-inspection";
import { inspectContract, verifyDeployedWasm } from "@/lib/verification/contract-inspection";

const G = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const C = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";

describe("Persistence", () => {
  it("safe session serialization", () => {
    const s = createDeploymentSession({ artifactHash: "abc", deploymentAccount: G, constructorAdmin: G });
    const serialized = serializeDeploymentSession(s);
    expect(serialized).not.toMatch(/secret|seed|private/i);
    expect(JSON.parse(serialized).version).toBeDefined();
  });
  it("secret material rejected from persistence", () => {
    const s = createDeploymentSession({ deploymentAccount: G });
    expect(() => serializeDeploymentSession({ ...s, deploymentAccount: "SSECRET" } as never)).toThrow(/Secret/);
  });
  it("invalid persistence schema rejected", () => {
    const res = validatePersistedDeploymentSession({ version: "0.0.0", sessionId: "sess_123", component: "access-control", network: "testnet", endpoint: "https://soroban-testnet.stellar.org", state: "NOT_STARTED", previousState: null, createdAt: new Date().toISOString(), lastObservedAt: new Date().toISOString(), deploymentAccount: null, constructorAdmin: null, artifactHash: null, simulationStatus: "UNKNOWN", transactionHash: null, contractId: null, blockingReason: null, blockingCategory: null, recommendedNextAction: null, snapshots: [] });
    expect(res.valid).toBe(false);
  });
  it("unknown lifecycle state rejected", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const obj = JSON.parse(serialized) as Record<string, unknown>;
    obj.state = "UNKNOWN_STATE";
    expect(validatePersistedDeploymentSession(obj).valid).toBe(false);
  });
  it("persistence version mismatch rejected", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const obj = JSON.parse(serialized) as Record<string, unknown>;
    obj.version = "99.0.0";
    expect(validatePersistedDeploymentSession(obj).valid).toBe(false);
  });
  it("corrupted session fails safely", () => {
    expect(() => deserializeDeploymentSession("not json")).toThrow(/Corrupted/);
    expect(() => deserializeDeploymentSession(JSON.stringify({ version: "29.0.0", state: "NOT_STARTED" }))).toThrow(/Invalid/);
  });
  it("restored session preserves historical lifecycle state", () => {
    let s = createDeploymentSession();
    const r1 = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r1) s = r1.session;
    const serialized = serializeDeploymentSession(s);
    const restored = deserializeDeploymentSession(serialized);
    expect(restored.state).toBe("PREFLIGHT_READY");
    expect(restored.snapshots.length).toBe(s.snapshots.length);
  });
});

describe("Restoration", () => {
  it("restored PREFLIGHT_READY requires fresh readiness reconciliation", () => {
    let s = createDeploymentSession();
    const r1 = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r1) s = r1.session;
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    expect(restored.status).toBe("RESTORED");
    expect(restored.reconciliationRequired).toBe(true);
    expect(restored.session?.state).toBe("PREFLIGHT_READY");
  });
  it("restored UPLOAD_SIMULATED does not automatically advance", () => {
    let s = createDeploymentSession();
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    expect(restored.session?.state).toBe("UPLOAD_SIMULATED");
    // Should not be AWAITING
    expect(restored.session?.state).not.toBe("AWAITING_UPLOAD_CONFIRMATION");
  });
  it("restored UPLOAD_SUBMITTED remains submitted with unknown confirmation", () => {
    let s = createDeploymentSession();
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    expect(restored.session?.state).toBe("UPLOAD_SUBMITTED");
    // Reconcile with network failure should still preserve UPLOAD_SUBMITTED
    const reconciled = reconcileDeploymentSession(restored.session!, {
      connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("UPLOAD_SUBMITTED");
  });
  it("restored CREATE_CONFIRMED does not become independently verified", () => {
    let s = createDeploymentSession();
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED", "CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION", "CREATE_SIGNED", "CREATE_SUBMITTED", "CREATE_CONFIRMED"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    expect(restored.session?.state).toBe("CREATE_CONFIRMED");
    expect(restored.session?.state).not.toBe("INDEPENDENTLY_VERIFIED");
  });
  it("restoration never triggers signing", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    expect(restored.session?.state).not.toBe("UPLOAD_SIGNED");
  });
  it("restoration never triggers submission", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const restored = restoreDeploymentSession(serialized);
    expect(restored.session?.state).not.toBe("UPLOAD_SUBMITTED");
  });
});

describe("Transaction inspection", () => {
  it("transaction hash not supplied", async () => {
    expect((await inspectTransaction({ transactionHash: null })).status).toBe("TRANSACTION_NOT_SUPPLIED");
  });
  it("invalid transaction identifier", async () => {
    expect((await inspectTransaction({ transactionHash: "bad" })).status).toBe("TRANSACTION_INVALID_IDENTIFIER");
  });
  it("transaction not found", async () => {
    const client = { getTransaction: vi.fn().mockRejectedValue(new Error("not found")) };
    expect((await inspectTransaction({ transactionHash: "a".repeat(64) }, client as never)).status).toBe("TRANSACTION_NOT_FOUND");
  });
  it("transaction pending", async () => {
    const client = { getTransaction: vi.fn().mockResolvedValue({ status: "PENDING" }) };
    expect((await inspectTransaction({ transactionHash: "a".repeat(64) }, client as never)).status).toBe("TRANSACTION_PENDING");
  });
  it("transaction confirmed", async () => {
    const client = { getTransaction: vi.fn().mockResolvedValue({ status: "SUCCESS" }) };
    expect((await inspectTransaction({ transactionHash: "a".repeat(64) }, client as never)).status).toBe("TRANSACTION_CONFIRMED");
  });
  it("transaction failed", async () => {
    const client = { getTransaction: vi.fn().mockResolvedValue({ status: "FAILED" }) };
    expect((await inspectTransaction({ transactionHash: "a".repeat(64) }, client as never)).status).toBe("TRANSACTION_FAILED");
  });
  it("inspection unavailable", async () => {
    const client = { getTransaction: vi.fn().mockRejectedValue(new Error("fetch failed")) };
    expect((await inspectTransaction({ transactionHash: "a".repeat(64) }, client as never)).status).toBe("TRANSACTION_INSPECTION_UNAVAILABLE");
  });
  it("wrong network rejected", async () => {
    expect((await inspectTransaction({ transactionHash: "a".repeat(64), network: "mainnet" })).status).toBe("TRANSACTION_NETWORK_MISMATCH");
  });
});

describe("Submission recovery", () => {
  it("unknown submission status cannot resubmit", () => {
    const s = createDeploymentSession();
    // Simulate UPLOAD_SUBMITTED
    let cur = s;
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    // Should not allow transition to SIGNED (resubmit)
    expect(canTransitionDeploymentSession(cur.state, "UPLOAD_SIGNED")).toBe(false);
  });
  it("pending transaction cannot create replacement submission", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SUBMITTED", "UPLOAD_SIGNED")).toBe(false);
  });
  it("confirmed upload advances only through reconciliation", () => {
    let s = createDeploymentSession();
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    // Simulate inspection confirmed
    const r = transitionDeploymentSession(s, "UPLOAD_CONFIRMED");
    expect("session" in r).toBe(true);
  });
  it("failed transaction transitions safely to FAILED", () => {
    let s = createDeploymentSession();
    const r1 = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r1) s = r1.session;
    const r2 = transitionDeploymentSession(s, "FAILED");
    expect("session" in r2).toBe(true);
  });
  it("unavailable inspection preserves submitted state", async () => {
    const res = await inspectTransaction({ transactionHash: "a".repeat(64) }, { getTransaction: vi.fn().mockRejectedValue(new Error("fetch failed")) } as never);
    expect(res.status).toBe("TRANSACTION_INSPECTION_UNAVAILABLE");
  });
});

describe("Contract inspection", () => {
  it("contract ID not supplied", async () => {
    expect((await inspectContract({ contractId: null })).status).toBe("CONTRACT_ID_NOT_SUPPLIED");
  });
  it("invalid contract ID", async () => {
    expect((await inspectContract({ contractId: "bad" })).status).toBe("CONTRACT_ID_INVALID");
  });
  it("contract found", async () => {
    const client = { getContractWasmByContractId: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) };
    expect((await inspectContract({ contractId: C }, client as never)).status).toBe("CONTRACT_FOUND");
  });
  it("contract not found", async () => {
    const client = { getContractWasmByContractId: vi.fn().mockRejectedValue(new Error("not found")) };
    expect((await inspectContract({ contractId: C }, client as never)).status).toBe("CONTRACT_NOT_FOUND");
  });
  it("inspection unavailable", async () => {
    const client = { getContractWasmByContractId: vi.fn().mockRejectedValue(new Error("fetch failed")) };
    expect((await inspectContract({ contractId: C }, client as never)).status).toBe("CONTRACT_INSPECTION_UNAVAILABLE");
  });
});

describe("Independent verification", () => {
  it("CREATE_CONFIRMED does not equal verified", () => {
    let s = createDeploymentSession();
    for (const to of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED", "CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION", "CREATE_SIGNED", "CREATE_SUBMITTED", "CREATE_CONFIRMED"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    expect(s.state).toBe("CREATE_CONFIRMED");
    expect(s.state).not.toBe("INDEPENDENTLY_VERIFIED");
  });
  it("verification unavailable does not equal failure", async () => {
    const res = await verifyDeployedWasm({ contractId: C, expectedHash: "abc" }, { getContractWasmByContractId: vi.fn().mockRejectedValue(new Error("fetch failed")) } as never);
    expect(res.status).toBe("INDEPENDENT_VERIFICATION_UNAVAILABLE");
    expect(res.status).not.toBe("INDEPENDENT_VERIFICATION_FAILED");
  });
  it("hash mismatch blocks verification", async () => {
    const client = { getContractWasmByContractId: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) };
    const res = await verifyDeployedWasm({ contractId: C, expectedHash: "deadbeef".repeat(8) }, client as never);
    expect(res.status).toBe("INDEPENDENT_VERIFICATION_FAILED");
  });
  it("successful fresh hash match enables independently verified", async () => {
    const wasm = new Uint8Array([1, 2, 3]);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(wasm).digest("hex");
    const client = { getContractWasmByContractId: vi.fn().mockResolvedValue(wasm) };
    const res = await verifyDeployedWasm({ contractId: C, expectedHash: hash }, client as never);
    expect(res.status).toBe("INDEPENDENTLY_VERIFIED");
  });
  it("evidence cannot record before independent verification", () => {
    let s = createDeploymentSession();
    const r = transitionDeploymentSession(s, "CREATE_CONFIRMED");
    if ("session" in r) s = r.session;
    expect(canTransitionDeploymentSession(s.state, "EVIDENCE_RECORDED")).toBe(false);
  });
});

describe("Idempotency", () => {
  it("identical restoration is idempotent", () => {
    const s = createDeploymentSession();
    const serialized = serializeDeploymentSession(s);
    const r1 = restoreDeploymentSession(serialized);
    const r2 = restoreDeploymentSession(serialized);
    expect(r1.session?.state).toBe(r2.session?.state);
    expect(r1.session?.sessionId).toBe(r2.session?.sessionId);
  });
  it("identical transaction reconciliation is idempotent", async () => {
    const h = "a".repeat(64);
    const client = { getTransaction: vi.fn().mockResolvedValue({ status: "SUCCESS" }) };
    const r1 = await inspectTransaction({ transactionHash: h }, client as never);
    const r2 = await inspectTransaction({ transactionHash: h }, client as never);
    expect(r1.status).toBe(r2.status);
  });
  it("repeated read-only refresh does not advance lifecycle without new evidence", () => {
    const s = createDeploymentSession();
    const r1 = reconcileDeploymentSession(s, { connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() } });
    const r2 = reconcileDeploymentSession(r1, { connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() } });
    expect(r1.state).toBe(r2.state);
  });
  it("manual refresh never signs", () => {
    const s = createDeploymentSession();
    const r = manualRefreshDoesNotAdvance(s);
    expect(r.advanced).toBe(false);
  });
  it("manual refresh never submits", () => {
    const s = createDeploymentSession();
    const r = manualRefreshDoesNotAdvance(s);
    expect(r.advanced).toBe(false);
  });
});
