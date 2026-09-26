import { StrKey } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stellarComponents } from "@/data/components";
import { buildInvocationArgs } from "@/lib/transactions/args";
import { canonicalTestnetServer, confirmedTransactionExists, prepareDeploymentStage } from "@/lib/transactions/deployment";
import { ACCESS_CONTROL_WORKFLOW } from "@/lib/verification/network-workflow";
import { evidencePersistenceMode } from "@/lib/verification/evidence-persistence";
import { verifyCandidateArtifact } from "@/lib/verification/artifact-provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registryPath = path.join(process.cwd(), "contracts", "testnet-verification-deployments.json");

async function handlePrepare(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ status: "FAILED", error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ status: "FAILED", error: "A deployment request is required." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (input.network !== "testnet" || input.component !== ACCESS_CONTROL_WORKFLOW.componentId || typeof input.sourceAccount !== "string" || (input.stage !== "upload" && input.stage !== "create")) return Response.json({ status: "FAILED", error: "Only the explicit Access Control Testnet pilot is supported." }, { status: 400 });
  const isValidPublicKey = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("S")) return false;
    const lower = trimmed.toLowerCase();
    if (lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private")) return false;
    if (/[\s\n\r\t]/.test(trimmed)) return false;
    if (trimmed.length !== 56) return false;
    return StrKey.isValidEd25519PublicKey(trimmed);
  };
  if (!isValidPublicKey(input.sourceAccount)) return Response.json({ status: "FAILED", error: "Deployment source must be a valid public G... account address (StrKey)." }, { status: 400 });
  const rawAdmin = typeof (input.constructorArgs as Record<string, unknown> | null)?.admin === "string" ? String((input.constructorArgs as Record<string, unknown>).admin) : "";
  if (rawAdmin && !isValidPublicKey(rawAdmin)) return Response.json({ status: "FAILED", error: "Constructor admin must be a valid public G... address (StrKey)." }, { status: 400 });
  const component = stellarComponents.find((candidate) => candidate.slug === input.component);
  const constructor = component?.interface?.find((method) => method.name === "__constructor");
  if (!component || !constructor) return Response.json({ status: "FAILED", error: "Constructor metadata is unavailable." }, { status: 400 });

  const verification = await verifyCandidateArtifact(component.slug);
  if (verification.status !== "CANDIDATE_VERIFIED") {
    const error = "error" in verification ? verification.error : "The canonical artifact does not match the authorized deployment candidate.";
    return Response.json({ status: "FAILED", error, candidateStatus: verification.status }, { status: 409 });
  }

  const wasm = verification.verifiedArtifactBytes;
  const wasmHash = verification.actualHash;

  const rawValues = typeof input.constructorArgs === "object" && input.constructorArgs !== null ? input.constructorArgs as Record<string, unknown> : {};
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawValues)) {
    values[k] = typeof v === "string" ? v.trim() : String(v);
  }
  const args = buildInvocationArgs(constructor.params, values);
  if (!args.ok) return Response.json({ status: "FAILED", error: args.error.message }, { status: 400 });
  if (input.stage === "create") {
    if (typeof input.uploadTransactionHash !== "string") return Response.json({ status: "FAILED", error: "A confirmed upload transaction hash is required before contract creation." }, { status: 400 });
    if (!(await confirmedTransactionExists(canonicalTestnetServer(), input.uploadTransactionHash))) return Response.json({ status: "FAILED", error: "The WASM upload is not confirmed on Testnet." }, { status: 409 });
  }
  const trimmedSource = (input.sourceAccount as string).trim();
  const result = await prepareDeploymentStage({ stage: input.stage as "upload" | "create", network: "testnet", sourceAccount: trimmedSource, wasm, wasmHash, constructorArgs: args.scVals });
  if (!("stage" in result)) {
    return Response.json({ ...result, component: component.name, artifact: { path: `contracts/prebuilt/${component.slug}.wasm`, sha256: wasmHash }, constructorArgs: values }, { status: 409 });
  }
  return Response.json({ ...result, component: component.name, artifact: { path: `contracts/prebuilt/${component.slug}.wasm`, sha256: wasmHash }, constructorArgs: values });
}

