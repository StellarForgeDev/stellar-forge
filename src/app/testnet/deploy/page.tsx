import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { StateBadge } from "@/components/ui/StateBadge";
import { stellarComponents } from "@/data/components";
import type { DeploymentEvidence } from "@/lib/verification/deployment-evidence";
import { ACCESS_CONTROL_WORKFLOW } from "@/lib/verification/network-workflow";
import { ControlledDeploymentPanel } from "@/components/testnet/ControlledDeploymentPanel";
import { verifyArtifactEvidence } from "@/lib/verification/artifact-evidence-verification";

export default async function ControlledDeploymentPage() {
  const evidence = await readEvidence();
  const verification = await verifyArtifactEvidence(ACCESS_CONTROL_WORKFLOW.componentId);
  const isVerified = verification.status === "VERIFIED_MATCH";

  const eligible = stellarComponents.filter((component) => component.capabilities.testnet && component.interface?.some((method) => method.name === "__constructor"));
  const accessControl = eligible.find((component) => component.slug === ACCESS_CONTROL_WORKFLOW.componentId);
  const accessEvidence = evidence.find((item) => item.componentId === ACCESS_CONTROL_WORKFLOW.componentId);
  const connectivity = await readConnectivity();
  const localHash = "wasmHash" in verification ? verification.wasmHash : (accessEvidence?.sourceArtifact.sha256 ?? "");
  return (
    <main className="min-w-0 flex-1"><section className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-wrap gap-3"><StateBadge tone="testnet">CONTROLLED TESTNET DEPLOYMENT</StateBadge><StateBadge tone="local">DRY-RUN READY</StateBadge></div>
      <h1 className="mt-5 font-display text-4xl font-medium text-text-primary sm:text-5xl">Deploy a verification contract</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-text-secondary">Creates a new contract on Stellar Testnet for verification purposes. It requires wallet signing and explicit confirmation. No deployment occurs on page load or during dry-run.</p>
      <div className="mt-8 rounded-default border border-tone-onchain/40 bg-tone-onchain/5 p-5"><p className="font-mono text-xs uppercase tracking-[0.16em] text-accent-stellar">Eligibility is evidence-driven</p><p className="mt-3 text-sm leading-6 text-text-secondary">Access Control is currently the only eligible candidate for controlled Testnet deployment. Its current artifact eligibility is {isVerified ? "verified" : "not verified"}.</p><p className="mt-3 text-xs leading-6 text-text-secondary">The deployment definition uses the catalog constructor signature. Constructor values, artifact hash, deployer, transaction hash, contract ID, and confirmation evidence will only be recorded after an independently confirmed deployment.</p></div>
      {accessControl && accessEvidence && <ControlledDeploymentPanel artifactHash={localHash} artifactPath={accessEvidence.sourceArtifact.path} artifactStatus={verification.status} connectivityHealthy={connectivity.status === "NETWORK_OK" || connectivity.status === "HEALTHY"} />}
      <div className="mt-6 rounded-default border border-border bg-surface p-5"><h2 className="font-sans font-medium text-text-primary">Current boundary</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-text-secondary"><li>Dry-run: preflight, operation preparation, and simulation only.</li><li>Execute: explicit confirmation, then the existing wallet signing and submission flow.</li><li>Existing deployment registry entries are never overwritten.</li></ul><Link href="/testnet" className="mt-4 inline-block font-mono text-xs text-accent-stellar hover:underline">Back to Testnet execution →</Link></div>
    </section></main>
  );
}

async function readEvidence(): Promise<DeploymentEvidence[]> { try { const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8"); return (JSON.parse(raw) as { evidence?: DeploymentEvidence[] }).evidence ?? []; } catch { return []; } }
async function readConnectivity(): Promise<{ status?: string }> { try { const raw = await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8"); return (JSON.parse(raw) as { connectivity?: { status?: string } }).connectivity ?? {}; } catch { return {}; } }
