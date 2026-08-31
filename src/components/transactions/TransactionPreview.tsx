import type {
  TransactionPreparationPhase,
  TransactionPreviewData,
} from "@/lib/transactions/types";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { StateBadge, type StateTone } from "@/components/ui/StateBadge";

const statusTone: Record<TransactionPreparationPhase, StateTone> = {
  draft: "pending",
  built: "pending",
  preparing: "pending",
  prepared: "success",
  signed: "success",
  failed: "error",
  blocked: "error",
};

export interface TransactionPreviewProps {
  preview: TransactionPreviewData;
}

export function TransactionPreview({ preview }: TransactionPreviewProps) {
  return (
    <Card className="h-fit min-w-0 max-w-full">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          Transaction Preview
        </h2>

        <StateBadge tone={statusTone[preview.phase]}>
          {preview.statusLabel}
        </StateBadge>
      </div>

      <dl className="mt-5 space-y-3">
        <div className="flex min-w-0 items-baseline justify-between gap-4">
          <dt className="font-sans text-sm text-text-secondary">Network</dt>
          <dd className="min-w-0 max-w-[70%] break-words text-right font-mono text-xs text-text-primary">
            {preview.networkLabel}
          </dd>
        </div>

        <div className="flex min-w-0 items-baseline justify-between gap-4">
          <dt className="font-sans text-sm text-text-secondary">Source</dt>
          <dd className="min-w-0 max-w-[70%] break-all text-right font-mono text-xs text-text-primary">
            {preview.sourceAccount}
          </dd>
        </div>

        <div className="flex min-w-0 items-baseline justify-between gap-4">
          <dt className="font-sans text-sm text-text-secondary">Contract</dt>
          <dd className="min-w-0 max-w-[70%] break-words text-right font-mono text-xs text-text-primary">
            {preview.componentName}
          </dd>
        </div>

        <div className="flex min-w-0 items-baseline justify-between gap-4">
          <dt className="font-sans text-sm text-text-secondary">Method</dt>
          <dd className="min-w-0 max-w-[70%] break-words text-right font-mono text-xs text-text-primary">
            {preview.methodName}
          </dd>
        </div>
      </dl>

      {preview.authorization && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">
            Authorization
          </p>

          <p className="mt-2 font-sans text-xs leading-relaxed text-text-primary">
            {preview.authorization.description}
          </p>
        </div>
      )}

      {preview.arguments.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">Arguments</p>

          <ul className="mt-3 space-y-2">
            {preview.arguments.map((argument) => (
              <li
                key={argument.name}
                className="flex min-w-0 items-baseline justify-between gap-4"
              >
                <span className="font-mono text-xs text-text-secondary">
                  {argument.name}
                  <span className="text-text-secondary/70"> ({argument.type})</span>
                </span>

                <span className="max-w-[55%] break-all font-mono text-xs text-text-primary">
                  {argument.value || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.errors.length > 0 && preview.phase !== "draft" && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">
            Validation errors
          </p>

          <ul className="mt-3 space-y-2">
            {preview.errors.map((error) => (
              <li
                key={error.field}
                className="flex flex-col gap-1 rounded-default border border-border bg-canvas/60 p-2"
              >
                <span className="font-mono text-[11px] text-accent-forge">
                  {error.code}
                </span>
                <span className="font-sans text-xs text-text-primary">
                  {error.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.deploymentStatus === "missing" && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">
            Contract deployment
          </p>

          <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
            This contract has source code, but no deployed contract address is
            configured for {preview.networkLabel}. Soroban simulation cannot run
            until a deployment is registered.
          </p>
        </div>
      )}

      {preview.contractAddress && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">
            Contract address
          </p>

          <p className="mt-2 break-all font-mono text-xs text-text-primary">
            {preview.contractAddress}
          </p>
        </div>
      )}

      {preview.preparationError && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">
            Preparation error
          </p>

          <p className="mt-2 flex flex-col gap-1 rounded-default border border-border bg-canvas/60 p-2">
            <span className="font-mono text-[11px] text-accent-forge">
              {preview.preparationError.code}
            </span>
            <span className="font-sans text-xs text-text-primary">
              {preview.preparationError.message}
            </span>
            {preview.preparationError.detail && (
              <span className="font-mono text-[11px] text-text-secondary">
                {preview.preparationError.detail}
              </span>
            )}
          </p>
        </div>
      )}

      {preview.simulation && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">
            Simulation result
          </p>

          <dl className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-sans text-xs text-text-secondary">
                Latest ledger
              </dt>
              <dd className="font-mono text-xs text-text-primary">
                {preview.simulation.latestLedger}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-sans text-xs text-text-secondary">
                Min resource fee
              </dt>
              <dd className="font-mono text-xs text-text-primary">
                {preview.simulation.minResourceFee}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-sans text-xs text-text-secondary">Cost</dt>
              <dd className="font-mono text-xs text-text-primary">
                {preview.simulation.cost.cpuInstructions} CPU,{" "}
                {preview.simulation.cost.memoryBytes} memory
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-sans text-xs text-text-secondary">
                Return value
              </dt>
                <dd className="max-w-[55%] break-all font-mono text-xs text-text-primary">
                  {preview.simulation.result
                    ? `${preview.simulation.result.type}: ${preview.simulation.result.value}`
                    : "None"}
                </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-sans text-xs text-text-secondary">
                Read-only / State-changing
              </dt>
              <dd className="font-mono text-xs text-text-primary">
                {preview.simulation.isReadCall ? "Read-only" : "State-changing"}
              </dd>
            </div>

            {preview.expiresAt !== undefined && preview.expiresAt > 0 && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-sans text-xs text-text-secondary">
                  Expires at
                </dt>
                <dd
                  className={`font-mono text-xs ${
                    preview.expired ? "text-accent-forge" : "text-text-primary"
                  }`}
                >
                  {new Date(preview.expiresAt).toLocaleTimeString()}
                </dd>
              </div>
            )}
          </dl>

          {preview.sourceAccountFunded === false && (
            <p className="mt-3 rounded-default border border-accent-forge/40 bg-accent-forge/10 p-2 font-sans text-xs leading-relaxed text-text-primary">
              This source account is not funded on {preview.networkLabel}.
              Simulation works, but you must fund the account before signing
              or submitting a transaction.
            </p>
          )}

          <p className="mt-3 font-sans text-xs leading-relaxed text-text-secondary">
            {preview.simulation.isReadCall
              ? "Read-only calls inspect contract state without changing anything on-chain."
              : "This is a state-changing transaction. When submitted, it will update ledger state and consume network resources (fees)."}
          </p>

          {preview.expired && (
            <p className="mt-3 rounded-default border border-accent-forge/40 bg-accent-forge/10 p-2 font-sans text-xs leading-relaxed text-text-primary">
              This prepared transaction has expired. It will be re-prepared
              automatically when you sign.
            </p>
          )}

          {preview.simulation.transactionData && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-sans text-xs text-text-secondary">
                  Prepared transaction XDR
                </p>

                <CopyButton
                  value={preview.simulation.transactionData}
                  label="Copy XDR"
                />
              </div>

              <pre className="mt-2 min-w-0 max-w-full overflow-x-auto rounded-default border border-border bg-canvas/60 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                <code>{preview.simulation.transactionData}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {preview.walletStatus === "connected" && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">Wallet</p>

          <p className="mt-2 break-all font-mono text-xs text-text-primary">
            {preview.walletAddress}
          </p>

          {preview.walletNetworkMismatch && (
            <p className="mt-2 font-sans text-xs leading-relaxed text-accent-forge">
              Wallet network ({preview.walletNetworkName ?? "unknown"}) does not
              match the selected network ({preview.networkLabel}).
            </p>
          )}
        </div>
      )}

      {preview.walletStatus !== "connected" && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">Wallet</p>

          <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
            {preview.walletStatus === "unavailable"
              ? "Freighter is not installed or not available in this browser."
              : preview.walletStatus === "checking"
                ? "Checking for a connected wallet…"
                : preview.walletStatus === "connecting"
                  ? "Waiting for wallet approval…"
                  : "No wallet connected. Connect Freighter to sign transactions."}
          </p>

          {preview.walletError && (
            <p className="mt-2 font-sans text-xs leading-relaxed text-accent-forge">
              {preview.walletError.message}
            </p>
          )}
        </div>
      )}

      {preview.signingPhase !== "idle" && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">Signing</p>

          {preview.signingPhase === "signing" && (
            <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
              Waiting for wallet approval…
            </p>
          )}

          {preview.signingPhase === "sign-failed" && preview.signingError && (
            <p className="mt-2 flex flex-col gap-1 rounded-default border border-border bg-canvas/60 p-2">
              <span className="font-mono text-[11px] text-accent-forge">
                {preview.signingError.code}
              </span>
              <span className="font-sans text-xs text-text-primary">
                {preview.signingError.message}
              </span>
              {preview.signingError.detail && (
                <span className="font-mono text-[11px] text-text-secondary">
                  {preview.signingError.detail}
                </span>
              )}
            </p>
          )}

          {preview.signingPhase === "signed" && (
            <>
              <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
                Signed by {preview.signerAddress}
                {preview.signedAt && (
                  <>
                    {" "}
                    at{" "}
                    <span className="font-mono text-[11px]">
                      {new Date(preview.signedAt).toLocaleTimeString()}
                    </span>
                  </>
                )}
                . Nothing has been submitted on-chain.
              </p>

              {preview.signedXdr && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-sans text-xs text-text-secondary">
                      Signed transaction XDR
                    </p>

                    <CopyButton value={preview.signedXdr} label="Copy XDR" />
                  </div>

                  <pre className="mt-2 min-w-0 max-w-full overflow-x-auto rounded-default border border-border bg-canvas/60 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                    <code>{preview.signedXdr}</code>
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {preview.submissionPhase !== "idle" && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="font-sans text-sm text-text-secondary">Submission</p>

          {preview.submissionPhase === "submitting" && (
            <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
              Submitting the signed transaction to {preview.networkLabel} and
              waiting for confirmation…
            </p>
          )}

          {preview.submissionPhase === "submit-failed" &&
            preview.submissionError && (
              <p className="mt-2 flex flex-col gap-1 rounded-default border border-border bg-canvas/60 p-2">
                <span className="font-mono text-[11px] text-accent-forge">
                  {preview.submissionError.code}
                </span>
                <span className="font-sans text-xs text-text-primary">
                  {preview.submissionError.message}
                </span>
                {preview.submissionError.detail && (
                  <span className="font-mono text-[11px] text-text-secondary">
                    {preview.submissionError.detail}
                  </span>
                )}
              </p>
            )}

          {preview.submissionPhase === "submitted" && (
            <div className="mt-3 space-y-2">
              <p
                className={`font-mono text-xs ${
                  preview.submissionStatus === "SUCCESS"
                    ? "text-accent-stellar"
                    : "text-accent-forge"
                }`}
              >
                {preview.submissionStatus}
              </p>

              {preview.submissionTransactionHash && (
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-xs text-text-secondary">
                    Transaction hash
                  </span>
                  <span className="break-all font-mono text-[11px] text-text-primary">
                    {preview.submissionTransactionHash}
                  </span>
                </div>
              )}

              {preview.submissionReturnValue && (
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-xs text-text-secondary">
                    Contract return value
                  </span>
                  <span className="break-all font-mono text-[11px] text-text-primary">
                    {preview.submissionReturnValue.type}:{" "}
                    {preview.submissionReturnValue.value}
                  </span>
                </div>
              )}

              {preview.submissionStatus === "PENDING" && (
                <p className="font-sans text-xs leading-relaxed text-text-secondary">
                  The network accepted this transaction but has not yet
                  included it in a ledger. Re-checking its status is safe,
                  because the same signed transaction cannot be submitted
                  twice.
                </p>
              )}

              {preview.submissionDetail && (
                <p className="font-sans text-xs leading-relaxed text-text-secondary">
                  {preview.submissionDetail}
                </p>
              )}

              {preview.submittedAt && (
                <p className="font-mono text-[11px] text-text-secondary">
                  Submitted at{" "}
                  {new Date(preview.submittedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="font-sans text-sm text-text-secondary">Status</p>

        <StateBadge tone={statusTone[preview.phase]} className="mt-1">
          {preview.statusLabel}
        </StateBadge>

        {preview.phase === "prepared" && (
          <>
            <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
              Simulation succeeded against the live{" "}
              {preview.networkLabel} RPC. Nothing has been signed or submitted
              on-chain. Sign the prepared transaction with a connected wallet.
            </p>
            {preview.preparedAt && (
              <p className="mt-1 font-mono text-[11px] text-text-secondary">
                Prepared at {preview.preparedAt}
              </p>
            )}
          </>
        )}

        {preview.phase === "signed" && (
          <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
            The transaction has been signed by your wallet and is ready to
            submit.
          </p>
        )}

        {preview.phase === "blocked" && (
          <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
            No contract deployment is configured for {preview.networkLabel}.
          </p>
        )}
      </div>

      {preview.request && (
        <div className="mt-5">
          <p className="font-sans text-sm text-text-primary">
            Transaction request
          </p>

          <pre className="mt-2 min-w-0 max-w-full overflow-x-auto rounded-default border border-border bg-canvas/60 p-3 font-mono text-xs leading-relaxed text-text-secondary">
            <code>{JSON.stringify(preview.request, null, 2)}</code>
          </pre>
        </div>
      )}
    </Card>
  );
}
