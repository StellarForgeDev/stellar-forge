import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { TestnetConnectivityDiagnostic } from "./testnet-connectivity";

export interface ConnectivityHistoryEntry extends TestnetConnectivityDiagnostic {
  attemptCount: number;
}

const HISTORY_PATH = path.join(process.cwd(), "contracts", "connectivity-history.json");
const MAX_ENTRIES = 20;

export async function readConnectivityHistory(): Promise<ConnectivityHistoryEntry[]> {
  try {
    const raw = await readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw) as ConnectivityHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendConnectivityHistory(entry: TestnetConnectivityDiagnostic): Promise<ConnectivityHistoryEntry[]> {
  const history = await readConnectivityHistory();
  const withAttempt: ConnectivityHistoryEntry = { ...entry, attemptCount: entry.attemptCount ?? 1 };
  // Sanitize: ensure no secrets, only safe metadata
  const sanitized: ConnectivityHistoryEntry = {
    network: withAttempt.network,
    endpoint: withAttempt.endpoint,
    dns: withAttempt.dns,
    tls: withAttempt.tls,
    https: withAttempt.https,
    http: withAttempt.http,
    httpResponse: withAttempt.httpResponse,
    rpc: withAttempt.rpc,
    rpcTransport: withAttempt.rpcTransport,
    sorobanRpc: withAttempt.sorobanRpc,
    networkMetadata: withAttempt.networkMetadata,
    networkPassphrase: withAttempt.networkPassphrase,
    status: withAttempt.status,
    failureCategory: withAttempt.failureCategory,
    error: withAttempt.error ? withAttempt.error.slice(0, 500) : undefined,
    errorName: withAttempt.errorName,
    errorCode: withAttempt.errorCode,
    errorMessage: withAttempt.errorMessage?.slice(0, 500),
    causeName: withAttempt.causeName,
    causeCode: withAttempt.causeCode,
    causeMessage: withAttempt.causeMessage?.slice(0, 500),
    httpStatus: withAttempt.httpStatus,
    rpcMethod: withAttempt.rpcMethod,
    timeoutMs: withAttempt.timeoutMs,
    latencyMs: withAttempt.latencyMs,
    observedAt: withAttempt.observedAt,
    healthMethod: withAttempt.healthMethod,
    networkMethod: withAttempt.networkMethod,
    runtime: withAttempt.runtime,
    attemptCount: withAttempt.attemptCount,
  };
  const next = [...history, sanitized].slice(-MAX_ENTRIES);
  await mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export function summarizeHistory(history: ConnectivityHistoryEntry[]): { latest: ConnectivityHistoryEntry | null; latestSuccessful: ConnectivityHistoryEntry | null; count: number; transientFailures: number; history: ConnectivityHistoryEntry[] } {
  const latest = history[history.length - 1] ?? null;
  const latestSuccessful = [...history].reverse().find((h) => h.status === "NETWORK_OK" || h.status === "NETWORK_OK_WITH_TRANSIENT_FAILURES") ?? null;
  const transientFailures = history.filter((h) => h.status === "BLOCKED").length;
  return { latest, latestSuccessful, count: history.length, transientFailures, history };
}
