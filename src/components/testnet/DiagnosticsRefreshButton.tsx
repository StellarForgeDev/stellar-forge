"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface Diagnostic {
  network: string;
  endpoint: string;
  dns: string;
  tls: string;
  https: string;
  http: string;
  httpResponse: string;
  rpc: string;
  rpcTransport: string;
  sorobanRpc: string;
  networkMetadata: string;
  networkPassphrase: string;
  status: string;
  failureCategory?: string;
  error?: string;
  errorName?: string;
  errorCode?: string;
  causeName?: string;
  causeCode?: string;
  httpStatus?: number;
  latencyMs?: number;
  observedAt?: string;
  attemptCount?: number;
  runtime?: string;
}

export function DiagnosticsRefreshButton() {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recheck() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/testnet/diagnostics", { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as { diagnostic?: Diagnostic; error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Diagnostics recheck failed.");
        setDiagnostic(null);
        return;
      }
      setDiagnostic(payload.diagnostic ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-default border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void recheck()} disabled={loading}>
          {loading ? "Rechecking…" : "[Refresh diagnostics]"}
        </Button>
        <span className="font-mono text-xs text-text-secondary">Read-only • Manual refresh only • No background polling • No automatic retry</span>
      </div>
      {error && <p className="mt-3 text-sm text-tone-error">{error}</p>}
      {diagnostic && (
        <div className="mt-4 rounded-default border border-border/60 bg-canvas p-3">
          <p className="font-mono text-xs uppercase text-text-secondary">Live recheck result (READ-ONLY)</p>
          <dl className="mt-2 grid gap-2 text-xs">
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Overall</dt><dd className={diagnostic.status === "NETWORK_OK" || diagnostic.status === "HEALTHY" ? "text-tone-success" : "text-tone-error"}>{diagnostic.status}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">DNS</dt><dd>{diagnostic.dns}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">TLS</dt><dd>{diagnostic.tls}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">HTTPS</dt><dd>{diagnostic.https ?? "UNKNOWN"}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">HTTP</dt><dd>{diagnostic.http}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">HTTP Response</dt><dd>{diagnostic.httpResponse ?? "UNKNOWN"}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">RPC Transport</dt><dd>{diagnostic.rpcTransport ?? diagnostic.rpc}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Soroban RPC</dt><dd>{diagnostic.sorobanRpc}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Passphrase</dt><dd>{diagnostic.networkPassphrase}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Category</dt><dd>{diagnostic.failureCategory ?? "none"}</dd></div>
            <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Attempt Count</dt><dd>{diagnostic.attemptCount ?? 1}</dd></div>
            {diagnostic.errorName && <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Error Name</dt><dd>{diagnostic.errorName}</dd></div>}
            {diagnostic.errorCode && <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Error Code</dt><dd>{diagnostic.errorCode}</dd></div>}
            {diagnostic.causeName && <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Cause Name</dt><dd>{diagnostic.causeName}</dd></div>}
            {diagnostic.causeCode && <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Cause Code</dt><dd>{diagnostic.causeCode}</dd></div>}
            {diagnostic.httpStatus && <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">HTTP Status</dt><dd>{diagnostic.httpStatus}</dd></div>}
            {diagnostic.error && <div className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-text-secondary">Safe Error</dt><dd className="break-all text-tone-error">{diagnostic.error}</dd></div>}
          </dl>
          <p className="mt-2 font-mono text-[10px] text-text-secondary">Observed: {diagnostic.observedAt} • {diagnostic.latencyMs ?? 0}ms • Runtime: {diagnostic.runtime ?? "unknown"}</p>
        </div>
      )}
    </div>
  );
}
