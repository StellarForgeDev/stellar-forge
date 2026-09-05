import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stellarComponents } from "../src/data/components.ts";
import { DEPLOYMENTS } from "../src/lib/transactions/deployments.ts";
import { networkConfig } from "../src/lib/transactions/networks.ts";
import {
  reconcileArtifacts,
  sha256File,
  validateVerificationRegistry,
} from "../src/lib/verification/artifact-verification.ts";
import type { DeploymentEvidence } from "../src/lib/verification/deployment-evidence.ts";
import { attachRetrievalObservation, createRpcArtifactRetrieval, makeRetrievalFailure, retrieveArtifactWithRetry } from "../src/lib/verification/artifact-retrieval.ts";
import type { RetrievalFailureCategory } from "../src/lib/verification/artifact-status.ts";
import { diagnoseWithBoundedRetries } from "../src/lib/verification/testnet-connectivity.ts";
import { appendConnectivityHistory } from "../src/lib/verification/connectivity-history.ts";

const root = process.cwd();
const prebuiltDir = path.join(root, "contracts", "prebuilt");
const sourceDir = path.join(root, "contracts", "target", "wasm32v1-none", "release");
const outputPath = path.join(root, "contracts", "testnet-evidence.json");
const reportPath = path.join(root, "contracts", "testnet-evidence.md");
const metadataPath = path.join(prebuiltDir, "metadata.json");
const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
  gitCommit?: string;
  contracts?: Record<string, { file?: string }>;
};
const network = networkConfig("testnet");
const now = new Date().toISOString();
const currentCommit = gitCommit();
const rpcUrl = network.rpcUrl;

async function main(): Promise<void> {
  const prebuiltFiles = new Set(
    Object.values(metadata.contracts ?? {}).flatMap((entry) => entry.file ? [entry.file] : []),
  );
  const registry = validateVerificationRegistry(stellarComponents, DEPLOYMENTS, prebuiltFiles);
  const { final: connectivity, attemptCount, attempts } = await diagnoseWithBoundedRetries({ endpoint: rpcUrl, expectedPassphrase: network.passphrase }, { maxAttempts: 3, backoffMs: 150 });
  await appendConnectivityHistory(connectivity);
  console.log(`Connectivity: ${connectivity.status} (${connectivity.failureCategory ?? "none"}) attempts=${attemptCount} latency=${connectivity.latencyMs}ms`);
  if (attempts.length > 1) console.log(`  Attempts: ${attempts.map((a) => a.status).join(" → ")}`);
  let previousEvidence: DeploymentEvidence[] = [];
  try { previousEvidence = (JSON.parse(readFileSync(outputPath, "utf8")) as { evidence?: DeploymentEvidence[] }).evidence ?? []; } catch { /* first run */ }
  const evidence: DeploymentEvidence[] = [];

  for (const component of stellarComponents.filter((item) => item.capabilities.testnet)) {
    const packageName = component.implementation?.package ?? component.slug;
    const sourcePath = path.join(sourceDir, `${packageName.replaceAll("-", "_")}.wasm`);
    const prebuiltFile = metadata.contracts?.[component.slug]?.file ?? `${component.slug}.wasm`;
    const prebuiltPath = path.join(prebuiltDir, prebuiltFile);
    const deployment = DEPLOYMENTS.find(
      (item) => item.network === "testnet" && item.componentSlug === component.slug,
    );
    let deployedSha256: string | null = null;
    let observation;
    if (deployment) {
      const strategy = createRpcArtifactRetrieval(rpcUrl);
      const isHealthy = connectivity.status === "HEALTHY" || connectivity.status === "NETWORK_OK";
      const retrieval = isHealthy
        ? await retrieveArtifactWithRetry(strategy, deployment.address, { attempts: 3, backoffMs: 150 })
        : makeRetrievalFailure(strategy, connectivityToRetrievalCategory(connectivity.failureCategory), connectivity.error ?? "Testnet RPC health check failed.", now);
      observation = retrieval.observation;
      deployedSha256 = retrieval.observation.artifactHash;
      if (!retrieval.observation.success) console.warn(`${component.slug}: ${retrieval.observation.errorCategory} (${retrieval.observation.errorMessage})`);
    }
    const current = reconcileArtifacts({
      component,
      network: "testnet",
      contractId: deployment?.address ?? null,
      sourceArtifact: { path: relative(sourcePath), sha256: sha256File(sourcePath) },
      prebuiltArtifact: { path: relative(prebuiltPath), sha256: sha256File(prebuiltPath) },
      deployedArtifact: { sha256: deployedSha256 },
      metadataCommit: metadata.gitCommit ?? null,
      currentRepositoryCommit: currentCommit,
      verifiedAt: observation?.success ? now : null,
      verificationMethod: observation?.success ? "stellar-sdk-rpc-getContractWasmByContractId" : "not-available",
    });
    const previous = previousEvidence.find((item) => item.componentId === component.slug);
    const preserved = previous?.deployedArtifact.sha256 && !observation?.success ? previous : current;
    evidence.push(observation ? attachRetrievalObservation(preserved, observation) : preserved);
  }

  const output = {
    schemaVersion: "1.0.0",
    generatedAt: now,
    network: "testnet",
    rpcUrl,
    readOnly: true,
    connectivity,
    registry,
    evidence,
    deploymentState: evidence.map((item) => ({
      componentId: item.componentId,
      network: item.network,
      contractId: item.contractId,
      verification: "notQueryable",
      constructorVerified: false,
      observations: [],
    })),
  };
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  writeFileSync(reportPath, renderReport(evidence, registry), "utf8");
  console.log(`Wrote ${relative(outputPath)}`);
  console.log(`Wrote ${relative(reportPath)}`);
  console.log(`${registry.expectedCount} components checked; ${registry.accountedCount} explicitly accounted for`);
}

