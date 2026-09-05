import { StrKey } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { canonicalTestnetServer } from "@/lib/transactions/deployment";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const contractId = body && typeof body === "object" && typeof (body as Record<string, unknown>).contractId === "string" ? (body as Record<string, string>).contractId : "";
  if (!StrKey.isValidContract(contractId)) return Response.json({ error: "A valid contract ID is required." }, { status: 400 });
  try {
    const wasm = await canonicalTestnetServer().getContractWasmByContractId(contractId);
    if (!wasm) return Response.json({ error: "The deployed contract WASM was unavailable." }, { status: 404 });
    const deployedHash = createHash("sha256").update(wasm).digest("hex");
    const evidence = JSON.parse(await readFile(path.join(process.cwd(), "contracts", "testnet-evidence.json"), "utf8")) as { evidence?: Array<{ componentId?: string; status?: string[]; sourceArtifact?: { sha256?: string | null } }> };
    const artifact = evidence.evidence?.find((item) => item.componentId === "access-control");
    const artifactHash = artifact?.sourceArtifact?.sha256 ?? null;
    const verified = Boolean(artifact?.status?.includes("VERIFIED_MATCH") && artifactHash && deployedHash === artifactHash);
    return Response.json({ contractId, deployedHash, artifactHash, verified, verificationMethod: "stellar-sdk-rpc-getContractWasmByContractId", verifiedAt: new Date().toISOString() }, { status: verified ? 200 : 409 });
  } catch { return Response.json({ error: "The deployed contract could not be independently verified." }, { status: 502 }); }
}
