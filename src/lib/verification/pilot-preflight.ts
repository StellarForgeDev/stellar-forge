import { StrKey } from "@stellar/stellar-sdk";
import type { StellarComponent } from "../../data/components";
import type { ReconciliationStatus } from "./artifact-status";

export const PILOT_PREFLIGHT_STATUSES = ["READY_FOR_LIVE_DEPLOYMENT", "NOT_READY", "PREFLIGHT_BLOCKED", "READY_FOR_DRY_RUN", "NETWORK_UNAVAILABLE", "ACCOUNT_NOT_SUPPLIED", "ARTIFACT_BLOCKED", "SIMULATION_UNAVAILABLE"] as const;
export type PilotPreflightStatus = (typeof PILOT_PREFLIGHT_STATUSES)[number];
export interface PilotPreflightInput { component: StellarComponent | null; network: string; expectedPassphrase: string; wallet: { connected: boolean; networkPassphrase: string | null; address: string | null }; rpcReachable: boolean; artifact: { exists: boolean; sha256: string | null; expectedSha256: string | null; statuses: readonly ReconciliationStatus[] }; constructorAdmin: string; account: { address: string | null; exists: boolean | null; sufficientBalance: boolean | null; sequenceNumber?: string | null; nativeBalance?: string | null }; plans: { uploadValid: boolean; createValid: boolean }; simulation: "SUCCESS" | "UNAVAILABLE" | "FAILED" | "NOT_RUN"; explicitRequest: boolean; connectivity?: { status: string; failureCategory?: string; networkPassphrase: string; rpc: string; sorobanRpc: string }; accountInspection?: { status: string; exists: boolean | null; sufficientBalance: boolean | null } }
export interface PilotPreflightResult { status: PilotPreflightStatus; blockers: string[]; checks: Record<string, "GREEN" | "YELLOW" | "RED" | "GRAY">; gates: Record<string, boolean>; }

export function runAccessControlPilotPreflight(input: PilotPreflightInput): PilotPreflightResult {
  const blockers: string[] = []; const checks: PilotPreflightResult["checks"] = {}; const gates: Record<string, boolean> = {};
  const wallet = (input.wallet as PilotPreflightInput["wallet"] | undefined) ?? { connected: false, networkPassphrase: null, address: null };
  const artifact = (input.artifact as PilotPreflightInput["artifact"] | undefined) ?? { exists: false, sha256: null, expectedSha256: null, statuses: [] as readonly ReconciliationStatus[] };
  const account = (input.account ?? { address: null, exists: null, sufficientBalance: null }) as NonNullable<PilotPreflightInput["account"]>;
  // Gate 1: Testnet network confirmed
  const networkConfirmed = (input.network ?? "testnet") === "testnet" && Boolean(wallet.connected) && wallet.networkPassphrase === input.expectedPassphrase;
  gates.testnetNetworkConfirmed = networkConfirmed;
  if (!networkConfirmed) { blockers.push("Testnet network is required."); checks.network = "RED"; } else if (input.connectivity && input.connectivity.networkPassphrase === "FAIL") { blockers.push("Testnet network passphrase mismatch (PASSPHRASE_MISMATCH)."); checks.network = "RED"; gates.testnetNetworkConfirmed = false; } else checks.network = "GREEN";
  // Gate 2: RPC healthy — unknown must not be treated as success
  const rpcHealthy = Boolean(input.rpcReachable) && (!input.connectivity || (input.connectivity.rpc === "PASS" && input.connectivity.sorobanRpc === "PASS"));
  gates.rpcHealthy = rpcHealthy;
  if (!rpcHealthy) { blockers.push("Testnet RPC is unavailable."); checks.rpc = "RED"; } else checks.rpc = "GREEN";
  // Gate 3: artifact VERIFIED_MATCH
  const artifactVerified = Boolean(artifact.exists && artifact.sha256 && artifact.expectedSha256 === artifact.sha256 && artifact.statuses.includes("VERIFIED_MATCH"));
  gates.artifactVerified = artifactVerified;
  if (!artifact.exists || !artifact.sha256) { blockers.push("The local Access Control artifact is unavailable."); checks.artifact = "RED"; } else if (!artifactVerified) { blockers.push("Artifact integrity/evidence is not VERIFIED_MATCH."); checks.artifact = "RED"; } else checks.artifact = "GREEN";
  // Gate 4: explicit deployment account
  const explicitAccount = Boolean(account.address);
  gates.explicitDeploymentAccount = explicitAccount;
  // Gate 5: deployment account exists
  const accountExists = input.accountInspection ? input.accountInspection.exists === true : account.exists === true;
  gates.deploymentAccountExists = Boolean(explicitAccount && accountExists);
  // Gate 6: sufficient native balance
  const sufficientBalance = input.accountInspection ? input.accountInspection.sufficientBalance === true : account.sufficientBalance === true;
  gates.sufficientNativeBalance = Boolean(sufficientBalance);
  if (!explicitAccount || !accountExists) { blockers.push("The deployment account is unavailable or does not exist."); checks.account = "RED"; } else if (!sufficientBalance) { blockers.push("The deployment account has insufficient or unobserved native balance."); checks.account = "RED"; } else checks.account = "GREEN";
  // Gate 7: explicit constructor admin — never default to deployment account, never hardcoded, validate as G..., reject secrets
  const explicitAdmin = Boolean(input.constructorAdmin);
  const adminTrimmed = (input.constructorAdmin ?? "").trim();
  const adminLower = adminTrimmed.toLowerCase();
  const adminIsSecret = adminTrimmed.startsWith("S") || adminLower.includes("secret") || adminLower.includes("seed") || adminLower.includes("mnemonic") || adminLower.includes("private") || adminLower.includes("private_key") || adminLower.includes("secret_key");
  gates.explicitConstructorAdmin = explicitAdmin;
  if (!explicitAdmin) { blockers.push("An explicit constructor admin address is required."); checks["constructor"] = "YELLOW"; gates.validConstructorAdmin = false; } else if (adminIsSecret) { blockers.push("Constructor admin secret material rejected. Provide only a public G... address."); checks["constructor"] = "RED"; gates.validConstructorAdmin = false; } else if (!StrKey.isValidEd25519PublicKey(adminTrimmed)) { blockers.push("Constructor admin is not a valid Stellar account address."); checks["constructor"] = "RED"; gates.validConstructorAdmin = false; } else { checks["constructor"] = "GREEN"; gates.validConstructorAdmin = true; }
  if (!explicitAdmin || adminIsSecret || !StrKey.isValidEd25519PublicKey(adminTrimmed)) {
    gates.validConstructorAdmin = false;
  }
  if (!input.component) blockers.push("Access Control is missing from the catalog.");
  if (!input.plans?.uploadValid) blockers.push("Upload deployment plan is invalid.");
  if (!input.plans?.createValid) blockers.push("Create deployment plan is invalid.");
  if (!input.explicitRequest) blockers.push("Deployment must be explicitly requested by the user.");
  if ((input.simulation ?? "NOT_RUN") === "FAILED") blockers.push("Deployment simulation failed.");
  if ((input.simulation ?? "NOT_RUN") === "UNAVAILABLE") blockers.push("Deployment simulation is unavailable.");
  const sim = input.simulation ?? "NOT_RUN";
  const status: PilotPreflightStatus = !rpcHealthy ? "NETWORK_UNAVAILABLE" : !explicitAccount ? "ACCOUNT_NOT_SUPPLIED" : !artifactVerified ? "ARTIFACT_BLOCKED" : sim === "UNAVAILABLE" ? "SIMULATION_UNAVAILABLE" : blockers.length ? "PREFLIGHT_BLOCKED" : sim === "SUCCESS" ? "READY_FOR_LIVE_DEPLOYMENT" : "READY_FOR_DRY_RUN";
  return { status, blockers: [...new Set(blockers)], checks, gates };
}

