import { Server } from "@stellar/stellar-sdk/rpc";
import { networkConfig } from "../transactions/networks.ts";

export type ConnectivityFailureCategory =
  | "DNS_FAILURE"
  | "TLS_FAILURE"
  | "HTTP_FAILURE"
  | "RPC_ENDPOINT_UNAVAILABLE"
  | "RPC_TIMEOUT"
  | "RPC_MALFORMED_RESPONSE"
  | "RPC_METHOD_UNAVAILABLE"
  | "PASSPHRASE_MISMATCH"
  | "NETWORK_OK"
  // Legacy aliases retained for backward compatibility
  | "TCP_HTTP_FAILURE"
  | "RPC_ENDPOINT_INVALID"
  | "SOROBAN_RPC_UNAVAILABLE"
  | "HTTP_TIMEOUT"
  | "MALFORMED_RPC_RESPONSE"
  | "NETWORK_PASSPHRASE_MISMATCH"
  | "UNKNOWN_NETWORK_FAILURE";
export type ConnectivityStatus = "HEALTHY" | "NETWORK_OK" | "BLOCKED" | "UNKNOWN" | "NETWORK_OK_WITH_TRANSIENT_FAILURES";
export type LayerState = "PASS" | "FAIL" | "UNKNOWN" | "NOT_RUN";
export interface TestnetConnectivityDiagnostic {
  network: "testnet";
  endpoint: string;
  dns: LayerState;
  tls: LayerState;
  https: LayerState;
  http: LayerState;
  httpResponse: LayerState;
  rpc: LayerState;
  rpcTransport: LayerState;
  sorobanRpc: LayerState;
  networkMetadata: LayerState;
  networkPassphrase: LayerState;
  status: ConnectivityStatus;
  failureCategory?: ConnectivityFailureCategory;
  error?: string;
  errorName?: string;
  errorCode?: string;
  errorMessage?: string;
  causeName?: string;
  causeCode?: string;
  causeMessage?: string;
  httpStatus?: number;
  rpcMethod?: string;
  timeoutMs?: number;
  latencyMs?: number;
  observedAt: string;
  healthMethod: "getHealth";
  networkMethod: "getNetwork";
  runtime?: string;
  attemptCount?: number;
}
export interface ReadOnlyRpcClient { getHealth(): Promise<unknown>; getNetwork(): Promise<unknown>; }

export function createTestnetRpcClient(endpoint = networkConfig("testnet").rpcUrl): ReadOnlyRpcClient { const server = new Server(endpoint, { timeout: 10_000 }); return { getHealth: () => server.getHealth(), getNetwork: () => server.getNetwork() }; }

