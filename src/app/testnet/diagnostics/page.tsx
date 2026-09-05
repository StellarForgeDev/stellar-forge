import { readFile } from "node:fs/promises";
import path from "node:path";
import { StateBadge } from "@/components/ui/StateBadge";
import { DiagnosticsRefreshButton } from "@/components/testnet/DiagnosticsRefreshButton";
import { AccountReadinessChecker } from "@/components/testnet/AccountReadinessChecker";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";

interface Diagnostic {
  endpoint?: string;
  network?: string;
  dns?: string;
  tls?: string;
  https?: string;
  http?: string;
  httpResponse?: string;
  rpc?: string;
  rpcTransport?: string;
  sorobanRpc?: string;
  networkMetadata?: string;
  networkPassphrase?: string;
  status?: string;
  failureCategory?: string;
  error?: string;
  errorName?: string;
  errorCode?: string;
  errorMessage?: string;
  causeName?: string;
  causeCode?: string;
  causeMessage?: string;
  httpStatus?: number;
  rpcMethod?: string;
  timeoutMs?: number;
  latencyMs?: number;
  observedAt?: string;
  runtime?: string;
  attemptCount?: number;
}

export default async function TestnetDiagnosticsPage() {
  const { diagnostic, evidence, registry } = await readEvidenceFile();
  const overallStatus = diagnostic.status === "NETWORK_OK" || diagnostic.status === "HEALTHY" ? "NETWORK_OK" : diagnostic.status ?? "UNKNOWN";
  const blockingReason = getBlockingReason(diagnostic, evidence);
  const artifactSummary = summarizeArtifacts(evidence);
  const deploymentAccountStatus = "NOT_SUPPLIED" as const; // requires explicit G... via checker
  const constructorAdminStatus = "NOT_SUPPLIED" as const;
  const rows: Array<[string, string]> = [
    ["Canonical Endpoint", diagnostic.endpoint ?? "https://soroban-testnet.stellar.org"],
    ["Network", diagnostic.network ?? "testnet"],
    ["DNS", diagnostic.dns ?? "UNKNOWN"],
    ["TLS", diagnostic.tls ?? "UNKNOWN"],
    ["HTTPS", diagnostic.https ?? diagnostic.tls ?? "UNKNOWN"],
    ["HTTP", diagnostic.http ?? "UNKNOWN"],
    ["HTTP Response", diagnostic.httpResponse ?? diagnostic.http ?? "UNKNOWN"],
    ["RPC Transport", diagnostic.rpcTransport ?? diagnostic.rpc ?? "UNKNOWN"],
    ["Soroban RPC", diagnostic.sorobanRpc ?? "UNKNOWN"],
    ["Network Metadata", diagnostic.networkMetadata ?? "UNKNOWN"],
    ["Passphrase", diagnostic.networkPassphrase ?? "UNKNOWN"],
    ["Overall Classification", overallStatus],
    ["Precise Blocking Reason", blockingReason],
    ["Latency", diagnostic.latencyMs ? `${diagnostic.latencyMs}ms` : "—"],
    ["Attempt Count", String(diagnostic.attemptCount ?? 1)],
    ["Last Observed", diagnostic.observedAt ?? "not recorded"],
    ["Latest Successful Observation", evidence.find((e) => e.latestSuccessfulObservation)?.latestSuccessfulObservation?.observedAt ?? "none — historical preserved"],
    ["Previous Observation", evidence[0]?.observations?.[evidence[0].observations.length - 2]?.observedAt ?? "none"],
    ["Artifact retrieval", `${evidence.length ? summarizeArtifacts(evidence) : "NOT_OBSERVED"}`],
    ["Deployment account readiness", deploymentAccountStatus],
    ["Constructor admin readiness", constructorAdminStatus],
    ["Overall preflight", overallStatus === "NETWORK_OK" && evidence.find((e) => e.componentId === "access-control")?.status.includes("VERIFIED_MATCH") ? "BLOCKED • awaiting account/admin" : "BLOCKED"],
  ];
  return (
    <main className="min-w-0 flex-1">
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex flex-wrap gap-3"><StateBadge tone="testnet">TESTNET DIAGNOSTICS</StateBadge><StateBadge tone="neutral">READ-ONLY</StateBadge></div>
        <h1 className="mt-5 font-display text-4xl font-medium text-text-primary">Connectivity diagnostics</h1>
        <p className="mt-5 text-base leading-7 text-text-secondary">Public Testnet health and configuration observations. This page cannot sign, submit, simulate, deploy, or request wallet access. All checks are read-only and use TLS-validated HTTPS to https://soroban-testnet.stellar.org.</p>

        <div className="mt-8 rounded-default border border-border bg-surface p-5">
          <p className={overallStatus === "NETWORK_OK" ? "text-tone-success" : overallStatus === "BLOCKED" ? "text-tone-error" : "text-text-secondary"}>Overall Classification: {overallStatus}</p>
          <p className="mt-1 font-mono text-xs text-text-secondary">Precise blocking reason: {blockingReason}</p>
          <dl className="mt-5 grid gap-3 text-sm">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[12rem_1fr] gap-3 border-b border-border/60 pb-2"><dt className="font-mono text-xs uppercase text-text-secondary">{label}</dt><dd className="break-all text-text-primary">{value}</dd></div>)}</dl>
          {diagnostic.error && <p className="mt-5 text-sm text-tone-error">{diagnostic.error}</p>}
          {overallStatus === "BLOCKED" && (
            <div className="mt-4 rounded-default border border-border/60 bg-canvas p-3 font-mono text-xs">
              <p className="uppercase text-text-secondary">Sanitized diagnostic details (READ-ONLY)</p>
              <dl className="mt-2 grid gap-2">
                {diagnostic.errorName && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Error Name</dt><dd>{diagnostic.errorName}</dd></div>}
                {diagnostic.errorCode && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Error Code</dt><dd>{diagnostic.errorCode}</dd></div>}
                {diagnostic.errorMessage && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Safe Error Message</dt><dd className="break-all">{diagnostic.errorMessage}</dd></div>}
                {diagnostic.causeName && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Cause Name</dt><dd>{diagnostic.causeName}</dd></div>}
                {diagnostic.causeCode && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Cause Code</dt><dd>{diagnostic.causeCode}</dd></div>}
                {diagnostic.causeMessage && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Cause Message</dt><dd className="break-all">{diagnostic.causeMessage}</dd></div>}
                {diagnostic.httpStatus && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>HTTP Status</dt><dd>{diagnostic.httpStatus}</dd></div>}
                {diagnostic.rpcMethod && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>RPC Method</dt><dd>{diagnostic.rpcMethod}</dd></div>}
                {diagnostic.timeoutMs && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Timeout Ms</dt><dd>{diagnostic.timeoutMs}</dd></div>}
                {diagnostic.runtime && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt>Runtime</dt><dd>{diagnostic.runtime}</dd></div>}
              </dl>
              <p className="mt-2 text-[10px] text-text-secondary">No stack traces, no secrets, bounded recursion.</p>
            </div>
          )}
        </div>

        <DiagnosticsRefreshButton />

        <div className="mt-8 rounded-default border border-border bg-surface p-5">
          <h2 className="font-sans font-medium text-text-primary">Artifact retrieval (15 registered Testnet WASMs)</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">Fetched bytes are hashed and compared against local/prebuilt artifacts. Historical observations are preserved; unavailable results are never converted into mismatches.</p>
          <p className="mt-2 font-mono text-xs text-text-secondary">Registry: {registry.expectedCount ?? 15} expected • {registry.accountedCount ?? 0} accounted • {registry.errors?.length ?? 0} errors</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="border-b border-border font-mono uppercase text-text-secondary"><tr><th className="p-2">Component</th><th className="p-2">Retrieval</th><th className="p-2">Effective</th><th className="p-2">Local hash</th><th className="p-2">Deployed</th></tr></thead>
              <tbody>
                {evidence.length === 0 && <tr><td colSpan={5} className="p-3 text-text-secondary">No evidence recorded.</td></tr>}
                {evidence.map((item) => (
                  <tr key={item.componentId} className="border-b border-border/60">
                    <td className="p-2 font-medium">{item.componentId}</td>
                    <td className="p-2">{item.latestObservation?.confidence ?? "NOT_OBSERVED"} {item.latestObservation?.errorCategory ? `(${item.latestObservation.errorCategory})` : ""}</td>
                    <td className="p-2">{item.effectiveStatus ?? item.status.join(", ")}</td>
                    <td className="p-2 font-mono text-[10px] break-all">{item.sourceArtifact.sha256?.slice(0, 12) ?? "—"}…</td>
                    <td className="p-2 font-mono text-[10px] break-all">{item.deployedArtifact.sha256?.slice(0, 12) ?? "unavailable"} {item.status.includes("VERIFIED_MATCH") ? "VERIFIED" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[11px] text-text-secondary">{artifactSummary}</p>
        </div>

        <AccountReadinessChecker />

        <div className="mt-8 rounded-default border border-border bg-surface p-5">
          <h2 className="font-sans font-medium text-text-primary">Access Control pilot preflight</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">Requires: Testnet confirmed • RPC healthy • artifact VERIFIED_MATCH • deployment account explicitly supplied • deployment account exists • deployment account sufficiently funded • constructor admin explicitly supplied • constructor admin valid • deployment plan valid. Only when every gate satisfied → READY_FOR_LIVE_DEPLOYMENT. Otherwise precise blocker.</p>
          <div className="mt-4 grid gap-2 text-xs">
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Network</span><span className={diagnostic.networkPassphrase === "PASS" && overallStatus === "NETWORK_OK" ? "text-tone-success" : "text-tone-error"}>{diagnostic.networkPassphrase === "PASS" && overallStatus === "NETWORK_OK" ? "GREEN · Testnet confirmed" : "RED · BLOCKED"}</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">RPC</span><span className={diagnostic.rpc === "PASS" && diagnostic.sorobanRpc === "PASS" ? "text-tone-success" : "text-tone-error"}>{diagnostic.rpc === "PASS" && diagnostic.sorobanRpc === "PASS" ? "GREEN · RPC healthy" : "RED · RPC unavailable"}</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Artifact</span><span className={evidence.find((e) => e.componentId === "access-control")?.status.includes("VERIFIED_MATCH") ? "text-tone-success" : "text-tone-error"}>{evidence.find((e) => e.componentId === "access-control")?.status.includes("VERIFIED_MATCH") ? "GREEN · VERIFIED_MATCH (independently observed artifact parity)" : "RED · BLOCKED"}</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Deployment account</span><span className="text-tone-pending">AWAITING EXPLICIT G... • ACCOUNT_NOT_SUPPLIED (manual check above)</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Constructor admin</span><span className="text-tone-pending">AWAITING EXPLICIT G... • admin==address? No, separate concepts (even if same G...)</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Overall preflight</span><span className={overallStatus === "NETWORK_OK" && evidence.find((e) => e.componentId === "access-control")?.status.includes("VERIFIED_MATCH") ? "text-tone-pending" : "text-tone-error"}>{overallStatus === "NETWORK_OK" && evidence.find((e) => e.componentId === "access-control")?.status.includes("VERIFIED_MATCH") ? "BLOCKED • ACCOUNT_NOT_SUPPLIED (awaiting explicit funded account + valid admin)" : "BLOCKED"}</span></div>
          </div>
          <p className="mt-3 font-mono text-[11px] text-text-secondary">Blocking reason: {blockingReason}</p>
          <p className="mt-2 font-mono text-[11px] text-text-secondary">Gates: Testnet confirmed: {overallStatus === "NETWORK_OK" ? "PASS" : "FAIL"} • RPC healthy: {diagnostic.rpc === "PASS" && diagnostic.sorobanRpc === "PASS" ? "PASS" : "FAIL"} • artifact VERIFIED_MATCH: {evidence.find((e) => e.componentId === "access-control")?.status.includes("VERIFIED_MATCH") ? "PASS" : "FAIL"} • account supplied: FAIL • account exists: UNKNOWN • sufficient balance: UNKNOWN • admin supplied: FAIL • admin valid: UNKNOWN • plan valid: PENDING</p>
        </div>
        <div className="mt-8 rounded-default border border-border bg-surface p-5">
          <h2 className="font-sans font-medium text-text-primary">Simulation status</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">Two-stage: Stage A WASM upload (PREPARED → SIMULATED → AWAITING_USER_CONFIRMATION) → Stage B creation only after Stage A simulation valid. Never auto-sign/submit.</p>
          <div className="mt-4 grid gap-2 text-xs font-mono">
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Stage A preparation</span><span className="text-tone-pending">BLOCKED • preflight ACCOUNT_NOT_SUPPLIED</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Stage A simulation</span><span className="text-text-secondary">NOT_STARTED • SIMULATION_UNAVAILABLE until preflight READY</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Stage B preparation</span><span className="text-text-secondary">BLOCKED • awaiting Stage A SIMULATED</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Stage B simulation</span><span className="text-text-secondary">NOT_STARTED</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">User confirmation</span><span className="text-text-secondary">AWAITING_USER_CONFIRMATION • explicit confirmation required before signing</span></div>
            <div className="grid grid-cols-[14rem_1fr] gap-2"><span className="text-text-secondary">Overall simulation</span><span className="text-tone-error">BLOCKED • SIMULATION_UNAVAILABLE (preflight not READY)</span></div>
          </div>
          <p className="mt-3 font-mono text-[11px] text-text-secondary">If simulation were successful, UI would explicitly state: “Simulation succeeded. No transaction has been signed. No transaction has been submitted. No contract has been deployed.”</p>
        </div>

        <div className="mt-8 rounded-default border border-border bg-surface p-5">
          <h2 className="font-sans font-medium text-text-primary">Evidence progression</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">Allowed: no evidence → prepared → simulated → user confirmation → signed → submitted → confirmed → independently verified → recorded. Never allowed: simulated → verified, confirmed → verified, prepared → deployed.</p>
          <p className="mt-2 font-mono text-xs text-text-secondary">Current deployment evidence: {artifactSummary.includes("VERIFIED") ? "verified" : "not yet verified"}</p>
        </div>
      </section>
    </main>
  );
}

async function readEvidenceFile(): Promise<{ diagnostic: Diagnostic; evidence: DeploymentEvidence[]; registry: { expectedCount?: number; accountedCount?: number; errors?: string[] } }> {
  try {
    const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    const parsed = JSON.parse(raw) as { connectivity?: Diagnostic; evidence?: DeploymentEvidence[]; registry?: { expectedCount?: number; accountedCount?: number; errors?: string[] } };
    return { diagnostic: parsed.connectivity ?? {}, evidence: parsed.evidence ?? [], registry: parsed.registry ?? {} };
  } catch {
    return { diagnostic: {}, evidence: [], registry: {} };
  }
}

function getBlockingReason(diagnostic: Diagnostic, evidence: DeploymentEvidence[]): string {
  if (diagnostic.failureCategory && diagnostic.failureCategory !== "NETWORK_OK") return diagnostic.failureCategory;
  if (diagnostic.status === "BLOCKED") return diagnostic.error ?? "RPC_BLOCKED";
  if (diagnostic.dns === "FAIL") return "DNS_FAILURE";
  if (diagnostic.tls === "FAIL") return "TLS_FAILURE";
  if (diagnostic.http === "FAIL") return "HTTP_FAILURE";
  if (diagnostic.rpc === "FAIL" || diagnostic.sorobanRpc === "FAIL") return "RPC_UNAVAILABLE";
  const access = evidence.find((e) => e.componentId === "access-control");
  if (!access) return "ARTIFACT_EVIDENCE_MISSING";
  if (!access.status.includes("VERIFIED_MATCH")) return `ARTIFACT_${access.effectiveStatus ?? access.status[0] ?? "BLOCKED"}`;
  if (evidence.length < 15) return "ARTIFACT_RETRIEVAL_INCOMPLETE";
  const unavailable = evidence.filter((e) => e.effectiveStatus === "TRANSIENT_FAILURE" || e.status.includes("DEPLOYMENT_UNAVAILABLE"));
  if (unavailable.length) return `RPC_RETRIEVAL_TRANSIENT (${unavailable.length}/15 unavailable)`;
  return "AWAITING_EXPLICIT_ACCOUNT_AND_SIMULATION";
}

function summarizeArtifacts(evidence: DeploymentEvidence[]): string {
  if (!evidence.length) return "No evidence.";
  const verified = evidence.filter((e) => e.status.includes("VERIFIED_MATCH")).length;
  const mismatch = evidence.filter((e) => e.status.includes("DEPLOYMENT_MISMATCH")).length;
  const unavailable = evidence.filter((e) => e.status.includes("DEPLOYMENT_UNAVAILABLE")).length;
  const transient = evidence.filter((e) => e.effectiveStatus === "TRANSIENT_FAILURE").length;
  return `${evidence.length} components • ${verified} VERIFIED_MATCH • ${mismatch} mismatch • ${unavailable} unavailable • ${transient} transient`;
}
