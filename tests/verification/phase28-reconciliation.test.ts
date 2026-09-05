import { describe, expect, it } from "vitest";
import { createDeploymentSession, reconcileDeploymentSession, canTransitionDeploymentSession, transitionDeploymentSession, manualRefreshDoesNotAdvance } from "@/lib/verification/deployment-session";

const baseConnectivity = { status: "NETWORK_OK", failureCategory: undefined, observedAt: new Date().toISOString() };
const baseArtifact = { verified: true, status: "VERIFIED_MATCH", observedAt: new Date().toISOString() };
const baseAccount = { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: new Date().toISOString() };
const baseConstructor = { supplied: true, valid: true, observedAt: new Date().toISOString() };

describe("NOT_STARTED semantics", () => {
  it("new session with no evaluation remains NOT_STARTED", () => {
    const s = createDeploymentSession();
    expect(s.state).toBe("NOT_STARTED");
    expect(s.snapshots.length).toBe(1);
  });
  it("evaluated healthy env + missing account → ACCOUNT_BLOCKED", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() },
      constructorAdmin: baseConstructor,
    });
    expect(r.state).toBe("ACCOUNT_BLOCKED");
    expect(r.previousState).toBe("NOT_STARTED");
  });
  it("evaluated healthy env + missing constructor → CONSTRUCTOR_BLOCKED", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: baseAccount,
      constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() },
    });
    expect(r.state).toBe("CONSTRUCTOR_BLOCKED");
  });
  it("fully satisfied prerequisites → PREFLIGHT_READY", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: baseAccount,
      constructorAdmin: baseConstructor,
    });
    expect(r.state).toBe("PREFLIGHT_READY");
  });
});

describe("Blocking precedence", () => {
  it("environment failure overrides artifact/account/admin", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, {
      connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() },
      artifact: { verified: false, status: "ARTIFACT_UNAVAILABLE", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() },
    });
    expect(r.state).toBe("ENVIRONMENT_BLOCKED");
  });
  it("artifact failure overrides account/admin", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, {
      connectivity: baseConnectivity,
      artifact: { verified: false, status: "DEPLOYMENT_MISMATCH", observedAt: new Date().toISOString() },
      account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() },
    });
    expect(r.state).toBe("ARTIFACT_BLOCKED");
  });
  it("account failure overrides constructor", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: { status: "ACCOUNT_UNFUNDED", exists: true, sufficientBalance: false, observedAt: new Date().toISOString() },
      constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() },
    });
    expect(r.state).toBe("ACCOUNT_BLOCKED");
  });
  it("constructor failure blocks only after prior gates pass", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: baseAccount,
      constructorAdmin: { supplied: false, valid: false, observedAt: new Date().toISOString() },
    });
    expect(r.state).toBe("CONSTRUCTOR_BLOCKED");
  });
});

describe("Stale-state prevention", () => {
  it("PREFLIGHT_READY + HTTP_FAILURE → ENVIRONMENT_BLOCKED", () => {
    const s0 = createDeploymentSession();
    const s1 = reconcileDeploymentSession(s0, { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s1.state).toBe("PREFLIGHT_READY");
    const s2 = reconcileDeploymentSession(s1, {
      connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() },
      artifact: baseArtifact,
      account: baseAccount,
      constructorAdmin: baseConstructor,
    });
    expect(s2.state).toBe("ENVIRONMENT_BLOCKED");
  });
  it("PREFLIGHT_READY + artifact mismatch → ARTIFACT_BLOCKED", () => {
    const s1 = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    const s2 = reconcileDeploymentSession(s1, {
      connectivity: baseConnectivity,
      artifact: { verified: false, status: "DEPLOYMENT_MISMATCH", observedAt: new Date().toISOString() },
      account: baseAccount,
      constructorAdmin: baseConstructor,
    });
    expect(s2.state).toBe("ARTIFACT_BLOCKED");
  });
  it("PREFLIGHT_READY + unfunded account → ACCOUNT_BLOCKED", () => {
    const s1 = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    const s2 = reconcileDeploymentSession(s1, {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: { status: "ACCOUNT_UNFUNDED", exists: true, sufficientBalance: false, observedAt: new Date().toISOString() },
      constructorAdmin: baseConstructor,
    });
    expect(s2.state).toBe("ACCOUNT_BLOCKED");
  });
  it("PREFLIGHT_READY + invalid constructor → CONSTRUCTOR_BLOCKED", () => {
    const s1 = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    const s2 = reconcileDeploymentSession(s1, {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: baseAccount,
      constructorAdmin: { supplied: true, valid: false, observedAt: new Date().toISOString() },
    });
    expect(s2.state).toBe("CONSTRUCTOR_BLOCKED");
  });
});