export async function diagnoseTestnetConnectivity(input: { endpoint?: string; expectedPassphrase?: string; client?: ReadOnlyRpcClient; observedAt?: string }): Promise<TestnetConnectivityDiagnostic> {
  const endpoint = input.endpoint ?? networkConfig("testnet").rpcUrl; const observedAt = input.observedAt ?? new Date().toISOString(); const started = Date.now();
  const result: TestnetConnectivityDiagnostic = {
    network: "testnet",
    endpoint,
    dns: "UNKNOWN",
    tls: "UNKNOWN",
    https: "UNKNOWN",
    http: "UNKNOWN",
    httpResponse: "UNKNOWN",
    rpc: "UNKNOWN",
    rpcTransport: "UNKNOWN",
    sorobanRpc: "UNKNOWN",
    networkMetadata: "UNKNOWN",
    networkPassphrase: "UNKNOWN",
    status: "UNKNOWN",
    observedAt,
    healthMethod: "getHealth",
    networkMethod: "getNetwork",
    runtime: `node-${process.version}`,
    attemptCount: 1,
  };
  // Step 1: Enforce Testnet-only endpoint and TLS — no Mainnet, no HTTP fallback, no TLS bypass
  const requiredEndpoint = networkConfig("testnet").rpcUrl; // https://soroban-testnet.stellar.org
  const requiredPassphrase = "Test SDF Network ; September 2015";
  if (endpoint !== requiredEndpoint) {
    if (endpoint === networkConfig("mainnet").rpcUrl) return failure(result, "PASSPHRASE_MISMATCH", "Mainnet endpoint rejected for Testnet diagnostics.", started, { dns: "UNKNOWN", tls: "UNKNOWN", http: "UNKNOWN", https: "UNKNOWN", httpResponse: "UNKNOWN", rpcTransport: "UNKNOWN" });
    if (!endpoint.startsWith("https://")) return failure(result, "HTTP_FAILURE", "Testnet endpoint must use TLS (https).", started, { dns: "UNKNOWN", tls: "FAIL", https: "FAIL", http: "FAIL", httpResponse: "FAIL" });
    if (endpoint.startsWith("http://")) return failure(result, "HTTP_FAILURE", "HTTP fallback is prohibited.", started, { dns: "UNKNOWN", tls: "FAIL", https: "FAIL", http: "FAIL", httpResponse: "FAIL" });
  }
  if (!endpoint.startsWith("https://")) return failure(result, "HTTP_FAILURE", "Testnet endpoint must use TLS (https).", started, { dns: "UNKNOWN", tls: "FAIL", https: "FAIL", http: "FAIL", httpResponse: "FAIL" });
  if (endpoint !== requiredEndpoint) return failure(result, "HTTP_FAILURE", `Endpoint must be ${requiredEndpoint}.`, started, { dns: "UNKNOWN", tls: "UNKNOWN", https: "UNKNOWN", http: "FAIL", httpResponse: "FAIL" });
  if (result.network !== "testnet") return failure(result, "PASSPHRASE_MISMATCH", "Network must be testnet.", started, { dns: "UNKNOWN", tls: "UNKNOWN", http: "UNKNOWN", https: "UNKNOWN" });
  const client = input.client ?? createTestnetRpcClient(endpoint);
  let health: unknown;
  try {
    health = await client.getHealth();
  } catch (error) {
    const classified = classifyConnectivityError(error);
    return failure(result, classified.category, classified.message, started, { ...classified, https: classified.tls === "PASS" ? "PASS" as const : classified.https ?? "UNKNOWN" }, error);
  }
  if (!health || typeof health !== "object" || (health as { status?: unknown }).status !== "healthy") {
    return failure(result, "RPC_MALFORMED_RESPONSE", "getHealth returned an invalid response.", started, { dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "FAIL", rpcTransport: "FAIL", sorobanRpc: "FAIL", networkMetadata: "NOT_RUN" });
  }
  result.dns = "PASS"; result.tls = "PASS"; result.https = "PASS"; result.http = "PASS"; result.httpResponse = "PASS"; result.rpc = "PASS"; result.rpcTransport = "PASS"; result.sorobanRpc = "PASS"; result.networkMetadata = "UNKNOWN";
  let network: unknown;
  try {
    network = await client.getNetwork();
  } catch (error) {
    const classified = classifyConnectivityError(error);
    const isMethodUnavailable = classified.category === "RPC_METHOD_UNAVAILABLE";
    return failure(
      { ...result, dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "PASS", rpcTransport: "PASS" },
      classified.category,
      `getNetwork failed after getHealth succeeded: ${classified.message}`,
      started,
      { dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: isMethodUnavailable ? "PASS" : "FAIL", rpcTransport: isMethodUnavailable ? "PASS" : "FAIL", sorobanRpc: "FAIL", networkMetadata: "FAIL" },
      error,
    );
  }
  if (!network || typeof network !== "object" || typeof (network as { passphrase?: unknown }).passphrase !== "string") {
    return failure(result, "RPC_MALFORMED_RESPONSE", "getNetwork returned an invalid response.", started, { dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "PASS", rpcTransport: "PASS", sorobanRpc: "FAIL", networkMetadata: "FAIL" });
  }
  const expected = input.expectedPassphrase ?? networkConfig("testnet").passphrase ?? requiredPassphrase;
  if (expected !== requiredPassphrase) {
    return failure(result, "PASSPHRASE_MISMATCH", "Expected passphrase must be Test SDF Network ; September 2015.", started, { dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "PASS", rpcTransport: "PASS", sorobanRpc: "PASS", networkMetadata: "PASS" });
  }
  result.networkPassphrase = (network as { passphrase: string }).passphrase === expected ? "PASS" : "FAIL";
  result.networkMetadata = "PASS";
  if (result.networkPassphrase === "FAIL") return failure(result, "PASSPHRASE_MISMATCH", "RPC network passphrase does not match Stellar Testnet.", started, { dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "PASS", rpcTransport: "PASS", sorobanRpc: "PASS", networkMetadata: "PASS" });
  result.status = "NETWORK_OK"; result.latencyMs = Date.now() - started; return result;
}

