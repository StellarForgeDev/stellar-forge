import { inspectPublicAccount, createTestnetAccountReader } from "@/lib/verification/account-inspection";
import { networkConfig } from "@/lib/transactions/networks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const address = body && typeof body === "object" && typeof (body as Record<string, unknown>).address === "string" ? ((body as Record<string, string>).address.trim()) : "";
  const minimumNativeBalance = body && typeof body === "object" && typeof (body as Record<string, unknown>).minimumNativeBalance === "string" ? ((body as Record<string, string>).minimumNativeBalance) : undefined;
  // Never accept secret keys: reject S..., secret, seed, mnemonic, private, private_key, secret_key
  const lower = address.toLowerCase();
  if (address.startsWith("S") || lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private") || lower.includes("private_key") || lower.includes("secret_key")) {
    return Response.json({ error: "Secret keys are never accepted. Provide only a public Stellar address (G...)." }, { status: 400 });
  }
  const reader = createTestnetAccountReader(networkConfig("testnet").rpcUrl);
  const result = await inspectPublicAccount({ address: address || null, reader, minimumNativeBalance, network: "testnet" });
  return Response.json({ readOnly: true, network: "testnet", result }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
