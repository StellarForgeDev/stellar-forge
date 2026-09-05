import { inspectTransaction } from "@/lib/verification/transaction-inspection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const hash = url.searchParams.get("hash") ?? url.searchParams.get("transactionHash");
  const network = url.searchParams.get("network") ?? "testnet";
  const endpoint = url.searchParams.get("endpoint") ?? "https://soroban-testnet.stellar.org";

  const result = await inspectTransaction({ transactionHash: hash, network, endpoint });
  return Response.json({ readOnly: true, ...result }, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const hash = body && typeof body === "object" && typeof (body as Record<string, unknown>).transactionHash === "string" ? (body as Record<string, string>).transactionHash : body && typeof body === "object" && typeof (body as Record<string, unknown>).hash === "string" ? (body as Record<string, string>).hash : null;
  const network = body && typeof body === "object" && typeof (body as Record<string, unknown>).network === "string" ? (body as Record<string, string>).network : "testnet";
  const endpoint = body && typeof body === "object" && typeof (body as Record<string, unknown>).endpoint === "string" ? (body as Record<string, string>).endpoint : "https://soroban-testnet.stellar.org";

  const result = await inspectTransaction({ transactionHash: hash, network, endpoint });
  return Response.json({ readOnly: true, ...result }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