function failure(
  result: TestnetConnectivityDiagnostic,
  category: ConnectivityFailureCategory,
  error: string,
  started: number,
  classified?: Partial<Record<keyof TestnetConnectivityDiagnostic, LayerState>>,
  originalError?: unknown,
): TestnetConnectivityDiagnostic {
  const meta = originalError ? extractSanitizedError(originalError) : { errorName: undefined, errorCode: undefined, errorMessage: error, causeName: undefined, causeCode: undefined, causeMessage: undefined, httpStatus: undefined };
  const rpc = (classified as unknown as { rpc?: LayerState })?.rpc ?? (category === "RPC_ENDPOINT_UNAVAILABLE" || category === "RPC_TIMEOUT" || category === "RPC_MALFORMED_RESPONSE" || category === "RPC_METHOD_UNAVAILABLE" ? "FAIL" : result.rpc);
  const rpcTransport = (classified as unknown as { rpcTransport?: LayerState })?.rpcTransport ?? rpc;
  const sorobanRpc = (classified as unknown as { sorobanRpc?: LayerState })?.sorobanRpc ?? (category === "RPC_METHOD_UNAVAILABLE" || category === "RPC_MALFORMED_RESPONSE" ? "FAIL" : result.sorobanRpc);
  const httpResponse = (classified as unknown as { httpResponse?: LayerState })?.httpResponse ?? result.httpResponse;
  const networkMetadata = (classified as unknown as { networkMetadata?: LayerState })?.networkMetadata ?? result.networkMetadata;
  // Dependency ordering: if DNS fails, later layers are NOT_RUN rather than FAIL
  const dnsVal = (classified?.dns as LayerState) ?? result.dns;
  const tlsVal = classified?.tls ?? (dnsVal === "FAIL" ? "NOT_RUN" : result.tls);
  const httpsVal = (classified as unknown as { https?: LayerState })?.https ?? (tlsVal === "FAIL" || dnsVal === "FAIL" ? "NOT_RUN" : result.https);
  const httpVal = classified?.http ?? (httpsVal === "FAIL" ? "NOT_RUN" : result.http);
  const httpRespVal = httpResponse === "UNKNOWN" && httpVal === "FAIL" ? "FAIL" : httpResponse;
  return {
    ...result,
    dns: dnsVal,
    tls: tlsVal,
    https: httpsVal,
    http: httpVal,
    httpResponse: httpRespVal,
    rpc,
    rpcTransport,
    sorobanRpc,
    networkMetadata,
    status: "BLOCKED",
    failureCategory: category,
    error,
    errorName: meta.errorName,
    errorCode: meta.errorCode,
    errorMessage: meta.errorMessage,
    causeName: meta.causeName,
    causeCode: meta.causeCode,
    causeMessage: meta.causeMessage,
    httpStatus: meta.httpStatus,
    rpcMethod: category === "RPC_METHOD_UNAVAILABLE" ? "getHealth" : undefined,
    timeoutMs: category === "RPC_TIMEOUT" ? 10000 : undefined,
    latencyMs: Date.now() - started,
  };
}

function sanitizeMessage(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private") || lower.includes("private_key") || lower.includes("secret_key") || lower.includes("authorization") || lower.includes("cookie")) return "[filtered]";
  // Limit length, remove stack-like content
  return value.slice(0, 500).replace(/\s+at\s+.*\(.*\)/g, "").slice(0, 500);
}

