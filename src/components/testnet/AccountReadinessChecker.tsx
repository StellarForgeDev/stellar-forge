"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type AccountStatus = "ACCOUNT_NOT_SUPPLIED" | "ACCOUNT_NOT_FOUND" | "ACCOUNT_UNFUNDED" | "ACCOUNT_READY" | string;

interface Result {
  status: AccountStatus;
  address: string;
  nativeBalance: string | null;
  sequenceNumber: string | null;
  network: string;
  exists: boolean | null;
  sufficientBalance: boolean | null;
  observedAt: string;
  error?: string;
}

export function AccountReadinessChecker() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/testnet/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim() || null, minimumNativeBalance: "1" }),
        cache: "no-store",
      });
      const payload = (await response.json()) as { result?: Result; error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Account inspection failed.");
        return;
      }
      setResult(payload.result ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-default border border-border bg-surface p-4">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent-stellar">Deployment-account readiness (public, read-only)</p>
      <p className="mt-2 text-xs leading-5 text-text-secondary">Inspects only public Stellar address, existence, sequence number, native XLM balance, and network. Never requests secret keys.</p>
      <label className="mt-4 block font-mono text-xs text-text-secondary">
        Public Stellar address (G...)
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="G... (leave empty to test ACCOUNT_NOT_SUPPLIED)"
          className="mt-2 block w-full rounded-default border border-border bg-canvas px-3 py-2 font-mono text-sm text-text-primary"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void check()} disabled={loading}>
          {loading ? "Checking…" : "Check account readiness"}
        </Button>
        <span className="font-mono text-xs text-text-secondary">Manual check only • No polling</span>
      </div>
      {error && <p className="mt-3 text-sm text-tone-error">{error}</p>}
      {result && (
        <div className="mt-4 rounded-default border border-border/60 bg-canvas p-3">
          <p className={`font-mono text-xs ${result.status === "ACCOUNT_READY" ? "text-tone-success" : result.status === "ACCOUNT_UNFUNDED" || result.status === "ACCOUNT_NOT_FOUND" ? "text-tone-error" : "text-text-secondary"}`}>
            Status: {result.status}
          </p>
          <dl className="mt-2 grid gap-2 text-xs">
            <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Address</dt><dd className="break-all">{result.address || "(not supplied)"}</dd></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Exists</dt><dd>{String(result.exists)}</dd></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Sequence</dt><dd>{result.sequenceNumber ?? "—"}</dd></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Native XLM</dt><dd>{result.nativeBalance ?? "—"}</dd></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Network</dt><dd>{result.network}</dd></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Sufficient</dt><dd>{String(result.sufficientBalance)}</dd></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Observed</dt><dd>{result.observedAt}</dd></div>
            {result.error && <div className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-text-secondary">Error</dt><dd className="break-all text-tone-error">{result.error}</dd></div>}
          </dl>
          <p className="mt-2 font-mono text-[10px] text-text-secondary">Statuses: ACCOUNT_NOT_SUPPLIED • ACCOUNT_NOT_FOUND • ACCOUNT_UNFUNDED • ACCOUNT_READY</p>
        </div>
      )}
    </div>
  );
}
