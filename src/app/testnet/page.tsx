import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { StateBadge } from "@/components/ui/StateBadge";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";
import { ACCESS_CONTROL_WORKFLOW } from "@/lib/verification/network-workflow";
import { ControlledWorkflowPanel } from "@/components/testnet/ControlledWorkflowPanel";

export default async function TestnetExecutionPage() {
  const evidence = await readAccessControlEvidence();
  const controlledDeployment = await readControlledDeployment();
  const artifactReady = evidence?.status.includes("VERIFIED_MATCH") === true;
  return (
    <main className="min-w-0 flex-1">
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-center gap-3">
          <StateBadge tone="testnet">NETWORK: Stellar Testnet</StateBadge>
          <StateBadge tone="local">REAL TRANSACTIONS</StateBadge>
        </div>
        <ControlledWorkflowPanel deployment={controlledDeployment} />
        <h1 className="mt-5 font-display text-4xl font-medium text-text-primary sm:text-5xl">Controlled Testnet Execution</h1>
        <p className="mt-5 max-w-3xl font-sans text-base leading-7 text-text-secondary">
          This is a separate, observation-first foundation for real network workflow verification. Wallet authorization is required, state changes are permanent on Testnet, and nothing signs or submits automatically.
        </p>
        <div className="mt-8 rounded-default border border-tone-onchain/40 bg-tone-onchain/5 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent-stellar">Access Control candidate</p>
          <p className="mt-3 font-sans text-sm leading-6 text-text-secondary">Workflow: {ACCESS_CONTROL_WORKFLOW.workflowId}. It reads role state, simulates an admin-only grant, waits for explicit user signing/submission, then observes the post-state.</p>
          <p className="mt-3 font-mono text-sm text-text-primary">Artifact evidence: {artifactReady ? "VERIFIED_MATCH" : "NOT READY"}</p>
          {evidence?.status.includes("PROVENANCE_STALE") && <p className="mt-2 font-sans text-xs text-accent-forge">Artifact parity is present, but provenance is stale; this candidate is not marked fully ready.</p>}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-default border border-border bg-surface p-5">
            <h2 className="font-sans font-medium text-text-primary">Dry-run boundary</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">Validation, preparation, and simulation can be exercised without wallet signing or submission. Simulation success never submits a transaction.</p>
          </div>
          <div className="rounded-default border border-border bg-surface p-5">
            <h2 className="font-sans font-medium text-text-primary">Explicit execution boundary</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">The existing transaction builder remains the user-controlled signing and submission surface. No admin identity is assumed for Access Control.</p>
            <Link href="/transactions" className="mt-3 inline-block font-mono text-xs text-accent-stellar hover:underline">Open transaction builder →</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

async function readControlledDeployment(): Promise<{ componentId: string; network: "testnet"; contractId: string; artifactVerified: boolean } | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-verification-deployments.json"), "utf8");
    const records = JSON.parse(raw) as Array<{ componentId?: string; network?: "testnet"; contractId?: string; artifactVerified?: boolean }>;
    const record = records.find((item) => item.componentId === ACCESS_CONTROL_WORKFLOW.componentId && item.network === "testnet" && typeof item.contractId === "string" && item.artifactVerified === true);
    return record?.contractId ? { componentId: ACCESS_CONTROL_WORKFLOW.componentId, network: "testnet", contractId: record.contractId, artifactVerified: true } : null;
  } catch { return null; }
}

async function readAccessControlEvidence(): Promise<DeploymentEvidence | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8");
    const parsed = JSON.parse(raw) as { evidence?: DeploymentEvidence[] };
    return parsed.evidence?.find((item) => item.componentId === ACCESS_CONTROL_WORKFLOW.componentId) ?? null;
  } catch {
    return null;
  }
}