function extractSanitizedError(error: unknown): { errorName?: string; errorCode?: string; errorMessage?: string; causeName?: string; causeCode?: string; causeMessage?: string; httpStatus?: number } {
  if (!error || typeof error !== "object") return { errorMessage: sanitizeMessage(String(error)) };
  const err = error as Record<string, unknown>;
  const errorName = typeof err.name === "string" ? sanitizeMessage(err.name).slice(0, 100) : undefined;
  const errorCode = typeof err.code === "string" ? sanitizeMessage(err.code).slice(0, 100) : undefined;
  const rawMessage = typeof err.message === "string" ? err.message : String(error);
  const errorMessage = sanitizeMessage(rawMessage);
  let causeName: string | undefined;
  let causeCode: string | undefined;
  let causeMessage: string | undefined;
  let httpStatus: number | undefined;
  // Bounded recursion depth 3 for cause chain
  let current: unknown = err.cause;
  let depth = 0;
  const collected: string[] = [rawMessage];
  while (current && depth < 3) {
    if (typeof current === "object" && current !== null) {
      const c = current as Record<string, unknown>;
      if (typeof c.name === "string" && !causeName) causeName = sanitizeMessage(c.name).slice(0, 100);
      if (typeof c.code === "string" && !causeCode) causeCode = sanitizeMessage(c.code).slice(0, 100);
      if (typeof c.message === "string") {
        const m = sanitizeMessage(c.message);
        causeMessage = m.slice(0, 500);
        collected.push(m);
        // HTTP status extraction from cause message
        const statusMatch = m.match(/\b(502|503|504|404|401|403)\b/);
        if (statusMatch && !httpStatus) httpStatus = Number(statusMatch[1]);
      }
      current = c.cause;
    } else if (typeof current === "string") {
      causeMessage = sanitizeMessage(current).slice(0, 500);
      collected.push(current);
      break;
    } else break;
    depth += 1;
  }
  // Also check httpStatus from outer message
  if (!httpStatus) {
    const outerMatch = rawMessage.match(/\b(502|503|504|404|401|403)\b/);
    if (outerMatch) httpStatus = Number(outerMatch[1]);
  }
  return { errorName, errorCode, errorMessage, causeName, causeCode, causeMessage, httpStatus };
}

function collectErrorTexts(error: unknown): string[] {
  const texts: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 4) {
    if (current instanceof Error) {
      texts.push(current.message.toLowerCase());
      if (typeof (current as unknown as Record<string, unknown>).code === "string") texts.push(String((current as unknown as Record<string, unknown>).code).toLowerCase());
      current = (current as unknown as Record<string, unknown>).cause;
    } else if (typeof current === "object" && current !== null && "message" in current) {
      texts.push(String((current as Record<string, unknown>).message).toLowerCase());
      if (typeof (current as Record<string, unknown>).code === "string") texts.push(String((current as Record<string, unknown>).code).toLowerCase());
      current = (current as Record<string, unknown>).cause;
    } else {
      texts.push(String(current).toLowerCase());
      break;
    }
    depth += 1;
  }
  return texts;
}

