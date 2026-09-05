import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { stellarComponents } from "@/data/components";
import { buildInvocationArgs } from "@/lib/transactions/args";
import { canonicalTestnetServer, confirmedTransactionExists, prepareDeploymentStage } from "@/lib/transactions/deployment";
import { ACCESS_CONTROL_WORKFLOW } from "@/lib/verification/network-workflow";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
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
  const wasmPath = path.join(process.cwd(), "contracts", "prebuilt", `${component.slug}.wasm`);
  const wasm = await readFile(wasmPath);
  const wasmHash = createHash("sha256").update(wasm).digest("hex");
  try {
    const evidence = JSON.parse(await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8")) as { evidence?: Array<{ componentId?: string; status?: string[]; sourceArtifact?: { sha256?: string | null } }> };
    const accessEvidence = evidence.evidence?.find((item) => item.componentId === ACCESS_CONTROL_WORKFLOW.componentId);
    if (!accessEvidence?.status?.includes("VERIFIED_MATCH") || accessEvidence.sourceArtifact?.sha256 !== wasmHash) return Response.json({ status: "FAILED", error: "Access Control artifact evidence is not VERIFIED_MATCH for the canonical local artifact." }, { status: 409 });
  } catch { return Response.json({ status: "FAILED", error: "Authoritative Access Control artifact evidence is unavailable." }, { status: 409 }); }
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
