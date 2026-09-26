import { readFile } from "node:fs/promises";
import path from "node:path";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { networkConfig } from "@/lib/transactions/networks";
import { inspectPublicAccount, createTestnetAccountReader } from "@/lib/verification/account-inspection";
import { StrKey } from "@stellar/stellar-sdk";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";
import { verifyCandidateArtifact, verifyHistoricalArtifact } from "@/lib/verification/artifact-provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const accountParam = url.searchParams.get("account");
  const adminParam = url.searchParams.get("admin");

  // Never accept secret material via query
  const lowerAccount = accountParam?.toLowerCase() ?? "";
  const lowerAdmin = adminParam?.toLowerCase() ?? "";
  if (
    (accountParam && (accountParam.startsWith("S") || lowerAccount.includes("secret") || lowerAccount.includes("seed") || lowerAccount.includes("mnemonic") || lowerAccount.includes("private"))) ||
    (adminParam && (adminParam.startsWith("S") || lowerAdmin.includes("secret") || lowerAdmin.includes("seed") || lowerAdmin.includes("mnemonic") || lowerAdmin.includes("private")))
  ) {
    return Response.json({ error: "Secret material rejected." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const endpoint = networkConfig("testnet").rpcUrl;
  const expectedPassphrase = networkConfig("testnet").passphrase;

  // Read-only diagnostics: connectivity via live read-only RPC, artifact via file
  const connectivity = await diagnoseTestnetConnectivity({ endpoint, expectedPassphrase });
  let evidence: DeploymentEvidence[] = [];
  try {
    const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    evidence = (JSON.parse(raw) as { evidence?: DeploymentEvidence[] }).evidence ?? [];
  } catch {
    evidence = [];
  }

  const accessControl = evidence.find((e) => e.componentId === "access-control");
  const candidateVerification = await verifyCandidateArtifact("access-control");
  const historicalVerification = await verifyHistoricalArtifact("access-control");

  const artifactRetrieval = evidence.length ? `${evidence.length} historical components observed` : "NOT_OBSERVED";

  // Account readiness: if account supplied, inspect read-only via Horizon; else NOT_SUPPLIED
  let accountReadiness: { status: string; exists: boolean | null; sufficientBalance: boolean | null; nativeBalance: string | null; network: string } = { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null, nativeBalance: null, network: "testnet" };
  if (accountParam) {
    const reader = createTestnetAccountReader(endpoint);
    const result = await inspectPublicAccount({ address: accountParam, reader, network: "testnet" });
    accountReadiness = { status: result.status, exists: result.exists, sufficientBalance: result.sufficientBalance, nativeBalance: result.nativeBalance, network: result.network };
  }

  // Constructor admin readiness: check explicit G... and valid
  let constructorReadiness: { supplied: boolean; valid: boolean; status: string } = { supplied: false, valid: false, status: "NOT_SUPPLIED" };
  if (adminParam) {
    const supplied = Boolean(adminParam);
    const valid = StrKey.isValidEd25519PublicKey(adminParam);
    const isSecret = adminParam.startsWith("S") || adminParam.toLowerCase().includes("secret") || adminParam.toLowerCase().includes("seed");
    constructorReadiness = { supplied, valid: valid && !isSecret, status: !supplied ? "NOT_SUPPLIED" : isSecret ? "BLOCKED • secret rejected" : valid ? "READY • valid G..." : "BLOCKED • INVALID_ACCOUNT" };
  }

  // Preflight synthesis (most precise blocker, no fabrication)
  let preflightStatus = "BLOCKED";
  let blocker = "UNKNOWN";
  if (connectivity.status !== "NETWORK_OK") blocker = connectivity.failureCategory ?? "RPC_UNAVAILABLE";
  else if (candidateVerification.status !== "CANDIDATE_VERIFIED") blocker = `CANDIDATE_ARTIFACT_${candidateVerification.status}`;
  else if (accountReadiness.status !== "ACCOUNT_READY") blocker = accountReadiness.status;
  else if (constructorReadiness.status !== "READY • valid G...") blocker = constructorReadiness.status;
  else { preflightStatus = "READY"; blocker = "READY_FOR_LIVE_DEPLOYMENT (all gates PASS)"; }

  // For Phase 24, never return READY_FOR_LIVE_DEPLOYMENT unless all gates genuinely PASS; in this aggregate endpoint without explicit funded account, will remain BLOCKED
  if (accountReadiness.status !== "ACCOUNT_READY" || constructorReadiness.status !== "READY • valid G...") {
    preflightStatus = "BLOCKED";
    if (connectivity.status === "NETWORK_OK" && candidateVerification.status === "CANDIDATE_VERIFIED") {
      blocker = accountReadiness.status === "ACCOUNT_NOT_SUPPLIED" ? "ACCOUNT_NOT_SUPPLIED" : accountReadiness.status.includes("UNFUNDED") ? "ACCOUNT_UNFUNDED" : constructorReadiness.status;
    }
  }

  return Response.json(
    {
      network: "testnet",
      endpoint,
      connectivity: {
        network: connectivity.network,
        endpoint: connectivity.endpoint,
        dns: connectivity.dns,
        tls: connectivity.tls,
        http: connectivity.http,
        rpc: connectivity.rpc,
        sorobanRpc: connectivity.sorobanRpc,
        networkPassphrase: connectivity.networkPassphrase,
        status: connectivity.status,
        failureCategory: connectivity.failureCategory,
        observedAt: connectivity.observedAt,
        latencyMs: connectivity.latencyMs,
      },
      artifact: {
        authority: "CANDIDATE",
        accessControl: candidateVerification.status,
        accessControlVerified: candidateVerification.status === "CANDIDATE_VERIFIED",
        candidateHash: "candidateHash" in candidateVerification ? candidateVerification.candidateHash : null,
        historicalStatus: historicalVerification.status,
        historicalEvidence: accessControl?.status.join(",") ?? "UNKNOWN",
        retrieval: artifactRetrieval,
        token: evidence.find((e) => e.componentId === "token")?.status.join(",") ?? "UNKNOWN",
        payment: evidence.find((e) => e.componentId === "payment")?.status.join(",") ?? "UNKNOWN",
      },
      account: accountReadiness,
      constructor: constructorReadiness,
      preflight: { status: preflightStatus, blocker, simulationReady: preflightStatus === "READY" ? "SIMULATION_READY" : "BLOCKED" },
      readOnly: true,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
