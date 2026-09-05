import { readFile } from "node:fs/promises";
import path from "node:path";
import { environmentProfiles } from "@/lib/verification/environment-profiles";
import { buildReadinessMatrix } from "@/lib/verification/environment-preflight";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";
import type { EnvironmentContext } from "@/lib/verification/environment-types";
import { StateBadge } from "@/components/ui/StateBadge";

export default async function TestnetEnvironmentPage() {
  const context = await readContext();
  const matrix = buildReadinessMatrix(environmentProfiles, context);
  return <main className="min-w-0 flex-1"><section className="mx-auto max-w-7xl px-6 py-16"><div className="flex flex-wrap gap-3"><StateBadge tone="testnet">TESTNET ENVIRONMENT</StateBadge><StateBadge tone="neutral">READ-ONLY</StateBadge></div><h1 className="mt-5 font-display text-4xl font-medium text-text-primary sm:text-5xl">Environment readiness</h1><p className="mt-5 max-w-4xl text-base leading-7 text-text-secondary">Deterministic planning for accounts, assets, dependencies, authorization, time, fixtures, artifacts, and deployments required before live verification. This page has no signing or submission controls.</p><div className="mt-8 overflow-x-auto rounded-default border border-border bg-surface"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="border-b border-border font-mono uppercase text-text-secondary"><tr><th className="p-3">Component</th><th className="p-3">Artifact</th><th className="p-3">Deployment</th><th className="p-3">Accounts</th><th className="p-3">Assets</th><th className="p-3">Time/fixtures</th><th className="p-3">Readiness</th></tr></thead><tbody>{matrix.map((row) => <tr key={row.componentId} className="border-b border-border/60 align-top"><td className="p-3 font-medium text-text-primary">{row.componentId}</td><td className="p-3">{row.artifactVerified ? "GREEN · VERIFIED_MATCH" : "RED · BLOCKED"}</td><td className="p-3">{row.deploymentAvailable ? "GREEN · known" : "YELLOW · evidence only"}</td><td className="p-3">{row.requiredAccountsKnown ? "GREEN" : "YELLOW · missing"}</td><td className="p-3">{row.assetStrategyKnown ? "GREEN" : row.assetsRequired ? "YELLOW · missing" : "GRAY · N/A"}</td><td className="p-3">{row.timeStrategyKnown && row.specialFixtureStrategyKnown ? "GRAY/GREEN · none" : "YELLOW · strategy required"}</td><td className="p-3"><span className={row.readyForExecution ? "text-tone-success" : row.statuses.includes("BLOCKED") ? "text-tone-error" : "text-tone-pending"}>{row.readyForExecution ? "READY_FOR_EXECUTION" : row.readyForPreflight ? "READY_FOR_PREFLIGHT" : row.statuses.join(", ")}</span><div className="mt-1 max-w-xs text-text-secondary">{row.blockers.join(" ")}</div></td></tr>)}</tbody></table></div></section></main>;
}

async function readContext(): Promise<EnvironmentContext> {
  let evidence: DeploymentEvidence[] = [];
  try { evidence = ((JSON.parse(await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8")) as { evidence?: DeploymentEvidence[] }).evidence ?? []); } catch { /* report unknown evidence */ }
  let controlled: Record<string, { contractId: string; artifactVerified: boolean }> = {};
  try { const records = JSON.parse(await readFile(path.join(process.cwd(), "contracts", "testnet-verification-deployments.json"), "utf8")) as Array<{ componentId?: string; contractId?: string; artifactVerified?: boolean }>; controlled = Object.fromEntries(records.filter((record) => record.componentId && record.contractId && record.artifactVerified).map((record) => [record.componentId, { contractId: record.contractId!, artifactVerified: true }])); } catch { /* empty registry is valid */ }
  return { accounts: {}, assets: {}, deployments: Object.fromEntries(evidence.map((item) => [item.componentId, item.contractId])), artifactStatuses: Object.fromEntries(evidence.map((item) => [item.componentId, [...item.status]])), controlledDeployments: controlled };
}
