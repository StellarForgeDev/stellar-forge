import { diagnoseIndependentTransport, diagnoseWithBoundedRetries } from "@/lib/verification/testnet-connectivity";
import { networkConfig } from "@/lib/transactions/networks";
import { appendConnectivityHistory, summarizeHistory } from "@/lib/verification/connectivity-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const endpoint = networkConfig("testnet").rpcUrl;
  const expectedPassphrase = networkConfig("testnet").passphrase;
  try {
    // Bounded read-only retry, each attempt observable, no infinite, no background polling
    const { final: diagnostic, attempts, attemptCount } = await diagnoseWithBoundedRetries({ endpoint, expectedPassphrase }, { maxAttempts: 3, backoffMs: 150 });
    const history = await appendConnectivityHistory(diagnostic);
    const summary = summarizeHistory(history);
    // Independent transport diagnostic — environmental only, never used for deployment/artifact
    const transport = await diagnoseIndependentTransport("soroban-testnet.stellar.org");
    return Response.json(
      {
        network: "testnet",
        endpoint,
        diagnostic,
        attempts,
        attemptCount,
        history: summary,
        transport,
        latestObservation: summary.latest,
        latestSuccessfulObservation: summary.latestSuccessful,
        readOnly: true,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message, network: "testnet", endpoint, readOnly: true }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(): Promise<Response> {
  return GET();
}
