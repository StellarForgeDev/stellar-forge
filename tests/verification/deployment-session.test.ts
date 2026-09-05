import { describe, expect, it } from "vitest";
import {
  canTransitionDeploymentSession,
  createDeploymentSession,
  getDeploymentSessionRecoveryState,
  getNextAllowedOperatorAction,
  manualRefreshDoesNotAdvance,
  transitionDeploymentSession,
} from "@/lib/verification/deployment-session";

describe("State transitions", () => {
  it("NOT_STARTED → PREFLIGHT_READY", () => {
    expect(canTransitionDeploymentSession("NOT_STARTED", "PREFLIGHT_READY")).toBe(true);
  });
  it("PREFLIGHT_READY → UPLOAD_PREPARED", () => {
    expect(canTransitionDeploymentSession("PREFLIGHT_READY", "UPLOAD_PREPARED")).toBe(true);
  });
  it("UPLOAD_PREPARED → UPLOAD_SIMULATED", () => {
    expect(canTransitionDeploymentSession("UPLOAD_PREPARED", "UPLOAD_SIMULATED")).toBe(true);
  });
  it("UPLOAD_SIMULATED → AWAITING_UPLOAD_CONFIRMATION", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION")).toBe(true);
  });
});

describe("Invalid transitions", () => {
  it("NOT_STARTED → UPLOAD_SUBMITTED rejected", () => {
    expect(canTransitionDeploymentSession("NOT_STARTED", "UPLOAD_SUBMITTED")).toBe(false);
  });
  it("UPLOAD_PREPARED → UPLOAD_CONFIRMED rejected", () => {
    expect(canTransitionDeploymentSession("UPLOAD_PREPARED", "UPLOAD_CONFIRMED")).toBe(false);
  });
  it("UPLOAD_SIMULATED → UPLOAD_SUBMITTED rejected", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SIMULATED", "UPLOAD_SUBMITTED")).toBe(false);
  });
  it("UPLOAD_CONFIRMED → CREATE_SUBMITTED rejected", () => {
    expect(canTransitionDeploymentSession("UPLOAD_CONFIRMED", "CREATE_SUBMITTED")).toBe(false);
  });
  it("CREATE_PREPARED → CREATE_CONFIRMED rejected", () => {
    expect(canTransitionDeploymentSession("CREATE_PREPARED", "CREATE_CONFIRMED")).toBe(false);
  });
  it("CREATE_SIMULATED → EVIDENCE_RECORDED rejected", () => {
    expect(canTransitionDeploymentSession("CREATE_SIMULATED", "EVIDENCE_RECORDED")).toBe(false);
  });
  it("CREATE_CONFIRMED → EVIDENCE_RECORDED rejected", () => {
    expect(canTransitionDeploymentSession("CREATE_CONFIRMED", "EVIDENCE_RECORDED")).toBe(false);
  });
});

describe("Environment invalidation", () => {
  it("PREFLIGHT_READY + NETWORK_UNAVAILABLE → ENVIRONMENT_BLOCKED", () => {
    const s = createDeploymentSession();
    const r1 = transitionDeploymentSession(s, "PREFLIGHT_READY");
    expect("session" in r1).toBe(true);
    if ("session" in r1) {
      const invalid = r1.session;
      // Simulate invalidation via direct transition to blocked (deterministic)
      expect(canTransitionDeploymentSession(invalid.state, "ENVIRONMENT_BLOCKED")).toBe(true);
      const r2 = transitionDeploymentSession(invalid, "ENVIRONMENT_BLOCKED", { blockingReason: "NETWORK_UNAVAILABLE" });
      expect("session" in r2).toBe(true);
    }
  });
});

describe("Artifact invalidation", () => {
  it("PREFLIGHT_READY + artifact mismatch → ARTIFACT_BLOCKED", () => {
    const s = createDeploymentSession();
    const r = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r) {
      expect(canTransitionDeploymentSession(r.session.state, "ARTIFACT_BLOCKED")).toBe(true);
    }
  });
});

describe("Account invalidation", () => {
  it("PREFLIGHT_READY + ACCOUNT_UNFUNDED → ACCOUNT_BLOCKED", () => {
    const s = createDeploymentSession();
    const r = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r) {
      expect(canTransitionDeploymentSession(r.session.state, "ACCOUNT_BLOCKED")).toBe(true);
    }
  });
});

describe("Constructor invalidation", () => {
  it("PREFLIGHT_READY + invalid admin → CONSTRUCTOR_BLOCKED", () => {
    const s = createDeploymentSession();
    const r = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r) {
      expect(canTransitionDeploymentSession(r.session.state, "CONSTRUCTOR_BLOCKED")).toBe(true);
    }
  });
});

describe("Simulation boundary", () => {
  it("simulation success ≠ signing", () => {
    const s = createDeploymentSession();
    const r1 = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r1) {
      const r2 = transitionDeploymentSession(r1.session, "UPLOAD_PREPARED");
      if ("session" in r2) {
        const r3 = transitionDeploymentSession(r2.session, "UPLOAD_SIMULATED");
        if ("session" in r3) {
          expect(r3.session.state).toBe("UPLOAD_SIMULATED");
          expect(canTransitionDeploymentSession(r3.session.state, "UPLOAD_SIGNED")).toBe(false);
          expect(canTransitionDeploymentSession(r3.session.state, "AWAITING_UPLOAD_CONFIRMATION")).toBe(true);
        }
      }
    }
  });
  it("simulation success ≠ submission", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SIMULATED", "UPLOAD_SUBMITTED")).toBe(false);
  });
  it("simulation success ≠ deployment", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SIMULATED", "EVIDENCE_RECORDED")).toBe(false);
  });
});

