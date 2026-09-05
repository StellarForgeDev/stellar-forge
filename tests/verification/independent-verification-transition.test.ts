import { describe, expect, it } from "vitest";
import {
  canTransitionDeploymentSession,
  createDeploymentSession,
  reconcileDeploymentSession,
  transitionDeploymentSession,
} from "@/lib/verification/deployment-session";

const contractId = "CCMZ7PCDAXPR735LU46DREDDLTYSK2AEMQ6BQKIGI3WSR3SPEN5YCHTR";
const artifactHash = "a".repeat(64);

function moveToCreateConfirmed() {
  let session = createDeploymentSession();
  for (const state of [
    "PREFLIGHT_READY",
    "UPLOAD_PREPARED",
    "UPLOAD_SIMULATED",
    "AWAITING_UPLOAD_CONFIRMATION",
    "UPLOAD_SIGNED",
    "UPLOAD_SUBMITTED",
    "UPLOAD_CONFIRMED",
    "CREATE_PREPARED",
    "CREATE_SIMULATED",
    "AWAITING_CREATE_CONFIRMATION",
    "CREATE_SIGNED",
    "CREATE_SUBMITTED",
    "CREATE_CONFIRMED",
  ] as const) {
    const result = transitionDeploymentSession(session, state, { contractId });
    if (!("session" in result)) throw new Error(result.error);
    session = result.session;
  }
  return session;
}

describe("independent verification lifecycle authority", () => {
  it("requires pending before verified and permits evidence only afterward", () => {
    const confirmed = moveToCreateConfirmed();
    expect(confirmed.state).toBe("CREATE_CONFIRMED");
    expect(canTransitionDeploymentSession("CREATE_CONFIRMED", "INDEPENDENTLY_VERIFIED")).toBe(false);
    expect(canTransitionDeploymentSession("CREATE_CONFIRMED", "EVIDENCE_RECORDED")).toBe(false);

    const pending = transitionDeploymentSession(confirmed, "INDEPENDENT_VERIFICATION_PENDING", { contractId });
    expect("session" in pending).toBe(true);
    if (!("session" in pending)) return;

    const verified = reconcileDeploymentSession(pending.session, {
      connectivity: { status: "NETWORK_OK", observedAt: "2026-09-04T00:00:00.000Z" },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: "2026-09-04T00:00:00.000Z" },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: "2026-09-04T00:00:00.000Z" },
      constructorAdmin: { supplied: true, valid: true, observedAt: "2026-09-04T00:00:00.000Z" },
      independentVerification: { status: "INDEPENDENTLY_VERIFIED", deployedHash: artifactHash, observedAt: "2026-09-04T00:00:00.000Z" },
    });
    expect(verified.state).toBe("INDEPENDENTLY_VERIFIED");
    expect(canTransitionDeploymentSession(verified.state, "EVIDENCE_RECORDED")).toBe(true);
  });

  it("does not skip pending when verification data is supplied to CREATE_CONFIRMED", () => {
    const confirmed = moveToCreateConfirmed();
    const reconciled = reconcileDeploymentSession(confirmed, {
      connectivity: { status: "NETWORK_OK", observedAt: "2026-09-04T00:00:00.000Z" },
      artifact: { verified: true, status: "VERIFIED_MATCH", observedAt: "2026-09-04T00:00:00.000Z" },
      account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true, observedAt: "2026-09-04T00:00:00.000Z" },
      constructorAdmin: { supplied: true, valid: true, observedAt: "2026-09-04T00:00:00.000Z" },
      independentVerification: { status: "INDEPENDENTLY_VERIFIED", deployedHash: artifactHash, observedAt: "2026-09-04T00:00:00.000Z" },
    });
    expect(reconciled.state).toBe("CREATE_CONFIRMED");
  });
});
