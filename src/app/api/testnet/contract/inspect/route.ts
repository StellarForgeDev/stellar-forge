import { inspectContract } from "@/lib/verification/contract-inspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contractId") ?? url.searchParams.get("id");
  const network = url.searchParams.get("network") ?? "testnet";
  const endpoint = url.searchParams.get("endpoint") ?? "https://soroban-testnet.stellar.org";

  const result = await inspectContract({ contractId, network, endpoint });
  // CONTRACT_FOUND ≠ artifact verified ≠ evidence recorded
  return Response.json({ readOnly: true, ...result, note: "CONTRACT_FOUND ≠ artifact verified ≠ deployment evidence recorded" }, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const contractId = body && typeof body === "object" && typeof (body as Record<string, unknown>).contractId === "string" ? (body as Record<string, string>).contractId : body && typeof body === "object" && typeof (body as Record<string, unknown>).id === "string" ? (body as Record<string, string>).id : null;
  const network = body && typeof body === "object" && typeof (body as Record<string, unknown>).network === "string" ? (body as Record<string, string>).network : "testnet";
  const endpoint = body && typeof body === "object" && typeof (body as Record<string, unknown>).endpoint === "string" ? (body as Record<string, string>).endpoint : "https://soroban-testnet.stellar.org";

  const result = await inspectContract({ contractId, network, endpoint });
  return Response.json({ readOnly: true, ...result, note: "CONTRACT_FOUND ≠ artifact verified ≠ deployment evidence recorded" }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