function gitCommit(): string | null {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return null; }
}

function relative(filePath: string): string { return path.relative(root, filePath).replaceAll(path.sep, "/"); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function connectivityToRetrievalCategory(category: string | undefined): RetrievalFailureCategory {
  if (category === "TLS_FAILURE") return "TLS_ERROR";
  if (category === "RPC_TIMEOUT" || category === "HTTP_TIMEOUT") return "TIMEOUT";
  if (category === "RPC_METHOD_UNAVAILABLE") return "RPC_METHOD_UNSUPPORTED";
  if (category === "RPC_ENDPOINT_UNAVAILABLE" || category === "RPC_MALFORMED_RESPONSE") return "RPC_UNAVAILABLE";
  if (category === "DNS_FAILURE" || category === "HTTP_FAILURE") return "NETWORK_UNAVAILABLE";
  if (category === "PASSPHRASE_MISMATCH") return "RPC_UNAVAILABLE";
  return "NETWORK_UNAVAILABLE";
}

function renderReport(evidence: DeploymentEvidence[], registry: { expectedCount: number; accountedCount: number; errors: string[] }): string {
  const count = (status: string) => evidence.filter((item) => item.status.includes(status as never)).length;
  const lines = ["# Testnet Artifact Reconciliation", "", "Read-only verification report. Artifact parity does not by itself verify constructor state or workflow behavior.", "", `- Total components: ${evidence.length}`, `- Artifact verified matches: ${count("VERIFIED_MATCH")}`, `- Deployment mismatches: ${count("DEPLOYMENT_MISMATCH")}`, `- Local artifact mismatches: ${count("LOCAL_ARTIFACT_MISMATCH")}`, `- Stale provenance: ${count("PROVENANCE_STALE")}`, `- Unavailable deployments: ${count("DEPLOYMENT_UNAVAILABLE")}`, `- Unknown: ${count("UNKNOWN")}`, "", `Registry: ${registry.expectedCount} components checked; ${registry.accountedCount} explicitly accounted for.`];
  if (registry.errors.length) lines.push("", "Registry errors:", ...registry.errors.map((error) => `- ${error}`));
  lines.push("", "| Component | Contract ID | Latest observation | Latest successful | Effective status | Source | Failure | Local | Prebuilt | Deployed |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of evidence) {
    const latest = item.latestObservation;
    const successful = item.latestSuccessfulObservation;
    lines.push(`| ${item.componentId} | ${item.contractId ?? "missing"} | ${latest?.confidence ?? "NOT_OBSERVED"} | ${successful?.artifactHash ?? "none"} | ${item.effectiveStatus ?? item.status.join(", ")} | ${latest?.source ?? "none"} | ${latest?.errorCategory ?? "none"} | ${item.sourceArtifact.sha256 ?? "missing"} | ${item.prebuiltArtifact.sha256 ?? "missing"} | ${item.deployedArtifact.sha256 ?? "unavailable"} |`);
  }
  return `${lines.join("\n")}\n`;
}

main().catch((error) => { console.error(errorMessage(error)); process.exitCode = 1; });
