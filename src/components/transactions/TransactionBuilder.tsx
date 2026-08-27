"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MethodSelector } from "@/components/transactions/MethodSelector";
import { ParameterForm } from "@/components/transactions/ParameterForm";
import { TransactionPreview } from "@/components/transactions/TransactionPreview";
import { WalletConnection } from "@/components/transactions/WalletConnection";
import { stellarComponents } from "@/data/components";
import {
  authorizationInfo,
  buildPreview,
  buildTransactionRequest,
  callableMethods,
  emptyParameters,
  transactionComponents,
  initialBuilderState,
  validateBuilderState,
} from "@/lib/transactions/builder";
import { prepareTransactionRequest, submitSignedTransaction } from "@/lib/transactions/client";
import {
  TRANSACTION_NETWORKS,
  networkConfig,
  type TransactionNetwork,
} from "@/lib/transactions/networks";
import type {
  TransactionBuilderState,
  TransactionPreparation,
  TransactionSigningState,
  TransactionSubmissionState,
} from "@/lib/transactions/types";
import { useWallet } from "@/lib/wallet/useWallet";
import type { WalletError } from "@/lib/wallet/types";

const selectClass =
  "mt-2 w-full rounded-default border border-border bg-surface px-3 py-2 font-sans text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar disabled:opacity-60";

const inputClass =
  "mt-2 w-full rounded-default border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar disabled:opacity-60";

const transactionComponentsList = transactionComponents(stellarComponents);

type FundingState =
  | { status: "idle" }
  | { status: "funding" }
  | { status: "success" }
  | { status: "failed"; error: string };

