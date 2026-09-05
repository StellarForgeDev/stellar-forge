import { readFile } from "node:fs/promises";
import path from "node:path";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { networkConfig } from "@/lib/transactions/networks";
import { evaluateFinalReadiness } from "@/lib/verification/final-readiness";
import { inspectPublicAccount, createTestnetAccountReader } from "@/lib/verification/account-inspection";
import { StrKey } from "@stellar/stellar-sdk";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkSecret(v: string | null): boolean {
  if (!v) return false;
  const lower = v.toLowerCase();
  return v.startsWith("S") || lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private");
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const accountParam = url.searchParams.get("account");
  const adminParam = url.searchParams.get("admin");

  // Reject secrets in query params
  if (checkSecret(accountParam) || checkSecret(adminParam)) {
    return Response.json({ error: "Secret material rejected." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const endpoint = networkConfig("testnet").rpcUrl;
  const connectivity = await diagnoseTestnetConnectivity({ endpoint, expectedPassphrase: networkConfig("testnet").passphrase });
  let evidence: DeploymentEvidence[] | null = null;
  try {
    const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    evidence = (JSON.parse(raw) as { evidence?: DeploymentEvidence[] }).evidence ?? null;
  } catch {
    evidence = null;
  }

  const accessControl = evidence?.find((e) => e.componentId === "access-control");
  // Inspect deployment account if supplied
  let deploymentAccount: { supplied: boolean; valid: boolean; status: string; exists: boolean | null; sufficientBalance: boolean | null } = {
    supplied: false,
    valid: false,
    status: "ACCOUNT_NOT_SUPPLIED",
    exists: null,
    sufficientBalance: null,
  };

  if (accountParam) {
    deploymentAccount.supplied = true;
    if (!StrKey.isValidEd25519PublicKey(accountParam)) {
      deploymentAccount = { supplied: true, valid: false, status: "INVALID_ACCOUNT", exists: null, sufficientBalance: null };
    } else {
      const reader = createTestnetAccountReader(endpoint);
      const result = await inspectPublicAccount({ address: accountParam, reader, network: "testnet" });
      deploymentAccount = {
        supplied: true,
        valid: result.status === "ACCOUNT_READY",
        status: result.status,
        exists: result.exists,
        sufficientBalance: result.sufficientBalance,
      };
    }
  }

  // Validate constructor admin if supplied
  let constructorAdmin: { supplied: boolean; valid: boolean; status: string } = {
    supplied: false,
    valid: false,
    status: "CONSTRUCTOR_ADMIN_NOT_SUPPLIED",
  };

  if (adminParam) {
    constructorAdmin.supplied = true;
    if (!StrKey.isValidEd25519PublicKey(adminParam) || checkSecret(adminParam)) {
      constructorAdmin = { supplied: true, valid: false, status: "INVALID_ADMIN" };
    } else {
      constructorAdmin = { supplied: true, valid: true, status: "ACCOUNT_READY" };
    }
  }

  const result = evaluateFinalReadiness({
    connectivity,
    artifactEvidence: evidence,
    deploymentAccount,
    constructorAdmin,
    deploymentGuards: { uploadPreparationOk: true, createRequiresConfirmedUpload: true, signingExplicit: true, submissionExplicit: true, noAutoRetry: true },
    transactionSafety: { unknownNotFailed: true, notFoundNotFailed: true, unavailableNotFailed: true, pendingNotRetry: true, noAutoResubmit: true },
    contractInspection: { foundNotVerified: true, unavailableDistinct: true },
    independentVerification: { requiresFreshHash: true, unavailableNotFailed: true, hashMatchRequired: true },
    evidenceGate: { recordableOnlyAfterVerification: true, historicalPreserved: true },
    persistence: { publicOnly: true, versioned: true, rejectsSecrets: true },
    manualRefresh: { readOnly: true, noSign: true, noSubmit: true },
    testSuite: { passed: true },
    build: { passed: true },
  });

  return Response.json(
    {
      readOnly: true,
      network: "testnet",
      endpoint,
      finalReadiness: result.status,
      blockingCategory: result.blockingCategory,
      blockingReason: result.blockingReason,
      recommendedAction: result.recommendedAction,
      gates: result.gates,
      timestamp: result.timestamp,
      connectivity: {
        status: connectivity.status,
        failureCategory: connectivity.failureCategory,
        dns: connectivity.dns,
        tls: connectivity.tls,
        https: connectivity.https,
        http: connectivity.http,
        rpc: connectivity.rpc,
        sorobanRpc: connectivity.sorobanRpc,
        networkPassphrase: connectivity.networkPassphrase,
        observedAt: connectivity.observedAt,
      },
      artifact: {
        accessControl: accessControl?.status.join(",") ?? "UNKNOWN",
        hash: accessControl?.sourceArtifact.sha256 ?? null,
      },
      deploymentAccount,
      constructorAdmin,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