export function classifyConnectivityError(error: unknown): { category: ConnectivityFailureCategory; message: string; dns: LayerState; tls: LayerState; https: LayerState; http: LayerState; httpResponse: LayerState; rpc: LayerState; rpcTransport: LayerState; sorobanRpc: LayerState; networkMetadata: LayerState } {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = sanitizeMessage(rawMessage);
  const texts = collectErrorTexts(error);
  const combined = texts.join(" | ");
  // Check nested cause first for precise classification
  if (texts.some((t) => t.includes("enotfound") || t.includes("getaddrinfo") || t.includes("eai_again") || t.includes("und_err_connect_timeout") || (t.includes("dns") && t.includes("failure")))) return { category: "DNS_FAILURE", message, dns: "FAIL", tls: "NOT_RUN", https: "NOT_RUN", http: "NOT_RUN", httpResponse: "NOT_RUN", rpc: "NOT_RUN", rpcTransport: "NOT_RUN", sorobanRpc: "NOT_RUN", networkMetadata: "NOT_RUN" };
  if (texts.some((t) => t.includes("certificate") || t.includes("tls") || t.includes("secure connection") || t.includes("unable_to_verify") || t.includes("cert_has_expired") || t.includes("self signed") || t.includes("tls handshake"))) return { category: "TLS_FAILURE", message, dns: "PASS", tls: "FAIL", https: "FAIL", http: "NOT_RUN", httpResponse: "NOT_RUN", rpc: "NOT_RUN", rpcTransport: "NOT_RUN", sorobanRpc: "NOT_RUN", networkMetadata: "NOT_RUN" };
  if (texts.some((t) => t.includes("etimedout") || t.includes("timed out") || t.includes("timeout") || t.includes("und_err_connect_timeout"))) return { category: "RPC_TIMEOUT", message, dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "FAIL", rpcTransport: "FAIL", sorobanRpc: "NOT_RUN", networkMetadata: "NOT_RUN" };
  if (combined.includes("method") && texts.some((t) => t.includes("unsupported") || t.includes("not found") || t.includes("not supported") || t.includes("unknown method"))) return { category: "RPC_METHOD_UNAVAILABLE", message, dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "PASS", rpcTransport: "PASS", sorobanRpc: "FAIL", networkMetadata: "NOT_RUN" };
  if (texts.some((t) => t.includes("json") || t.includes("malformed") || t.includes("unexpected token") || t.includes("invalid response"))) return { category: "RPC_MALFORMED_RESPONSE", message, dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "FAIL", rpcTransport: "FAIL", sorobanRpc: "FAIL", networkMetadata: "NOT_RUN" };
  if (texts.some((t) => t.includes("rpc") && (t.includes("unavailable") || t.includes("502") || t.includes("503") || t.includes("endpoint")))) return { category: "RPC_ENDPOINT_UNAVAILABLE", message, dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "PASS", rpc: "FAIL", rpcTransport: "FAIL", sorobanRpc: "FAIL", networkMetadata: "NOT_RUN" };
  if (texts.some((t) => t.includes("econnrefused") || t.includes("econnreset") || t.includes("econreset"))) return { category: "RPC_ENDPOINT_UNAVAILABLE", message, dns: "PASS", tls: "PASS", https: "PASS", http: "PASS", httpResponse: "FAIL", rpc: "FAIL", rpcTransport: "FAIL", sorobanRpc: "NOT_RUN", networkMetadata: "NOT_RUN" };
  if (texts.some((t) => t.includes("fetch failed") || t.includes("econn") || t.includes("socket") || t.includes("network"))) {
    // If fetch failed has nested cause already handled above, fallback to HTTP
    const hasPreciseCause = texts.some((t) => t.includes("enotfound") || t.includes("certificate") || t.includes("etimedout") || t.includes("econnrefused"));
    if (!hasPreciseCause) return { category: "HTTP_FAILURE", message, dns: "UNKNOWN", tls: "UNKNOWN", https: "FAIL", http: "FAIL", httpResponse: "FAIL", rpc: "UNKNOWN", rpcTransport: "UNKNOWN", sorobanRpc: "UNKNOWN", networkMetadata: "UNKNOWN" };
  }
  if (combined.includes("fetch failed") || texts.some((t) => t.includes("socket"))) return { category: "HTTP_FAILURE", message, dns: "UNKNOWN", tls: "UNKNOWN", https: "FAIL", http: "FAIL", httpResponse: "FAIL", rpc: "UNKNOWN", rpcTransport: "UNKNOWN", sorobanRpc: "UNKNOWN", networkMetadata: "UNKNOWN" };
  return { category: "RPC_ENDPOINT_UNAVAILABLE", message, dns: "UNKNOWN", tls: "UNKNOWN", https: "UNKNOWN", http: "UNKNOWN", httpResponse: "UNKNOWN", rpc: "FAIL", rpcTransport: "FAIL", sorobanRpc: "UNKNOWN", networkMetadata: "UNKNOWN" };
}

// Independent read-only transport diagnostics (no blockchain state changes, clearly labeled environmental only)
export interface IndependentTransportDiagnostic {
  label: "environmental-diagnostic-only";
  dns: LayerState;
  https: LayerState;
  latencyMs?: number;
  observedAt: string;
  error?: string;
}

