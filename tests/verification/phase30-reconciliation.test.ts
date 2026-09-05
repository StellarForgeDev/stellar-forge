import { describe, expect, it, vi } from "vitest";
import { canTransitionDeploymentSession, createDeploymentSession, reconcileDeploymentSession, transitionDeploymentSession } from "@/lib/verification/deployment-session";
import { inspectTransaction } from "@/lib/verification/transaction-inspection";
import { inspectContract, verifyDeployedWasm } from "@/lib/verification/contract-inspection";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";

const G = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const C = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";
const txHash = "a".repeat(64);

describe("Phase 30: Fresh session requires reconciliation", () => {
  it("fresh session requires reconciliation", () => {
    const s = createDeploymentSession();
    expect(s.state).toBe("NOT_STARTED");
    const r = reconcileDeploymentSession(s, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() },
    });
    expect(r.state).toBe("ACCOUNT_BLOCKED");
    expect(r.state).not.toBe("NOT_STARTED");
  });
});

describe("Phase 30: Transaction reconciliation", () => {
  it("UPLOAD_SUBMITTED + transaction confirmed", async () => {
    const s0 = createDeploymentSession();
    const s1 = reconcileDeploymentSession(s0, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    // Advance to UPLOAD_SUBMITTED
    let cur = s1;
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const { transitionDeploymentSession } = await import("@/lib/verification/deployment-session");
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    const reconciled = reconcileDeploymentSession(cur, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
      transaction: { status: "TRANSACTION_CONFIRMED", hash: txHash, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("UPLOAD_CONFIRMED");
  });
  it("UPLOAD_SUBMITTED + transaction pending", async () => {
    let cur = createDeploymentSession();
    cur = reconcileDeploymentSession(cur, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const { transitionDeploymentSession } = await import("@/lib/verification/deployment-session");
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    const reconciled = reconcileDeploymentSession(cur, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
      transaction: { status: "TRANSACTION_PENDING", hash: txHash, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("UPLOAD_SUBMITTED");
  });
  it("UPLOAD_SUBMITTED + transaction failed", async () => {
    let cur = createDeploymentSession();
    cur = reconcileDeploymentSession(cur, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const { transitionDeploymentSession } = await import("@/lib/verification/deployment-session");
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    const reconciled = reconcileDeploymentSession(cur, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
      transaction: { status: "TRANSACTION_FAILED", hash: txHash, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("FAILED");
  });
  it("UPLOAD_SUBMITTED + transaction unavailable", async () => {
    let cur = createDeploymentSession();
    cur = reconcileDeploymentSession(cur, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const { transitionDeploymentSession } = await import("@/lib/verification/deployment-session");
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    const reconciled = reconcileDeploymentSession(cur, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
      transaction: { status: "TRANSACTION_INSPECTION_UNAVAILABLE", hash: txHash, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("UPLOAD_SUBMITTED");
  });
  it("CREATE_SUBMITTED + transaction confirmed", async () => {
    let cur = createDeploymentSession();
    cur = reconcileDeploymentSession(cur, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED", "CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION", "CREATE_SIGNED", "CREATE_SUBMITTED"] as const) {
      const { transitionDeploymentSession } = await import("@/lib/verification/deployment-session");
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    const reconciled = reconcileDeploymentSession(cur, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
      transaction: { status: "TRANSACTION_CONFIRMED", hash: txHash, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("CREATE_CONFIRMED");
  });
  it("transaction not found does not authorize resubmission", async () => {
    const res = await inspectTransaction({ transactionHash: "a".repeat(64) }, { getTransaction: vi.fn().mockRejectedValue(new Error("not found")) } as never);
    expect(res.status).toBe("TRANSACTION_NOT_FOUND");
    // Should not allow resubmit: check that session remains SUBMITTED
    let cur = createDeploymentSession();
    cur = reconcileDeploymentSession(cur, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const { transitionDeploymentSession } = await import("@/lib/verification/deployment-session");
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    const reconciled = reconcileDeploymentSession(cur, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
      transaction: { status: "TRANSACTION_NOT_FOUND", hash: txHash, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("UPLOAD_SUBMITTED");
  });
});

describe("Contract reconciliation", () => {
  it("CREATE_CONFIRMED requires contract inspection", () => {
    let cur = createDeploymentSession();
    cur = reconcileDeploymentSession(cur, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED", "CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION", "CREATE_SIGNED", "CREATE_SUBMITTED", "CREATE_CONFIRMED"] as const) {
      const r = transitionDeploymentSession(cur, to);
      if ("session" in r) cur = r.session;
    }
    expect(cur.state).toBe("CREATE_CONFIRMED");
    // Contract not found remains explicit, not verified
    const reconciled = reconcileDeploymentSession(cur, {
      connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() },
      contract: { status: "CONTRACT_NOT_FOUND", contractId: C, observedAt: new Date().toISOString() },
    });
    expect(reconciled.state).toBe("CREATE_CONFIRMED");
  });
  it("contract found does not equal independently verified", async () => {
    const res = await inspectContract({ contractId: C }, { getContractWasmByContractId: vi.fn().mockResolvedValue(new Uint8Array([1])) } as never);
    expect(res.status).toBe("CONTRACT_FOUND");
    expect(res.status).not.toBe("CONTRACT_ID_INVALID");
    // Independent verification still requires hash match
    const wasm = new Uint8Array([1, 2, 3]);
    const client = { getContractWasmByContractId: vi.fn().mockResolvedValue(wasm) };
    const v = await verifyDeployedWasm({ contractId: C, expectedHash: "wrong" }, client as never);
    expect(v.status).toBe("INDEPENDENT_VERIFICATION_FAILED");
  });
});

describe("Independent verification readiness", () => {
  it("deployed WASM hash match → INDEPENDENTLY_VERIFIED", async () => {
    const wasm = new Uint8Array([1, 2, 3]);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(wasm).digest("hex");
    const client = { getContractWasmByContractId: vi.fn().mockResolvedValue(wasm) };
    const v = await verifyDeployedWasm({ contractId: C, expectedHash: hash }, client as never);
    expect(v.status).toBe("INDEPENDENTLY_VERIFIED");
  });
  it("hash mismatch → FAILED", async () => {
    const client = { getContractWasmByContractId: vi.fn().mockResolvedValue(new Uint8Array([1])) };
    const v = await verifyDeployedWasm({ contractId: C, expectedHash: "deadbeef".repeat(8) }, client as never);
    expect(v.status).toBe("INDEPENDENT_VERIFICATION_FAILED");
  });
  it("WASM retrieval unavailable → UNAVAILABLE", async () => {
    const v = await verifyDeployedWasm({ contractId: C, expectedHash: "abc" }, { getContractWasmByContractId: vi.fn().mockRejectedValue(new Error("fetch failed")) } as never);
    expect(v.status).toBe("INDEPENDENT_VERIFICATION_UNAVAILABLE");
  });
  it("independent verification unavailable does not record evidence", () => {
    // Try to record from CREATE_CONFIRMED without verification
    expect(canTransitionDeploymentSession("CREATE_CONFIRMED", "EVIDENCE_RECORDED")).toBe(false);
  });
});

describe("Historical evidence separation", () => {
  it("current unavailable does not erase historical verified", async () => {
    const s = createDeploymentSession();
    const s1 = reconcileDeploymentSession(s, { connectivity: { status: "NETWORK_OK", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    expect(s1.state).toBe("PREFLIGHT_READY");
    const s2 = reconcileDeploymentSession(s1, { connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() }, artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() }, account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() }, constructorAdmin: { supplied: true, valid: true, observedAt: new Date().toISOString() } });
    expect(s2.state).toBe("ENVIRONMENT_BLOCKED");
    // Historical snapshots preserved
    expect(s2.snapshots.some((ss) => ss.state === "PREFLIGHT_READY")).toBe(true);
  });
});

describe("Manual refresh semantics", () => {
  it("manual refresh never advances irreversible lifecycle automatically", async () => {
    const { manualRefreshDoesNotAdvance } = await import("@/lib/verification/deployment-session");
    const s = createDeploymentSession();
    const r = manualRefreshDoesNotAdvance(s);
    expect(r.advanced).toBe(false);
  });
});

describe("Secret and network safety", () => {
  it("secrets rejected from persisted session", async () => {
    const { serializeDeploymentSession } = await import("@/lib/verification/deployment-session");
    const s = createDeploymentSession({ deploymentAccount: G });
    const bad = { ...s, deploymentAccount: "SSECRET" } as unknown as typeof s;
    expect(() => serializeDeploymentSession(bad)).toThrow(/Secret/);
  });
  it("Mainnet rejected", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "https://soroban-mainnet.stellar.org", expectedPassphrase: "Test SDF Network ; September 2015", client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.status).toBe("BLOCKED");
  });
  it("HTTP endpoint rejected", async () => {
    const r = await diagnoseTestnetConnectivity({ endpoint: "http://soroban-testnet.stellar.org", expectedPassphrase: "Test SDF Network ; September 2015", client: { getHealth: vi.fn(), getNetwork: vi.fn() } });
    expect(r.status).toBe("BLOCKED");
    expect(r.tls).toBe("FAIL");
  });
});
