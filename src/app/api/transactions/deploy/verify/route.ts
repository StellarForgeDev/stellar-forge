import { StrKey } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { canonicalTestnetServer } from "@/lib/transactions/deployment";
import { verifyCandidateArtifact } from "@/lib/verification/artifact-provenance";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
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