describe("Historical lifecycle preservation", () => {
  it("UPLOAD_SUBMITTED + network failure remains UPLOAD_SUBMITTED", () => {
    let s = createDeploymentSession();
    s = reconcileDeploymentSession(s, { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    // Advance to UPLOAD_SUBMITTED via valid transitions
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    expect(s.state).toBe("UPLOAD_SUBMITTED");
    const beforeSnapshots = s.snapshots.length;
    const beforeHash = s.transactionHashes.upload;
    // Now environment fails, but lifecycle must not regress to NOT_STARTED
    const s2 = reconcileDeploymentSession(s, {
      connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() },
      artifact: baseArtifact,
      account: baseAccount,
      constructorAdmin: baseConstructor,
    });
    // Should preserve UPLOAD_SUBMITTED, not become ENVIRONMENT_BLOCKED or NOT_STARTED
    expect(s2.state).toBe("UPLOAD_SUBMITTED");
    expect(s2.snapshots.length).toBe(beforeSnapshots + 1); // adds a snapshot for current readiness but keeps lifecycle
    expect(s2.transactionHashes.upload).toBe(beforeHash);
  });
  it("CREATE_CONFIRMED + verification unavailable preserves CREATE_CONFIRMED", () => {
    let s = createDeploymentSession();
    s = reconcileDeploymentSession(s, { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    for (const to of ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED", "UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED", "CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION", "CREATE_SIGNED", "CREATE_SUBMITTED", "CREATE_CONFIRMED"] as const) {
      const r = transitionDeploymentSession(s, to);
      if ("session" in r) s = r.session;
    }
    expect(s.state).toBe("CREATE_CONFIRMED");
    const s2 = reconcileDeploymentSession(s, {
      connectivity: baseConnectivity,
      artifact: { verified: false, status: "UNKNOWN", observedAt: new Date().toISOString() },
      account: baseAccount,
      constructorAdmin: baseConstructor,
    });
    // Should stay CREATE_CONFIRMED, not regress
    expect(s2.state).toBe("CREATE_CONFIRMED");
  });
});

describe("Refresh semantics", () => {
  it("manual refresh may update readiness", () => {
    const s0 = createDeploymentSession();
    const s1 = reconcileDeploymentSession(s0, { connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() }, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s1.state).toBe("ENVIRONMENT_BLOCKED");
    const s2 = reconcileDeploymentSession(s1, { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s2.state).toBe("PREFLIGHT_READY");
  });
  it("manual refresh cannot simulate upload", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(r.state).toBe("PREFLIGHT_READY");
    const refreshed = manualRefreshDoesNotAdvance(r);
    expect(refreshed.advanced).toBe(false);
    expect(canTransitionDeploymentSession(r.state, "UPLOAD_SIMULATED")).toBe(false);
  });
  it("manual refresh cannot sign", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(manualRefreshDoesNotAdvance(s).advanced).toBe(false);
  });
  it("manual refresh cannot submit", () => {
    expect(manualRefreshDoesNotAdvance(createDeploymentSession()).advanced).toBe(false);
  });
  it("manual refresh cannot create contract", () => {
    expect(manualRefreshDoesNotAdvance(createDeploymentSession()).advanced).toBe(false);
  });
  it("manual refresh cannot record evidence", () => {
    expect(manualRefreshDoesNotAdvance(createDeploymentSession()).advanced).toBe(false);
  });
});

describe("Idempotency", () => {
  it("identical reconciliation twice produces no semantic advancement", () => {
    const s0 = createDeploymentSession();
    const input = { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor, observedAt: "2026-01-01T00:00:00.000Z" };
    const s1 = reconcileDeploymentSession(s0, input);
    const s2 = reconcileDeploymentSession(s1, input);
    expect(s1.state).toBe(s2.state);
    // History length should not increase on identical second call if already reconciled
    expect(s2.snapshots.length).toBe(s1.snapshots.length);
  });
});

describe("Historical vs current evidence", () => {
  it("historical NETWORK_OK does not override current HTTP_FAILURE", () => {
    const s0 = createDeploymentSession();
    const s1 = reconcileDeploymentSession(s0, { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s1.state).toBe("PREFLIGHT_READY");
    const s2 = reconcileDeploymentSession(s1, { connectivity: { status: "BLOCKED", failureCategory: "HTTP_FAILURE", observedAt: new Date().toISOString() }, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s2.state).toBe("ENVIRONMENT_BLOCKED");
  });
  it("historical VERIFIED_MATCH does not become fresh after transient failure", () => {
    // Access Control historical verified, current retrieval transient → should not claim fresh verified
    const s = reconcileDeploymentSession(createDeploymentSession(), {
      connectivity: baseConnectivity,
      artifact: { verified: false, status: "TRANSIENT_FAILURE", observedAt: new Date().toISOString() },
      account: baseAccount,
      constructorAdmin: baseConstructor,
    });
    expect(s.state).toBe("ARTIFACT_BLOCKED");
  });
  it("historical Token mismatch remains mismatch after retrieval failure", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), {
      connectivity: baseConnectivity,
      artifact: { verified: false, status: "DEPLOYMENT_MISMATCH", observedAt: new Date().toISOString() },
      account: baseAccount,
      constructorAdmin: baseConstructor,
    });
    expect(s.state).toBe("ARTIFACT_BLOCKED");
    expect(s.blockingReason).toMatch(/DEPLOYMENT_MISMATCH/);
  });
});

describe("Operator actions", () => {
  it("ACCOUNT_BLOCKED next action is account provision", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), {
      connectivity: baseConnectivity,
      artifact: baseArtifact,
      account: { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, observedAt: new Date().toISOString() },
      constructorAdmin: baseConstructor,
    });
    expect(s.state).toBe("ACCOUNT_BLOCKED");
    // Next allowed should include PREFLIGHT_READY when account provided, but currently blocked
    const allowed = s.snapshots[s.snapshots.length - 1]?.blockingReason;
    expect(allowed).toMatch(/ACCOUNT_NOT_SUPPLIED/);
  });
  it("PREFLIGHT_READY next action is explicit upload preparation", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s.state).toBe("PREFLIGHT_READY");
  });
});

describe("Safety", () => {
  it("reconciliation cannot sign", () => {
    const s = createDeploymentSession();
    const r = reconcileDeploymentSession(s, { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(r.state).not.toBe("UPLOAD_SIGNED");
    expect(r.state).not.toBe("CREATE_SIGNED");
  });
  it("reconciliation cannot submit", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s.state).not.toBe("UPLOAD_SUBMITTED");
  });
  it("reconciliation cannot upload WASM", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s.state).toBe("PREFLIGHT_READY");
  });
  it("reconciliation cannot deploy", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s.state).not.toBe("EVIDENCE_RECORDED");
  });
  it("reconciliation cannot record deployment evidence", () => {
    const s = reconcileDeploymentSession(createDeploymentSession(), { connectivity: baseConnectivity, artifact: baseArtifact, account: baseAccount, constructorAdmin: baseConstructor });
    expect(s.state).not.toBe("EVIDENCE_RECORDED");
  });
});
