import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { StrKey } from "@stellar/stellar-sdk";
import { canonicalTestnetServer, confirmedTransactionExists } from "@/lib/transactions/deployment";
import { ACCESS_CONTROL_WORKFLOW } from "@/lib/verification/network-workflow";

export const runtime = "nodejs";
const registryPath = path.join(process.cwd(), "contracts", "testnet-verification-deployments.json");

export async function POST(request: Request): Promise<Response> {
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
    const localWasm = await readFile(path.join(process.cwd(), "contracts", "prebuilt", `${ACCESS_CONTROL_WORKFLOW.componentId}.wasm`));
    const deployedWasm = await server.getContractWasmByContractId(contractId);
    const localArtifactHash = createHash("sha256").update(localWasm).digest("hex");
    const deployedArtifactHash = createHash("sha256").update(deployedWasm).digest("hex");
    if (localArtifactHash !== deployedArtifactHash) return Response.json({ error: "Independent deployed artifact verification failed." }, { status: 409 });
    const existing = JSON.parse(await readFile(registryPath, "utf8")) as unknown;
    if (!Array.isArray(existing)) return Response.json({ error: "Evidence registry is invalid." }, { status: 500 });
    if (existing.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).contractId === contractId)) return Response.json({ error: "This contract evidence is already recorded." }, { status: 409 });
    const evidence = { componentId: ACCESS_CONTROL_WORKFLOW.componentId, network: "testnet", contractId, localArtifactHash, deployedArtifactHash, artifactVerified: true, uploadTransactionHash: uploadHash, deploymentTransactionHash: deploymentHash, deployer, constructorArguments: { admin }, confirmationTimestamp: new Date().toISOString(), verificationTimestamp: new Date().toISOString(), constructorVerification: "NOT_QUERYABLE", status: "RECORDED", verificationPurpose: "controlled-testnet-workflow" };
    await writeFile(registryPath, `${JSON.stringify([...existing, evidence], null, 2)}\n`, "utf8");
    return Response.json({ status: "RECORDED", evidence });
  } catch { return Response.json({ error: "Independent deployment verification failed." }, { status: 502 }); }
}
