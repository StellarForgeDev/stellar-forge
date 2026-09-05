import { restoreDeploymentSession, reconcileRestoredSession } from "@/lib/verification/deployment-session";
import { diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { networkConfig } from "@/lib/transactions/networks";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
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
  let evidence: DeploymentEvidence[] = [];
  try {
    const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    evidence = (JSON.parse(raw) as { evidence?: DeploymentEvidence[] }).evidence ?? [];
  } catch {}
  const accessControl = evidence.find((e) => e.componentId === "access-control");
  const artifactVerified = Boolean(accessControl?.status.includes("VERIFIED_MATCH"));

  // Determine account status if supplied, else NOT_SUPPLIED
  let accountStatus: { status: string; exists: boolean | null; sufficientBalance: boolean | null } = { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null };
  if (account) {
    // For restore, we don't re-inspect account automatically; we require explicit inspection
    // But if account matches persisted session's account, we can keep historical
    accountStatus = { status: "ACCOUNT_NOT_SUPPLIED", exists: null, sufficientBalance: null };
  }

  const reconciled = reconcileRestoredSession(restored.session, {
    connectivity: { status: connectivity.status, failureCategory: connectivity.failureCategory },
    artifact: { verified: artifactVerified, status: accessControl?.status.join(",") ?? "UNKNOWN" },
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
      historyLength: reconciled.session.snapshots.length,
      note: "Restored session preserves historical lifecycle state. Current environment requires fresh reconciliation. No signing/submission performed.",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(): Promise<Response> {
  return Response.json({ error: "POST with { serialized } required." }, { status: 405, headers: { "Cache-Control": "no-store" } });
}