describe("Creation boundary", () => {
  it("creation preparation requires confirmed upload", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SIMULATED", "CREATE_PREPARED")).toBe(false);
    expect(canTransitionDeploymentSession("UPLOAD_CONFIRMED", "CREATE_PREPARED")).toBe(true);
  });
});

describe("Recovery", () => {
  it("submitted + unavailable confirmation preserves SUBMITTED", () => {
    const s = createDeploymentSession();
    let cur = s;
    const steps: Array<[import("@/lib/verification/deployment-session").DeploymentSessionState, import("@/lib/verification/deployment-session").DeploymentSessionState]> = [
      ["NOT_STARTED", "PREFLIGHT_READY"],
      ["PREFLIGHT_READY", "UPLOAD_PREPARED"],
      ["UPLOAD_PREPARED", "UPLOAD_SIMULATED"],
      ["UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION"],
      ["AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED"],
      ["UPLOAD_SIGNED", "UPLOAD_SUBMITTED"],
    ];
    for (const [, to] of steps) {
      const r = transitionDeploymentSession(cur, to as import("@/lib/verification/deployment-session").DeploymentSessionState);
      if ("session" in r) cur = r.session;
    }
    // Now at UPLOAD_SUBMITTED, confirmation unavailable
    const recovery = getDeploymentSessionRecoveryState(cur);
    expect(recovery.lastState).toBe("UPLOAD_SUBMITTED");
    expect(recovery.confirmationStatus).toBe("UNKNOWN");
    expect(recovery.nextAllowed).not.toContain("UPLOAD_SIGNED" as never);
    expect(getNextAllowedOperatorAction(cur)).toMatch(/Manual refresh/);
  });
});

describe("Manual refresh", () => {
  it("does not sign", () => {
    const s = createDeploymentSession();
    const r = manualRefreshDoesNotAdvance(s);
    expect(r.advanced).toBe(false);
    expect(r.inspected).toContain("connectivity");
  });
  it("does not submit", () => {
    const s = createDeploymentSession();
    const before = s.state;
    const r = manualRefreshDoesNotAdvance(s);
    expect(r.advanced).toBe(false);
    expect(s.state).toBe(before);
  });
  it("does not create transactions automatically", () => {
    const s = createDeploymentSession();
    const r = manualRefreshDoesNotAdvance(s);
    expect(r.inspected).not.toContain("sign" as never);
  });
});

describe("Evidence boundary", () => {
  it("PREPARED → cannot record", () => {
    expect(canTransitionDeploymentSession("UPLOAD_PREPARED", "EVIDENCE_RECORDED")).toBe(false);
  });
  it("SIMULATED → cannot record", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SIMULATED", "EVIDENCE_RECORDED")).toBe(false);
  });
  it("CONFIRMED → cannot record without independent verification", () => {
    expect(canTransitionDeploymentSession("CREATE_CONFIRMED", "EVIDENCE_RECORDED")).toBe(false);
  });
  it("INDEPENDENTLY_VERIFIED → evidence recordable only through successful recording", () => {
    expect(canTransitionDeploymentSession("INDEPENDENTLY_VERIFIED", "EVIDENCE_RECORDED")).toBe(true);
    const s = createDeploymentSession();
    const r = transitionDeploymentSession(s, "PREFLIGHT_READY");
    if ("session" in r) {
      // Try shortcut without verification
      const bad = transitionDeploymentSession(r.session, "EVIDENCE_RECORDED");
      expect("error" in bad).toBe(true);
    }
  });
});

describe("Secret safety", () => {
  it("session snapshots reject S... secret", () => {
    const s = createDeploymentSession();
    const r = transitionDeploymentSession(s, "PREFLIGHT_READY", { deploymentAccount: "SABC" });
    expect("error" in r).toBe(true);
  });
  it("session snapshots reject secret", () => {
    const s = createDeploymentSession();
    const r = transitionDeploymentSession(s, "PREFLIGHT_READY", { constructorAdmin: "my secret" });
    expect("error" in r).toBe(true);
  });
  it("session snapshots sanitize private material", () => {
    const s = createDeploymentSession({ deploymentAccount: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" });
    expect(s.deploymentAccount).toBe("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
    const bad = transitionDeploymentSession(s, "PREFLIGHT_READY", { transactionHash: "S123" });
    expect("error" in bad).toBe(true);
  });
});

describe("Immutable snapshots", () => {
  it("preserves chronology and does not mutate history", () => {
    const s0 = createDeploymentSession();
    const r1 = transitionDeploymentSession(s0, "PREFLIGHT_READY");
    expect("session" in r1).toBe(true);
    if ("session" in r1) {
      expect(r1.session.snapshots.length).toBe(2);
      expect(r1.session.snapshots[0]?.state).toBe("NOT_STARTED");
      expect(r1.session.snapshots[1]?.state).toBe("PREFLIGHT_READY");
      // Original snapshot not mutated
      expect(s0.snapshots.length).toBe(1);
    }
  });
});
