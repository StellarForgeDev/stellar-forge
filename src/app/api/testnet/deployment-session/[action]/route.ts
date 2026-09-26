import { readFile } from "node:fs/promises";
import path from "node:path";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { networkConfig } from "@/lib/transactions/networks";
import { inspectPublicAccount, createTestnetAccountReader } from "@/lib/verification/account-inspection";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";
import { createDeploymentSession, isValidPublicDeploymentAddress, reconcileDeploymentSession, restoreDeploymentSession, reconcileRestoredSession } from "@/lib/verification/deployment-session";
import { verifyCandidateArtifact, verifyHistoricalArtifact } from "@/lib/verification/artifact-provenance";

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
  const candidateVerification = await verifyCandidateArtifact("access-control");
  const historicalVerification = await verifyHistoricalArtifact("access-control");
  const artifactVerified = candidateVerification.status === "CANDIDATE_VERIFIED";
  const artifactStatus = candidateVerification.status;
  const localHash = "actualHash" in candidateVerification ? candidateVerification.actualHash : null;

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
    artifactHash: "actualHash" in candidateVerification ? candidateVerification.actualHash : null,
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
        localHash: localHash,
        deployedHash: accessControl?.deployedArtifact?.sha256 ?? null,
        authority: "CANDIDATE",
        candidateHash: "candidateHash" in candidateVerification ? candidateVerification.candidateHash : null,
        historicalStatus: historicalVerification.status,
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

async function handleRestore(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const serialized = body && typeof body === "object" && typeof (body as Record<string, unknown>).serialized === "string" ? (body as Record<string, string>).serialized : null;
  const account = body && typeof body === "object" && typeof (body as Record<string, unknown>).account === "string" ? (body as Record<string, string>).account : null;
  const admin = body && typeof body === "object" && typeof (body as Record<string, unknown>).admin === "string" ? (body as Record<string, string>).admin : null;

  const restored = restoreDeploymentSession(serialized);
  if (restored.status === "INVALID_PERSISTENCE") {
    return Response.json({ status: "INVALID_PERSISTENCE", error: restored.error, readOnly: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  if (!restored.session) {
    return Response.json({ status: "INVALID_PERSISTENCE", error: "No session.", readOnly: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  // Fresh read-only reconciliation required — do not automatically perform wallet connection, signing, etc.
  const endpoint = networkConfig("testnet").rpcUrl;
  const connectivity = await diagnoseTestnetConnectivity({ endpoint, expectedPassphrase: networkConfig("testnet").passphrase });
  const artifactVerification = await verifyCandidateArtifact("access-control");
  const artifactVerified = artifactVerification.status === "CANDIDATE_VERIFIED";
  const artifactStatus = artifactVerification.status;

  // Determine account status if supplied, else NOT_SUPPLIED
  let accountStatus: { status: string; exists: boolean | null; sufficientBalance: boolean | null } = { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null };
  if (account) {
    // For restore, we don't re-inspect account automatically; we require explicit inspection
    // But if account matches persisted session's account, we can keep historical
    accountStatus = { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null };
  }

  const reconciled = reconcileRestoredSession(restored.session, {
    connectivity: { status: connectivity.status, failureCategory: connectivity.failureCategory },
    artifact: { verified: artifactVerified, status: artifactStatus },
    account: accountStatus,
    constructorAdmin: { supplied: Boolean(admin), valid: Boolean(admin && admin.startsWith("G")) },
  });

  return Response.json(
    {
      readOnly: true,
      restorationStatus: restored.status,
      reconciliationRequired: restored.reconciliationRequired,
      session: reconciled.session,
      status: reconciled.status,
      artifact: {
        authority: "CANDIDATE",
        verified: artifactVerified,
        status: artifactStatus,
        candidateHash: "candidateHash" in artifactVerification ? artifactVerification.candidateHash : null,
        actualHash: "actualHash" in artifactVerification ? artifactVerification.actualHash : null,
      },
      historyLength: reconciled.session.snapshots.length,
      note: "Restored session preserves historical lifecycle state. Current environment requires fresh reconciliation. No signing/submission performed.",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
): Promise<Response> {
  const { action } = await params;
  if (action === "restore") return handleRestore(request);
  if (action === "reconcile") return reconcileRequest(request);
  return Response.json({ error: "Unsupported action." }, { status: 404 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
): Promise<Response> {
  const { action } = await params;
  if (action === "restore") return Response.json({ error: "POST with { serialized } required." }, { status: 405, headers: { "Cache-Control": "no-store" } });
  if (action === "reconcile") return reconcileRequest(request);
  return Response.json({ error: "Unsupported action." }, { status: 404 });
}