async function handleVerify(request: Request): Promise<Response> {
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const contractId = body && typeof body === "object" && typeof (body as Record<string, unknown>).contractId === "string" ? (body as Record<string, string>).contractId : "";
  if (!StrKey.isValidContract(contractId)) return Response.json({ error: "A valid contract ID is required." }, { status: 400 });
  try {
    const candidate = await verifyCandidateArtifact("access-control");
    if (candidate.status !== "CANDIDATE_VERIFIED") {
      return Response.json({ error: "The authorized deployment candidate is unavailable or does not match the canonical artifact.", candidateStatus: candidate.status }, { status: 409 });
    }
    const wasm = await canonicalTestnetServer().getContractWasmByContractId(contractId);
    if (!wasm) return Response.json({ error: "The deployed contract WASM was unavailable." }, { status: 404 });
    const deployedHash = createHash("sha256").update(wasm).digest("hex");
    const candidateHash = candidate.candidateHash;
    const verified = deployedHash === candidateHash;
    return Response.json({ contractId, deployedHash, candidateHash, verified, verificationAuthority: "CANDIDATE", verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId", verifiedAt: new Date().toISOString() }, { status: verified ? 200 : 409 });
  } catch { return Response.json({ error: "The deployed contract could not be independently verified." }, { status: 502 }); }
}

async function handleRecord(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Evidence is required." }, { status: 400 });
  const value = body as Record<string, unknown>;
  const contractId = typeof value.contractId === "string" ? value.contractId : "";
  const uploadHash = typeof value.uploadTransactionHash === "string" ? value.uploadTransactionHash : "";
  const deploymentHash = typeof value.deploymentTransactionHash === "string" ? value.deploymentTransactionHash : "";
  const deployer = typeof value.deployer === "string" ? value.deployer : "";
  const constructorArguments = value.constructorArguments && typeof value.constructorArguments === "object" ? value.constructorArguments as Record<string, unknown> : {};
  const admin = typeof constructorArguments.admin === "string" ? constructorArguments.admin : "";
  if (value.network !== "testnet" || value.componentId !== ACCESS_CONTROL_WORKFLOW.componentId || !StrKey.isValidContract(contractId) || !uploadHash || !deploymentHash || !StrKey.isValidEd25519PublicKey(deployer) || !StrKey.isValidEd25519PublicKey(admin)) return Response.json({ error: "Only confirmed Access Control Testnet deployments with public account metadata can be recorded." }, { status: 400 });
  const server = canonicalTestnetServer();
  if (!(await confirmedTransactionExists(server, uploadHash)) || !(await confirmedTransactionExists(server, deploymentHash))) return Response.json({ error: "Both deployment stages must be RPC-confirmed before evidence recording." }, { status: 409 });
  try {
    const candidate = await verifyCandidateArtifact(ACCESS_CONTROL_WORKFLOW.componentId);
    if (candidate.status !== "CANDIDATE_VERIFIED") return Response.json({ error: "The authorized deployment candidate is unavailable or does not match the canonical artifact.", candidateStatus: candidate.status }, { status: 409 });
    const localWasm = await readFile(path.join(process.cwd(), "contracts", "prebuilt", `${ACCESS_CONTROL_WORKFLOW.componentId}.wasm`));
    const deployedWasm = await server.getContractWasmByContractId(contractId);
    const localArtifactHash = createHash("sha256").update(localWasm).digest("hex");
    const deployedArtifactHash = createHash("sha256").update(deployedWasm).digest("hex");
    if (localArtifactHash !== candidate.candidateHash || deployedArtifactHash !== candidate.candidateHash) return Response.json({ error: "Independent deployed artifact verification failed.", candidateHash: candidate.candidateHash, localArtifactHash, deployedArtifactHash }, { status: 409 });
    const persistence = evidencePersistenceMode();
    if (persistence === "runtime-non-durable") {
      return Response.json({
        status: "VERIFIED_REPOSITORY_RECORDING_REQUIRED",
        verified: true,
        persistence: "repository-maintainer-commit-required",
        message: "Deployment verification succeeded. Evidence must be recorded in the repository by a maintainer; runtime filesystem writes are not durable.",
        evidence: { contractId, localArtifactHash, deployedArtifactHash, uploadTransactionHash: uploadHash, deploymentTransactionHash: deploymentHash, deployer, constructorAdmin: admin },
      });
    }
    const existing = JSON.parse(await readFile(registryPath, "utf8")) as unknown;
    if (!Array.isArray(existing)) return Response.json({ error: "Evidence registry is invalid." }, { status: 500 });
    if (existing.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).contractId === contractId)) return Response.json({ error: "This contract evidence is already recorded." }, { status: 409 });
    const evidence = { componentId: ACCESS_CONTROL_WORKFLOW.componentId, network: "testnet", contractId, localArtifactHash, deployedArtifactHash, artifactVerified: true, uploadTransactionHash: uploadHash, deploymentTransactionHash: deploymentHash, deployer, constructorArguments: { admin }, confirmationTimestamp: new Date().toISOString(), verificationTimestamp: new Date().toISOString(), constructorVerification: "NOT_QUERYABLE", status: "RECORDED", verificationPurpose: "controlled-testnet-workflow" };
    try {
      await writeFile(registryPath, `${JSON.stringify([...existing, evidence], null, 2)}\\n`, "utf8");
    } catch {
      return Response.json({ error: "Verification succeeded, but the local repository evidence file could not be written. No durable evidence was recorded." }, { status: 503 });
    }
    return Response.json({ status: "REPOSITORY_RECORD_WRITTEN", persistence: "local-repository-write; maintainer-commit-required", evidence });
  } catch { return Response.json({ error: "Independent deployment verification failed." }, { status: 502 }); }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
): Promise<Response> {
  const { action } = await params;

  if (action === "prepare") return handlePrepare(request);
  if (action === "verify") return handleVerify(request);
  if (action === "record") return handleRecord(request);

  return Response.json({ error: "Unsupported action." }, { status: 404 });
}
