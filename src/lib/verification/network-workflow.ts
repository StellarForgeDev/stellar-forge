import type { TransactionNetwork } from "../transactions/networks.ts";

export type NetworkWorkflowStepKind = "read" | "simulate" | "transaction" | "observe";

export interface NetworkWorkflowStep {
  stepId: string;
  kind: NetworkWorkflowStepKind;
  method: string;
  description: string;
  expectedResult?: unknown;
}

export interface NetworkWorkflow {
  componentId: string;
  workflowId: string;
  network: TransactionNetwork;
  preconditions: string[];
  steps: NetworkWorkflowStep[];
  postconditions: string[];
}

/** The first candidate is intentionally observation-first and does not assume an admin. */
export const ACCESS_CONTROL_WORKFLOW: NetworkWorkflow = {
  componentId: "access-control",
  workflowId: "role-observation-and-grant",
  network: "testnet",
  preconditions: [
    "The deployed artifact has a VERIFIED_MATCH evidence record.",
    "The connected account is proven to be the contract admin before grant_role is attempted.",
    "The role and account are supplied by the user; no constructor or admin value is inferred.",
  ],
  steps: [
    { stepId: "read-role-before", kind: "read", method: "has_role", description: "Read the current role state." },
    { stepId: "simulate-grant", kind: "simulate", method: "grant_role", description: "Simulate the admin-only grant without signing or submitting." },
    { stepId: "grant-role", kind: "transaction", method: "grant_role", description: "User-authorized role grant; requires explicit confirmation." },
    { stepId: "observe-role-after", kind: "observe", method: "has_role", description: "Read the role state after ledger confirmation." },
  ],
  postconditions: ["The post-transaction has_role observation equals the intended role membership."],
};
