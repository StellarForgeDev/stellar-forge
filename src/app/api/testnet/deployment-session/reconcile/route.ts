import { readFile } from "node:fs/promises";
import path from "node:path";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { networkConfig } from "@/lib/transactions/networks";
import { inspectPublicAccount, createTestnetAccountReader } from "@/lib/verification/account-inspection";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";
import { createDeploymentSession, isValidPublicDeploymentAddress, reconcileDeploymentSession, restoreDeploymentSession } from "@/lib/verification/deployment-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function reconcileRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try { const parsed = await request.json(); if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>; }
    catch { return Response.json({ error: "Invalid JSON." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  }
  const accountParam = url.searchParams.get("account") ?? (typeof body.account === "string" ? body.account : null);
  const adminParam = url.searchParams.get("admin") ?? (typeof body.admin === "string" ? body.admin : null);
  const serialized = typeof body.serialized === "string" ? body.serialized : null;
  const recoveryInput = body.uploadRecovery;
  const uploadRecovery = recoveryInput && typeof recoveryInput === "object"
    ? recoveryInput as Record<string, unknown>
    : null;

  // Reject secrets
  const checkSecret = (v: string | null) => {
    if (!v) return false;
    const lower = v.toLowerCase();
    return v.startsWith("S") || lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private");
  };
  const isValidPublicKey = (value: string | null): boolean => isValidPublicDeploymentAddress(value);
  if (checkSecret(accountParam) || checkSecret(adminParam)) {
    return Response.json({ error: "Secret material rejected." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const endpoint = networkConfig("testnet").rpcUrl;
  const expectedPassphrase = networkConfig("testnet").passphrase;

  // Read-only diagnostics: connectivity, artifact, account, constructor
  const connectivity = await diagnoseTestnetConnectivity({ endpoint, expectedPassphrase });
  let evidence: DeploymentEvidence[] = [];
  try {
    const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    evidence = (JSON.parse(raw) as { evidence?: DeploymentEvidence[] }).evidence ?? [];
  } catch {
    evidence = [];
  }
  const accessControl = evidence.find((e) => e.componentId === "access-control");
  const artifactVerified = Boolean(accessControl?.status.includes("VERIFIED_MATCH"));
  const artifactStatus = accessControl?.status.join(",") ?? "UNKNOWN";

  const accountTrimmed = accountParam?.trim() ?? "";
  const isAccountValid = isValidPublicKey(accountParam);
  let accountStatus: { status: string; exists: boolean | null; sufficientBalance: boolean | null } = { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null };
  if (accountTrimmed) {
    if (!isAccountValid) {
      accountStatus = { status: "INVALID_ACCOUNT", exists: null, sufficientBalance: null };
    } else {
      const reader = createTestnetAccountReader(endpoint);
      const result = await inspectPublicAccount({ address: accountTrimmed, reader, network: "testnet" });
      accountStatus = { status: result.status, exists: result.exists, sufficientBalance: result.sufficientBalance };
    }
  }

  const adminTrimmed = adminParam?.trim() ?? "";
  const adminSupplied = Boolean(adminTrimmed);
  const adminValid = isValidPublicKey(adminParam);
  const constructorAdmin = { supplied: adminSupplied, valid: adminValid };

  // Create or load session — for Phase 28, we create a fresh NOT_STARTED and reconcile
  let baseSession = createDeploymentSession({
    artifactHash: accessControl?.sourceArtifact.sha256 ?? null,
    deploymentAccount: isAccountValid ? accountTrimmed : null,
    constructorAdmin: adminValid ? adminTrimmed : null,
  });
  if (serialized) {
    const restored = restoreDeploymentSession(serialized);
    if (restored.status === "INVALID_PERSISTENCE" || !restored.session) return Response.json({ error: restored.error ?? "Invalid persisted session.", readOnly: true }, { status: 400, headers: { "Cache-Control": "no-store" } });
    baseSession = restored.session;
  }

  const reconciled = reconcileDeploymentSession(baseSession, {
    connectivity: { status: connectivity.status, failureCategory: connectivity.failureCategory, observedAt: connectivity.observedAt },
    artifact: { verified: artifactVerified, status: artifactStatus, observedAt: accessControl?.latestObservation?.observedAt },
    account: { status: accountStatus.status, exists: accountStatus.exists, sufficientBalance: accountStatus.sufficientBalance, observedAt: new Date().toISOString() },
    constructorAdmin: { supplied: constructorAdmin.supplied, valid: constructorAdmin.valid, observedAt: new Date().toISOString() },
    uploadRecovery: uploadRecovery
      && typeof uploadRecovery.signedTransactionAvailable === "boolean"
      && (uploadRecovery.uploadHash === null || typeof uploadRecovery.uploadHash === "string")
      && (uploadRecovery.pendingHash === null || typeof uploadRecovery.pendingHash === "string")
      && (uploadRecovery.submissionEvidence === "NO_SUBMISSION_RECORDED" || uploadRecovery.submissionEvidence === "SUBMITTED" || uploadRecovery.submissionEvidence === "PENDING" || uploadRecovery.submissionEvidence === "UNKNOWN")
      ? {
          signedTransactionAvailable: uploadRecovery.signedTransactionAvailable,
          uploadHash: uploadRecovery.uploadHash as string | null,
          pendingHash: uploadRecovery.pendingHash as string | null,
          submissionEvidence: uploadRecovery.submissionEvidence,
        }
      : undefined,
    observedAt: new Date().toISOString(),
  });

  return Response.json(
    {
      readOnly: true,
      network: "testnet",
      endpoint,
      lifecycleState: reconciled.state,
      previousState: reconciled.previousState,
      readinessState: reconciled.state, // authoritative is lifecycle; readiness derived same for prereq states
      blockingReason: reconciled.blockingReason,
      blockingCategory: reconciled.snapshots[reconciled.snapshots.length - 1]?.blockingCategory ?? null,
      reconciliationPerformed: true,
      reconciledAt: reconciled.lastObservedAt,
      observationTimestamp: new Date().toISOString(),
      prerequisiteSnapshot: {
        connectivity: connectivity.status,
        artifact: artifactStatus,
        account: accountStatus.status,
        constructorAdmin: adminSupplied ? (adminValid ? "valid" : "invalid") : "not_supplied",
      },
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
        verified: artifactVerified,
        status: artifactStatus,
        localHash: accessControl?.sourceArtifact.sha256 ?? null,
        deployedHash: accessControl?.deployedArtifact.sha256 ?? null,
      },
      account: accountStatus,
      constructorAdmin,
      sessionId: reconciled.sessionId,
      historyLength: reconciled.snapshots.length,
      session: reconciled,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request): Promise<Response> { return reconcileRequest(request); }
export async function POST(request: Request): Promise<Response> { return reconcileRequest(request); }