export interface AccessControlPreflightAssessment {
  network: "testnet";
  endpoint: string;
  connectivity: { status: string; failureCategory?: string };
  artifact: { status: string; verified: boolean };
  account: { status: string; exists: boolean | null; sufficientBalance: boolean | null };
  constructorAdmin: { supplied: boolean; valid: boolean };
  preflight: PilotPreflightResult;
}

export function assessAccessControlPreflight(input: {
  network: string;
  endpoint: string;
  connectivity: { status: string; failureCategory?: string; networkPassphrase: string; rpc: string; sorobanRpc: string };
  artifact: { exists: boolean; sha256: string | null; expectedSha256: string | null; statuses: readonly ReconciliationStatus[] };
  account: { address: string | null; exists: boolean | null; sufficientBalance: boolean | null };
  accountInspection?: { status: string; exists: boolean | null; sufficientBalance: boolean | null };
  constructorAdmin: string;
  component: StellarComponent | null;
  plans: { uploadValid: boolean; createValid: boolean };
  simulation: "SUCCESS" | "UNAVAILABLE" | "FAILED" | "NOT_RUN";
  explicitRequest: boolean;
  wallet: { connected: boolean; networkPassphrase: string | null; address: string | null };
  expectedPassphrase: string;
}): AccessControlPreflightAssessment {
  const result = runAccessControlPilotPreflight({
    component: input.component,
    network: input.network,
    expectedPassphrase: input.expectedPassphrase,
    wallet: input.wallet,
    rpcReachable: input.connectivity.rpc === "PASS" && input.connectivity.sorobanRpc === "PASS",
    artifact: input.artifact,
    constructorAdmin: input.constructorAdmin,
    account: input.account,
    plans: input.plans,
    simulation: input.simulation,
    explicitRequest: input.explicitRequest,
    connectivity: input.connectivity,
    accountInspection: input.accountInspection,
  });
  return {
    network: "testnet",
    endpoint: input.endpoint,
    connectivity: { status: input.connectivity.status, failureCategory: input.connectivity.failureCategory },
    artifact: { status: input.artifact.statuses.join(",") || "UNKNOWN", verified: input.artifact.statuses.includes("VERIFIED_MATCH") },
    account: { status: input.accountInspection?.status ?? (input.account.exists ? "ACCOUNT_READY" : "ACCOUNT_NOT_SUPPLIED"), exists: input.account.exists, sufficientBalance: input.account.sufficientBalance },
    constructorAdmin: { supplied: Boolean(input.constructorAdmin), valid: input.constructorAdmin ? StrKey.isValidEd25519PublicKey(input.constructorAdmin) : false },
    preflight: result,
  };
}
