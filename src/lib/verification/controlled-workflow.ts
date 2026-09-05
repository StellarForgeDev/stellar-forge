import type { ParameterSpec } from "../../data/components";
import { buildInvocationArgs } from "../transactions/args";
import { simulateSorobanInvocation, type SimulateInvocationResult } from "../transactions/rpc";
import { ACCESS_CONTROL_WORKFLOW } from "./network-workflow";

export interface ControlledWorkflowCall { componentId: string; contractId: string; method: string; parameters: Record<string, string>; }

/** Builds calls against the newly recorded controlled contract, never the static registry. */
export async function prepareControlledWorkflowCall(input: ControlledWorkflowCall, params: ParameterSpec[]): Promise<SimulateInvocationResult> {
  if (input.componentId !== ACCESS_CONTROL_WORKFLOW.componentId) return { ok: false, error: { code: "network.unsupported", message: "Only the Access Control pilot is enabled." } };
  const args = buildInvocationArgs(params, input.parameters);
  if (!args.ok) return { ok: false, error: args.error };
  return simulateSorobanInvocation({ network: "testnet", contractAddress: input.contractId, method: input.method, args: args.scVals, sourceAccount: input.parameters.sourceAccount ?? "" });
}