function signingError(message: string): WalletError {
  return { code: "unknown", message };
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function TransactionBuilder() {
  const [state, setState] = useState<TransactionBuilderState>(() =>
    initialBuilderState(stellarComponents),
  );
  const [preparation, setPreparation] = useState<TransactionPreparation>({
    phase: "draft",
  });
  const [signing, setSigning] = useState<TransactionSigningState>({
    phase: "idle",
  });
  const [submission, setSubmission] = useState<TransactionSubmissionState>({
    phase: "idle",
  });
  const [previousWalletAddress, setPreviousWalletAddress] = useState<
    string | null
  >(null);
  const [funding, setFunding] = useState<FundingState>({ status: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const wallet = useWallet();

  const selectedComponent =
    transactionComponentsList.find((component) => component.slug === state.componentSlug) ??
    transactionComponentsList[0];
  const selectedMethod = callableMethods(selectedComponent).find(
    (fn) => fn.name === state.methodName,
  );
  const effectiveState: TransactionBuilderState = {
    ...state,
    sourceAccount:
      wallet.state.status === "connected"
        ? (wallet.state.address ?? "")
        : state.sourceAccount,
  };
  const validation = validateBuilderState(effectiveState, stellarComponents);
  const walletNetworkMismatch =
    wallet.state.status === "connected" &&
    wallet.state.networkPassphrase !== networkConfig(state.network).passphrase;
  const preview = buildPreview(
    effectiveState,
    stellarComponents,
    preparation,
    wallet.state,
    signing,
    submission,
  );

  if (wallet.state.address !== previousWalletAddress) {
    setPreviousWalletAddress(wallet.state.address);
    setPreparation({ phase: "draft" });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });
    setFunding({ status: "idle" });
    setNotice(null);
  }

  function selectComponent(slug: string) {
    const component = transactionComponentsList.find(
      (candidate) => candidate.slug === slug,
    );
    if (!component) return;

    const method = callableMethods(component)[0];

    setState((previous) => ({
      ...previous,
      componentSlug: component.slug,
      methodName: method?.name ?? "",
      parameters: method ? emptyParameters(method.params) : {},
    }));
    setPreparation({ phase: "draft" });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });
    setNotice(null);
  }

  function selectMethod(methodName: string) {
    const component = transactionComponentsList.find(
      (candidate) => candidate.slug === state.componentSlug,
    );
    if (!component) return;

    const method = callableMethods(component).find(
      (fn) => fn.name === methodName,
    );
    if (!method) return;

    setState((previous) => ({
      ...previous,
      methodName: method.name,
      parameters: emptyParameters(method.params),
    }));
    setPreparation({ phase: "draft" });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });
    setNotice(null);
  }

  function updateParameter(name: string, value: string) {
    setState((previous) => ({
      ...previous,
      parameters: { ...previous.parameters, [name]: value },
    }));
    setPreparation({ phase: "draft" });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });
  }

  function updateNetwork(network: TransactionNetwork) {
    setState((previous) => ({ ...previous, network }));
    setPreparation({ phase: "draft" });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });
    setFunding({ status: "idle" });
    setNotice(null);
  }

  function updateSourceAccount(sourceAccount: string) {
    setState((previous) => ({ ...previous, sourceAccount }));
    setPreparation({ phase: "draft" });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });
    setFunding({ status: "idle" });
    setNotice(null);
  }

  async function fundWithFriendbot() {
    const address = effectiveState.sourceAccount;
    if (state.network !== "testnet" || !address) return;

    setFunding({ status: "funding" });

    try {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`,
        { method: "POST" },
      );

      if (!response.ok) {
        let detail = `Friendbot returned ${response.status}. It may already be funded. Try rebuilding the transaction.`;
        try {
          const body = (await response.json()) as { title?: string };
          if (body.title) detail = body.title;
        } catch {
          // keep the fallback detail
        }
        setFunding({ status: "failed", error: detail });
        return;
      }

      setFunding({ status: "success" });
    } catch {
      setFunding({
        status: "failed",
        error: "Could not reach the Friendbot funding service.",
      });
    }
  }

  async function build() {
    setNotice(null);
    const request = buildTransactionRequest(effectiveState);
    setPreparation({ phase: "built", request });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });

    setPreparation({ phase: "preparing", request });

    const result = await prepareTransactionRequest(request);
    setPreparation(
      result.status === "prepared"
        ? { phase: "prepared", result }
        : result.status === "blocked"
          ? { phase: "blocked", result }
          : { phase: "failed", result },
    );
  }

  async function sign() {
    if (preparation.phase !== "prepared") return;

    setNotice(null);
    setSubmission({ phase: "idle" });

    if (wallet.state.status !== "connected" || !wallet.state.address) {
      setSigning({
        phase: "sign-failed",
        error: {
          code: "wallet-unavailable",
          message: "Connect a wallet before signing.",
        },
      });
      return;
    }

    if (walletNetworkMismatch) {
      setSigning({
        phase: "sign-failed",
        error: {
          code: "wallet-network-mismatch",
          message: `Your wallet is on ${
            wallet.state.networkName ?? "another network"
          }, but the builder is using ${
            networkConfig(state.network).label
          }. Switch the wallet network or change the builder network before signing.`,
        },
      });
      return;
    }

    let envelope = preparation.result.simulation.transactionData;
    const expiresAt = preparation.result.simulation.expiresAt;

    if (!envelope) {
      setSigning({
        phase: "sign-failed",
        error: signingError("The prepared transaction has no envelope XDR."),
      });
      return;
    }

    setSigning({ phase: "signing" });

    if (expiresAt > 0 && Date.now() >= expiresAt) {
      const request = preparation.result.request;
      setPreparation({ phase: "preparing", request });
      const fresh = await prepareTransactionRequest(request);
      if (fresh.status === "prepared") {
        setPreparation({ phase: "prepared", result: fresh });
        envelope = fresh.simulation.transactionData;
      } else {
        setPreparation(
          fresh.status === "blocked"
            ? { phase: "blocked", result: fresh }
            : { phase: "failed", result: fresh },
        );
        setSigning({
          phase: "sign-failed",
          error: signingError(
            "The prepared transaction expired and could not be re-prepared. Please try again.",
          ),
        });
        return;
      }
    }

    const result = await wallet.signTransaction(
      envelope,
      preparation.result.request.sourceAccount,
    );

    if (result.ok) {
      setPreparation({
        phase: "signed",
        request: preparation.result.request,
      });
      setSigning({
        phase: "signed",
        signedXdr: result.signed.signedXdr,
        signerAddress: result.signed.signerAddress,
        signedAt: new Date().toISOString(),
      });
    } else {
      setSigning({ phase: "sign-failed", error: result.error });
    }
  }

  async function submit() {
  if (
    preparation.phase !== "signed" ||
    signing.phase !== "signed" ||
    !signing.signedXdr
  ) {
    return;
  }

  setNotice(null);
  setSubmission({ phase: "submitting" });

  const result = await submitSignedTransaction({
    network: state.network,
    signedXdr: signing.signedXdr,
  });

  if (!result.ok && result.error.code === "envelope.expired") {
    const request = preparation.request;
    setPreparation({ phase: "preparing", request });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });

    const fresh = await prepareTransactionRequest(request);
    if (fresh.status === "prepared") {
      setPreparation({ phase: "prepared", result: fresh });
      setNotice(
        "The transaction expired before it was submitted. It has been refreshed. Sign it again, then submit.",
      );
    } else {
      setPreparation(
        fresh.status === "blocked"
          ? { phase: "blocked", result: fresh }
          : { phase: "failed", result: fresh },
      );
      setNotice(
        "The transaction expired and could not be refreshed. Rebuild the transaction and try again.",
      );
    }
    return;
  }

  if (result.ok) {
    setSubmission({
      phase: "submitted",
      status: result.submission.status,
      transactionHash: result.submission.transactionHash,
      returnValue: result.submission.returnValue,
      submittedAt: result.submission.submittedAt,
      detail: result.submission.detail,
    });

    if (result.submission.status === "PENDING") {
      setNotice(
        'The transaction was accepted by the network but has not been confirmed yet. Use "Check status" to see whether it has been included in a ledger.',
      );
    }
  } else {
    setSubmission({ phase: "submit-failed", error: result.error });
  }
}

async function checkSubmissionStatus() {
  if (
    preparation.phase !== "signed" ||
    signing.phase !== "signed" ||
    !signing.signedXdr
  ) {
    return;
  }

  setNotice(null);
  setSubmission({ phase: "submitting" });

  const result = await submitSignedTransaction({
    network: state.network,
    signedXdr: signing.signedXdr,
  });

  if (result.ok) {
    setSubmission({
      phase: "submitted",
      status: result.submission.status,
      transactionHash: result.submission.transactionHash,
      returnValue: result.submission.returnValue,
      submittedAt: result.submission.submittedAt,
      detail: result.submission.detail,
    });

    if (result.submission.status === "PENDING") {
      setNotice(
        "Still pending: the network has accepted the transaction but has not yet included it in a ledger. Check again in a moment.",
      );
    }
  } else {
    setSubmission({ phase: "submit-failed", error: result.error });
  }
}

  function reset() {
    setState(initialBuilderState(stellarComponents));
    setPreparation({ phase: "draft" });
    setSigning({ phase: "idle" });
    setSubmission({ phase: "idle" });
    setFunding({ status: "idle" });
    setNotice(null);
  }

  const sourceAccountLocked = wallet.state.status === "connected";
  const preparedSimulation =
    preparation.phase === "prepared" ? preparation.result.simulation : undefined;
  const sourceAccountUnfunded =
    preparedSimulation !== undefined && !preparedSimulation.sourceAccountFunded;
  const authorization = authorizationInfo(selectedMethod);
  const authorizationParamValue =
    authorization.kind === "first-address" && authorization.paramName
      ? state.parameters[authorization.paramName]
      : undefined;
  const authorizationMismatch =
    authorization.kind === "first-address" &&
    wallet.state.status === "connected" &&
    !!authorizationParamValue &&
    authorizationParamValue !== wallet.state.address;
  const submissionPending = submission.status === "PENDING";

  return (
    <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
              Builder
            </p>

            <Link
              href="/docs/transactions"
              className="font-mono text-xs text-accent-stellar hover:underline"
            >
              Learn about transactions →
            </Link>
          </div>

          <WalletConnection
            wallet={wallet.state}
            networkLabel={networkConfig(state.network).label}
            networkMismatch={walletNetworkMismatch}
            onConnect={() => void wallet.connect()}
            onDisconnect={wallet.disconnect}
          />

          <div className="mt-5 space-y-5">
            <MethodSelector
              components={transactionComponentsList}
              selectedComponent={selectedComponent}
              selectedMethodName={state.methodName}
              onComponentChange={selectComponent}
              onMethodChange={selectMethod}
            />

            <div>
              <label htmlFor="tx-network" className="block">
                <span className="font-sans text-sm text-text-primary">
                  Network
                </span>
              </label>

              <select
                id="tx-network"
                value={state.network}
                onChange={(event) =>
                  updateNetwork(event.target.value as TransactionNetwork)
                }
                className={selectClass}
              >
                {TRANSACTION_NETWORKS.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tx-source-account" className="block">
                <span className="font-sans text-sm text-text-primary">
                  Source account
                </span>
              </label>

              <input
                id="tx-source-account"
                type="text"
                value={effectiveState.sourceAccount}
                onChange={(event) => updateSourceAccount(event.target.value)}
                placeholder={sourceAccountLocked ? undefined : "G..."}
                readOnly={sourceAccountLocked}
                disabled={sourceAccountLocked}
                className={inputClass}
              />

              <p className="mt-2 font-sans text-xs leading-relaxed text-text-secondary">
                {sourceAccountLocked
                  ? "Locked to the connected wallet address."
                  : "Connect a wallet to use its address as the source account."}
              </p>
            </div>

            {sourceAccountUnfunded && (
              <div className="mt-5 rounded-default border border-accent-forge/40 bg-accent-forge/10 p-3">
                <p className="font-sans text-sm text-text-primary">
                  Source account not funded
                </p>

                <p className="mt-1 font-sans text-xs leading-relaxed text-text-secondary">
                  This account does not exist on{" "}
                  {networkConfig(state.network).label} yet. Simulation works,
                  but you must fund it before signing or submitting a
                  transaction.
                </p>

                {funding.status === "success" ? (
                  <p className="mt-2 font-sans text-xs leading-relaxed text-accent-stellar">
                    Funded! Rebuild the transaction to sign and submit.
                  </p>
                ) : (
                  state.network === "testnet" && (
                    <Button
                      variant="secondary"
                      className="mt-2"
                      onClick={() => void fundWithFriendbot()}
                      disabled={funding.status === "funding"}
                    >
                      {funding.status === "funding"
                        ? "Funding…"
                        : "Fund with Friendbot"}
                    </Button>
                  )
                )}

                {funding.status === "failed" && (
                  <p className="mt-2 font-sans text-xs leading-relaxed text-accent-forge">
                    {funding.error}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
            Arguments
          </p>

          <div className="mt-5">
            <ParameterForm
              params={selectedMethod?.params ?? []}
              values={state.parameters}
              errors={validation.errors}
              onChange={updateParameter}
              walletAddress={
                wallet.state.status === "connected"
                  ? (wallet.state.address ?? undefined)
                  : undefined
              }
            />
          </div>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void build()}>
            Build Transaction
          </Button>

          <Button
            variant="secondary"
            onClick={() => void sign()}
            disabled={
              preparation.phase !== "prepared" ||
              wallet.state.status !== "connected" ||
              walletNetworkMismatch ||
              sourceAccountUnfunded ||
              signing.phase === "signing" ||
              signing.phase === "signed"
            }
          >
            {signing.phase === "signing"
              ? "Waiting for wallet…"
              : signing.phase === "signed"
                ? "Signed"
                : "Sign Transaction"}
          </Button>

          <Button
            variant="secondary"
            onClick={() =>
              void (submissionPending ? checkSubmissionStatus() : submit())
            }
            disabled={
              signing.phase !== "signed" ||
              submission.phase === "submitting" ||
              (submission.phase === "submitted" && !submissionPending)
            }
          >
            {submission.phase === "submitting"
              ? "Submitting…"
              : submission.phase === "submitted"
                ? submissionPending
                  ? "Check status"
                  : "Submitted"
                : "Submit Transaction"}
          </Button>

          <Button variant="ghost" onClick={reset}>
            Reset
          </Button>
        </div>

        {preparation.phase === "prepared" &&
          wallet.state.status === "connected" &&
          walletNetworkMismatch && (
            <p className="font-sans text-xs leading-relaxed text-accent-forge">
              The wallet network does not match the selected network. Signing is
              disabled until they match.
            </p>
          )}

        {preparation.phase === "prepared" &&
          wallet.state.status !== "connected" && (
            <p className="font-sans text-xs leading-relaxed text-text-secondary">
              Connect a wallet to sign the prepared transaction.
            </p>
          )}

        {preparation.phase === "prepared" && sourceAccountUnfunded && (
          <p className="font-sans text-xs leading-relaxed text-accent-forge">
            The source account is not funded on{" "}
            {networkConfig(state.network).label}. Fund it before signing or
            submitting a transaction.
          </p>
        )}

        {authorization.kind === "admin" && (
          <p className="font-sans text-xs leading-relaxed text-accent-forge">
            This method is admin-only: it can only be authorized by the
            contract administrator. This tool does not expose the admin
            address. If the connected wallet is not the admin, the
            transaction will be rejected on-chain.
          </p>
        )}

        {authorizationMismatch && (
          <p className="font-sans text-xs leading-relaxed text-accent-forge">
            {authorization.paramName} must be authorized by its owner. The
            connected wallet ({shortenAddress(wallet.state.address ?? "")}) is
            not that address, so the transaction will be rejected on-chain.
            Connect the wallet that owns{" "}
            <span className="font-mono text-[11px]">
              {authorizationParamValue}
            </span>
            .
          </p>
        )}

        {notice && (
          <p className="rounded-default border border-accent-stellar/40 bg-accent-stellar/10 p-2 font-sans text-xs leading-relaxed text-text-primary">
            {notice}
          </p>
        )}
      </div>

      <TransactionPreview preview={preview} />
    </div>
  );
}