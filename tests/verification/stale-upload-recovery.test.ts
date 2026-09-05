import { describe, expect, it } from "vitest";
import {
  canTransitionDeploymentSession,
  createDeploymentSession,
  reconcileDeploymentSession,
  transitionDeploymentSession,
} from "@/lib/verification/deployment-session";

const G = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const prerequisites = {
  connectivity: { status: "NETWORK_OK" },
  artifact: { verified: true, status: "VERIFIED_MATCH" },
  account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
  constructorAdmin: { supplied: true, valid: true },
};

function signedUploadSession() {
  let session = createDeploymentSession({ deploymentAccount: G, constructorAdmin: G });
  for (const state of ["PREFLIGHT_READY", "UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION", "UPLOAD_SIGNED"] as const) {
    const result = transitionDeploymentSession(session, state);
    if ("session" in result) session = result.session;
  }
  return session;
}

describe("stale persisted UPLOAD_SIGNED recovery", () => {
  it("recovers only an explicitly reconciled missing signed upload", () => {
    const recovered = reconcileDeploymentSession(signedUploadSession(), {
      ...prerequisites,
      uploadRecovery: {
        signedTransactionAvailable: false,
        uploadHash: null,
        pendingHash: null,
        submissionEvidence: "NO_SUBMISSION_RECORDED",
      },
      observedAt: "2026-09-03T00:00:00.000Z",
    });

    expect(recovered.state).toBe("FAILED");
    expect(recovered.failure?.classification).toBe("SIMULATION_FAILED");
    expect(recovered.failure?.recoverable).toBe(true);
    expect(recovered.blockingReason).toBe("SIGNED_UPLOAD_UNAVAILABLE");

    const reset = transitionDeploymentSession(recovered, "NOT_STARTED");
    expect("session" in reset).toBe(true);
    if ("session" in reset) {
      const ready = reconcileDeploymentSession(reset.session, prerequisites);
      expect(ready.state).toBe("PREFLIGHT_READY");
    }
  });

  it("does not recover while the signed envelope is available", () => {
    const result = reconcileDeploymentSession(signedUploadSession(), {
      ...prerequisites,
      uploadRecovery: {
        signedTransactionAvailable: true,
        uploadHash: null,
        pendingHash: null,
        submissionEvidence: "NO_SUBMISSION_RECORDED",
      },
    });
    expect(result.state).toBe("UPLOAD_SIGNED");
  });

  it("preserves signed state when a hash or pending/unknown evidence exists", () => {
    for (const evidence of ["SUBMITTED", "PENDING", "UNKNOWN"] as const) {
      const result = reconcileDeploymentSession(signedUploadSession(), {
        ...prerequisites,
        uploadRecovery: {
          signedTransactionAvailable: false,
          uploadHash: evidence === "SUBMITTED" ? "a".repeat(64) : null,
          pendingHash: evidence === "PENDING" ? "b".repeat(64) : null,
          submissionEvidence: evidence,
        },
      });
      expect(result.state).toBe("UPLOAD_SIGNED");
    }
  });

  it("does not infer recovery from missing recovery evidence", () => {
    expect(reconcileDeploymentSession(signedUploadSession(), prerequisites).state).toBe("UPLOAD_SIGNED");
  });

  it("keeps direct lifecycle shortcuts invalid", () => {
    expect(canTransitionDeploymentSession("UPLOAD_SIGNED", "UPLOAD_PREPARED")).toBe(false);
    expect(canTransitionDeploymentSession("UPLOAD_SIGNED", "PREFLIGHT_READY")).toBe(false);
  });
});
