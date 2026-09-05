import { StrKey } from "@stellar/stellar-sdk";
import type { StellarComponent } from "../../data/components";
import type { TransactionNetwork } from "../transactions/networks.ts";
import { validateTransactionRequest } from "../transactions/validate";
import type { DeploymentEvidence } from "./deployment-evidence.ts";

export const PREFLIGHT_STATUSES = ["READY", "ARTIFACT_MISMATCH", "WALLET_NOT_CONNECTED", "WRONG_NETWORK", "INVALID_CONTRACT", "INVALID_METHOD", "INVALID_ARGUMENTS", "ACCOUNT_UNAVAILABLE"] as const;
export type PreflightStatus = (typeof PREFLIGHT_STATUSES)[number];

export interface NetworkPreflightInput {
  request: { network: TransactionNetwork; component: string; method: string; sourceAccount: string; parameters: Record<string, string> };
  components: readonly StellarComponent[];
  artifactEvidence: DeploymentEvidence | null;
  wallet: { connected: boolean; networkPassphrase: string | null; accountAvailable: boolean };
  expectedTestnetPassphrase: string;
}

export interface NetworkPreflightResult { status: PreflightStatus; errors: string[]; canProceed: boolean; readOnlyOnly: boolean; }

export function runNetworkPreflight(input: NetworkPreflightInput): NetworkPreflightResult {
  const errors: string[] = [];
  const component = input.components.find((candidate) => candidate.slug === input.request.component);
  const evidenceReady = input.artifactEvidence?.status.includes("VERIFIED_MATCH") === true;
  if (!evidenceReady) errors.push("The deployment does not have VERIFIED_MATCH artifact evidence.");
  if (input.request.network !== "testnet") errors.push("Network workflow execution is restricted to Stellar Testnet.");
  if (!input.wallet.connected) errors.push("Connect a wallet before preparing a Testnet transaction.");
  if (input.wallet.connected && input.wallet.networkPassphrase !== input.expectedTestnetPassphrase) errors.push("The connected wallet is not on Stellar Testnet.");
  if (!input.wallet.accountAvailable) errors.push("The source account is unavailable on Testnet.");
  if (!input.artifactEvidence?.contractId || !StrKey.isValidContract(input.artifactEvidence.contractId)) errors.push("The verified deployment has no valid contract ID.");
  if (!component) errors.push("The requested component is not in the catalog.");
  const validation = validateTransactionRequest(input.request, input.components as StellarComponent[]);
  for (const error of validation.errors) {
    if (error.code === "method.missing" || error.code === "method.constructor") errors.push(error.message);
    else errors.push(error.message);
  }
  const methodInvalid = errors.some((error) => /method/i.test(error));
  const argumentsInvalid = errors.some((error) => /parameter|argument/i.test(error));
  const status: PreflightStatus = !evidenceReady ? "ARTIFACT_MISMATCH" : !input.wallet.connected ? "WALLET_NOT_CONNECTED" : input.request.network !== "testnet" || (input.wallet.connected && input.wallet.networkPassphrase !== input.expectedTestnetPassphrase) ? "WRONG_NETWORK" : !input.wallet.accountAvailable ? "ACCOUNT_UNAVAILABLE" : !input.artifactEvidence?.contractId || !StrKey.isValidContract(input.artifactEvidence.contractId) ? "INVALID_CONTRACT" : methodInvalid ? "INVALID_METHOD" : argumentsInvalid || !validation.ok ? "INVALID_ARGUMENTS" : "READY";
  return { status, errors, canProceed: status === "READY", readOnlyOnly: input.request.method === "has_role" };
}
