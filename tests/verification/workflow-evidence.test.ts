import { describe, expect, it } from "vitest";
import { appendWorkflowEvidence, createWorkflowVerificationEvidence, isSafeEvidenceValue, markWorkflowVerified, pilotDeploymentIsUsable, recordBeforeObservation } from "@/lib/verification/workflow-evidence";
import type { ControlledDeploymentEvidence } from "@/lib/verification/controlled-deployment";

const deployment: ControlledDeploymentEvidence = { componentId: "access-control", artifactPath: "access-control.wasm", artifactHash: "a", network: "testnet", contractId: "CNEW", deploymentTransactionHash: "tx-create", deployer: "GDEPLOYER", constructorArgs: { admin: "GADMIN" }, deployedAt: "2026-09-01T00:00:00.000Z", artifactVerified: true, verificationPurpose: "controlled-testnet-workflow" };
const observation = { method: "has_role", args: ["member", "GACCOUNT"], result: false, observedAt: "2026-09-01T00:00:00.000Z", verificationSource: "read-only RPC simulation" };

describe("controlled Access Control workflow evidence", () => {
  it("is unavailable before recorded controlled deployment evidence", () => {
    expect(pilotDeploymentIsUsable({ controlledDeployment: null, controlledRegistryRecord: false, staticDeploymentId: "CSTATIC" })).toBe(false);
    expect(pilotDeploymentIsUsable({ controlledDeployment: deployment, controlledRegistryRecord: true, staticDeploymentId: "CNEW" })).toBe(false);
    expect(pilotDeploymentIsUsable({ controlledDeployment: deployment, controlledRegistryRecord: true, staticDeploymentId: "CSTATIC" })).toBe(true);
  });

  it("does not mark simulation or confirmation without postcondition VERIFIED", () => {
    const evidence = createWorkflowVerificationEvidence({ componentId: "access-control", workflowId: "role-observation-and-grant", network: "testnet", controlledDeployment: deployment, deploymentEvidenceReference: "controlled:CNEW" });
    expect(markWorkflowVerified(evidence, { afterObservation: observation, expected: true, actual: false, verificationSource: "rpc", verifiedAt: observation.observedAt })).toBeNull();
  });

  it("marks successful confirmed execution verified only with matching after observation", () => {
    const evidence = createWorkflowVerificationEvidence({ componentId: "access-control", workflowId: "role-observation-and-grant", network: "testnet", controlledDeployment: deployment, deploymentEvidenceReference: "controlled:CNEW" });
    evidence.steps.push({ stepId: "grant", method: "grant_role", args: [], simulationStatus: "SUCCESS", submissionStatus: "CONFIRMED", transactionHash: "tx-grant", confirmationStatus: "CONFIRMED", verified: false });
    const withBefore = recordBeforeObservation(evidence, observation);
    const result = markWorkflowVerified(withBefore, { afterObservation: { ...observation, result: true }, expected: true, actual: true, verificationSource: "read-only RPC", verifiedAt: observation.observedAt });
    expect(result?.status).toBe("VERIFIED");
    expect(result?.beforeObservation?.result).toBe(false);
    expect(result?.afterObservation?.result).toBe(true);
  });

  it("requires a before observation and rejects duplicate evidence identities", () => {
    const evidence = createWorkflowVerificationEvidence({ componentId: "access-control", workflowId: "role-observation-and-grant", network: "testnet", controlledDeployment: deployment, deploymentEvidenceReference: "controlled:CNEW" });
    expect(markWorkflowVerified(evidence, { afterObservation: { ...observation, result: true }, expected: true, actual: true, verificationSource: "rpc", verifiedAt: observation.observedAt })).toBeNull();
    expect(appendWorkflowEvidence([evidence], evidence)).toBeNull();
  });

  it("rejects private material from evidence values", () => {
    expect(isSafeEvidenceValue({ admin: "G...", hash: "tx" })).toBe(true);
    expect(isSafeEvidenceValue({ privateKey: "S..." })).toBe(false);
  });
});