export async function diagnoseIndependentTransport(hostname = "soroban-testnet.stellar.org"): Promise<IndependentTransportDiagnostic> {
  const observedAt = new Date().toISOString();
  const start = Date.now();
  let dns: LayerState = "UNKNOWN";
  let https: LayerState = "UNKNOWN";
  let error: string | undefined;
  try {
    // DNS lookup — read-only, no deployment
    const dnsMod = await import("node:dns/promises");
    await dnsMod.lookup(hostname);
    dns = "PASS";
  } catch (e) {
    dns = "FAIL";
    error = e instanceof Error ? e.message : String(e);
    return { label: "environmental-diagnostic-only", dns, https: "NOT_RUN", latencyMs: Date.now() - start, observedAt, error: sanitizeMessage(error) };
  }
  try {
    // HTTPS connection — HEAD request, no deployment, clearly not used for artifact
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${hostname}`, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    https = res.ok || res.status < 500 ? "PASS" : "FAIL";
    if (https === "FAIL") error = `HTTP ${res.status}`;
  } catch (e) {
    https = "FAIL";
    error = e instanceof Error ? e.message : String(e);
  }
  return { label: "environmental-diagnostic-only", dns, https, latencyMs: Date.now() - start, observedAt, error: error ? sanitizeMessage(error) : undefined };
}

// Bounded read-only retry wrapper — each attempt observable, no infinite, no background polling
export async function diagnoseWithBoundedRetries(
  input: { endpoint?: string; expectedPassphrase?: string; client?: ReadOnlyRpcClient; observedAt?: string },
  options: { maxAttempts?: number; backoffMs?: number } = {},
): Promise<{ final: TestnetConnectivityDiagnostic; attempts: TestnetConnectivityDiagnostic[]; attemptCount: number }> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const attempts: TestnetConnectivityDiagnostic[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const diag = await diagnoseTestnetConnectivity(input);
    attempts.push({ ...diag, attemptCount: attempt + 1 });
    if (diag.status === "NETWORK_OK") return { final: { ...diag, attemptCount: attempt + 1 }, attempts, attemptCount: attempt + 1 };
    if (attempt < maxAttempts - 1) {
      // Bounded backoff, no background polling
      await new Promise<void>((resolve) => setTimeout(resolve, (options.backoffMs ?? 150) * 2 ** attempt));
    }
  }
  const final = attempts[attempts.length - 1]!;
  // If final is NETWORK_OK after transient failures, mark as NETWORK_OK_WITH_TRANSIENT_FAILURES only if genuinely transient
  if (final.status === "NETWORK_OK" && attempts.length > 1 && attempts.some((a) => a.status === "BLOCKED")) {
    return { final: { ...final, status: "NETWORK_OK_WITH_TRANSIENT_FAILURES", attemptCount: attempts.length }, attempts, attemptCount: attempts.length };
  }
  return { final, attempts, attemptCount: attempts.length };
}

// Historical connectivity observations — preserve, not overwrite
export interface ConnectivityHistoryEntry extends TestnetConnectivityDiagnostic {
  attemptCount: number;
}
export function summarizeConnectivityHistory(history: ConnectivityHistoryEntry[]): { latest: ConnectivityHistoryEntry | null; latestSuccessful: ConnectivityHistoryEntry | null; count: number; transientFailures: number } {
  const latest = history[history.length - 1] ?? null;
  const latestSuccessful = [...history].reverse().find((h) => h.status === "NETWORK_OK" || h.status === "NETWORK_OK_WITH_TRANSIENT_FAILURES") ?? null;
  const transientFailures = history.filter((h) => h.status === "BLOCKED").length;
  return { latest, latestSuccessful, count: history.length, transientFailures };
}

// Legacy aliases for test compatibility
export const LEGACY_CONNECTIVITY_CATEGORIES = {
  DNS_FAILURE: "DNS_FAILURE" as const,
  TLS_FAILURE: "TLS_FAILURE" as const,
  HTTP_FAILURE: "HTTP_FAILURE" as const,
  RPC_TIMEOUT: "RPC_TIMEOUT" as const,
  RPC_MALFORMED_RESPONSE: "RPC_MALFORMED_RESPONSE" as const,
  RPC_METHOD_UNAVAILABLE: "RPC_METHOD_UNAVAILABLE" as const,
  PASSPHRASE_MISMATCH: "PASSPHRASE_MISMATCH" as const,
  NETWORK_OK: "NETWORK_OK" as const,
};
