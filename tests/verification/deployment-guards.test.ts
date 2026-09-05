import { describe, expect, it } from "vitest";
import { canPrepareCreation, canRecordDeploymentEvidence, canSignDeployment, canSubmitDeployment, recoverDeploymentAction } from "@/lib/verification/deployment-guards";

const base = { status: "AWAITING_CONFIRMATION" as const, userConfirmed: true, simulationPassed: true, signedTransactionAvailable: false, uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false };

describe("controlled deployment safety guards", () => {
  it("requires simulation and explicit confirmation before signing", () => {
    expect(canSignDeployment(base)).toBe(true);
    expect(canSignDeployment({ ...base, userConfirmed: false })).toBe(false);
    expect(canSignDeployment({ ...base, simulationPassed: false })).toBe(false);
  });

  it("requires a signed transaction before submission", () => {
    expect(canSubmitDeployment(base)).toBe(false);
    expect(canSubmitDeployment({ ...base, signedTransactionAvailable: true })).toBe(true);
  });

  it("requires confirmed upload before creation and full evidence before recording", () => {
    expect(canPrepareCreation(base)).toBe(false);
    expect(canPrepareCreation({ ...base, uploadConfirmed: true })).toBe(true);
    expect(canRecordDeploymentEvidence({ ...base, uploadConfirmed: true, creationConfirmed: true, contractId: "CA", artifactVerified: false })).toBe(false);
    expect(canRecordDeploymentEvidence({ ...base, uploadConfirmed: true, creationConfirmed: true, contractId: "CA", artifactVerified: true })).toBe(true);
  });

  it("recovers by inspecting known hashes rather than retrying transactions", () => {
    expect(recoverDeploymentAction({ uploadConfirmed: false, creationConfirmed: false, contractId: null, artifactVerified: false, uploadTransactionHash: "hash" })).toBe("INSPECT_UPLOAD");
    expect(recoverDeploymentAction({ uploadConfirmed: true, creationConfirmed: false, contractId: null, artifactVerified: false, creationTransactionHash: "hash" })).toBe("INSPECT_CREATION");
  });
});
