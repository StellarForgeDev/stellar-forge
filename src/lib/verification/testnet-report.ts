// Markdown rendering for the read-only Testnet artifact + behavioral evidence.
//
// Extracted from the CLI harness so the rendering contract (which keeps the
// independent claims visibly separate) can be unit-tested without importing the
// harness itself, which performs network work on load.
//
// Alias-free (type-only imports) so the Node CLI harness can import it.

import type {
  DeploymentEvidence,
  DeploymentStateEvidence,
} from "./deployment-evidence.ts";

export interface RegistryValidationSummary {
  expectedCount: number;
  accountedCount: number;
  errors: string[];
}

export function renderTestnetReport(
  evidence: readonly DeploymentEvidence[],
  registry: RegistryValidationSummary,
  deploymentState: readonly DeploymentStateEvidence[],
): string {
  const count = (status: string) =>
    evidence.filter((item) => item.status.includes(status as never)).length;
  const behaviorCount = (status: string) =>
    deploymentState.filter((item) => item.verification === status).length;

  const lines = [
    "# Testnet Artifact Reconciliation",
    "",
    "Read-only verification report. Each dimension below is an independent claim:",
    "",
    "- **Registry** — a valid Testnet registry entry exists for the component.",
    "- **RPC retrieval** — the on-chain contract WASM was retrieved read-only (this is NOT artifact verification).",
    "- **Behavior observed** — a catalog method explicitly marked `readOnly: true` simulated successfully with a read-only footprint.",
    "- **Artifact parity** — current repository artifact vs. on-chain WASM hash.",
    "- **Provenance** — build metadata versus the current repository commit.",
    "",
    "`RPC retrieval: VERIFIED` means the contract WASM was fetched, nothing more.",
    "Artifact parity does not verify constructor state or workflow behavior; a",
    "successful behavioral probe does not imply exact WASM hash parity; and a",
    "behaviorally reachable contract may still be a hash mismatch.",
    "",
    `- Total components: ${evidence.length}`,
    `- Artifact verified matches: ${count("VERIFIED_MATCH")}`,
    `- Deployment mismatches: ${count("DEPLOYMENT_MISMATCH")}`,
    `- Local artifact mismatches: ${count("LOCAL_ARTIFACT_MISMATCH")}`,
    `- Stale provenance: ${count("PROVENANCE_STALE")}`,
    `- Unavailable deployments: ${count("DEPLOYMENT_UNAVAILABLE")}`,
    `- Unknown: ${count("UNKNOWN")}`,
    `- Behavioral partiallyVerified: ${behaviorCount("partiallyVerified")}`,
    `- Behavioral notVerified: ${behaviorCount("notVerified")}`,
    `- Behavioral notQueryable: ${behaviorCount("notQueryable")}`,
    "",
    `Registry: ${registry.expectedCount} components checked; ${registry.accountedCount} explicitly accounted for${registry.expectedCount === registry.accountedCount && registry.errors.length === 0 ? " (PASS)" : " (FAIL)"}.`,
  ];

  if (registry.errors.length) {
    lines.push(
      "",
      "Registry errors:",
      ...registry.errors.map((error) => `- ${error}`),
    );
  }

  lines.push(
    "",
    "| Component | Contract ID | Registry | Artifact status | Provenance | RPC retrieval | Retrieval confidence | Latest successful | Source | Failure | Local | Prebuilt | Deployed | Behavior | Probe |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );

  const behaviorByComponent = new Map(
    deploymentState.map((item) => [item.componentId, item]),
  );

  for (const item of evidence) {
    const latest = item.latestObservation;
    const successful = item.latestSuccessfulObservation;
    const behavior = behaviorByComponent.get(item.componentId);
    const probe = behavior?.observations?.[0]?.method ?? "—";
    const artifactStatus = item.status.length ? item.status.join(", ") : "none";
    const registryStatus = item.contractId ? "PASS" : "MISSING";
    const provenance = item.status.includes("PROVENANCE_STALE") ? "STALE" : "current";
    lines.push(
      `| ${item.componentId} | ${item.contractId ?? "missing"} | ${registryStatus} | ${artifactStatus} | ${provenance} | ${item.rpcRetrievalStatus ?? "—"} | ${latest?.confidence ?? "NOT_OBSERVED"} | ${successful?.artifactHash ?? "none"} | ${latest?.source ?? "none"} | ${latest?.errorCategory ?? "none"} | ${item.sourceArtifact.sha256 ?? "missing"} | ${item.prebuiltArtifact.sha256 ?? "missing"} | ${item.deployedArtifact.sha256 ?? "unavailable"} | ${behavior?.verification ?? "notQueryable"} | ${probe} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}
