import { describe, expect, it, vi } from "vitest";
import { createNetworkExecutionEvidence, addStepEvidence, executeConfirmed, markPreflightBlocked, runDryRun } from "@/lib/verification/network-execution";

const base = () => createNetworkExecutionEvidence({ componentId: "access-control", workflowId: "role-observation-and-grant", network: "testnet", contractId: "C...", mode: "dry-run", now: "2026-09-01T00:00:00.000Z" });

describe("network execution evidence and safety boundaries", () => {
  it("keeps simulation success separate from confirmation and verification", () => {
    const result = addStepEvidence(base(), { stepId: "simulate", kind: "simulate", method: "grant_role", args: [], simulationStatus: "SUCCESS", signatureStatus: "NOT_REQUESTED", submissionStatus: "NOT_REQUESTED", result: null });
    expect(result.status).toBe("SIMULATED");
    expect(result.status).not.toBe("VERIFIED");
  });

  it("records confirmed and postcondition failures distinctly", () => {
    const confirmed = addStepEvidence(base(), { stepId: "tx", kind: "transaction", method: "grant_role", args: [], simulationStatus: "SUCCESS", signatureStatus: "SIGNED", submissionStatus: "CONFIRMED", transactionHash: "hash", result: null });
    expect(confirmed.status).toBe("CONFIRMED");
    const failed = addStepEvidence(confirmed, { stepId: "observe", kind: "observe", method: "has_role", args: [], simulationStatus: "NOT_RUN", signatureStatus: "NOT_REQUESTED", submissionStatus: "NOT_REQUESTED", result: false, error: "postcondition failed" });
    expect(failed.status).toBe("POSTCONDITION_FAILED");
    expect(failed.steps[1]?.transactionHash).toBeNull();
  });

  it("dry-run never calls sign or submit", async () => {
    const sign = vi.fn();
    const submit = vi.fn();
    const result = await runDryRun({ prepare: async () => "prepared", simulate: async () => true });
    expect(result.status).toBe("SIMULATED");
    expect(sign).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("execute mode requires explicit confirmation", async () => {
    const sign = vi.fn(async () => "signed");
    const submit = vi.fn(async () => "submitted");
    await expect(executeConfirmed({ prepare: async () => "prepared", simulate: async () => true, sign, submit, confirmed: false })).rejects.toThrow("Explicit user confirmation");
    expect(sign).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not mark blocked or incomplete work verified", () => {
    const result = markPreflightBlocked(base(), "artifact mismatch");
    expect(result.status).toBe("PREFLIGHT_BLOCKED");
    expect(result.steps[0]?.verified).toBe(false);
  });
});
