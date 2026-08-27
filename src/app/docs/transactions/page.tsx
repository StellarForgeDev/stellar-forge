import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/LinkButton";

export const metadata: Metadata = {
  title: "Transactions — Stellar-Forge Docs",
  description:
    "How the Stellar-Forge Transaction Builder builds, simulates, signs with Freighter, and submits Soroban transactions to Stellar Testnet.",
};

const textLink =
  "inline-flex font-mono text-xs text-accent-stellar hover:underline";

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4">
      <span className="mt-0.5 font-mono text-xs text-accent-stellar">
        {number}
      </span>

      <div>
        <h3 className="font-display text-lg font-medium text-text-primary">
          {title}
        </h3>

        <div className="mt-2 space-y-2 font-sans text-sm leading-7 text-text-secondary">
          {children}
        </div>
      </div>
    </li>
  );
}

function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  const styles =
    tone === "warn"
      ? "border-accent-forge/40 bg-accent-forge/10"
      : "border-accent-stellar/40 bg-accent-stellar/10";

  return (
    <div className={`mt-4 rounded-default border p-3 font-sans text-sm leading-7 text-text-primary ${styles}`}>
      {children}
    </div>
  );
}

export default function TransactionsDocsPage() {
  return (
    <main className="min-w-0 flex-1">
      <header>
        <p className="font-mono text-xs tracking-[0.18em] text-accent-stellar">
          STELLAR-FORGE / DOCUMENTATION
        </p>

        <h1 className="mt-4 font-display text-4xl font-medium leading-tight text-text-primary sm:text-5xl">
          Transactions, end to end.
        </h1>

        <p className="mt-5 max-w-2xl font-sans text-base leading-7 text-text-secondary sm:text-lg">
          The Transaction Builder turns a catalog component into a real Stellar
          transaction: build and simulate it against Testnet, sign it with
          Freighter, then submit it to the network. This page explains exactly
          what the current tool does — no more, no less.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/transactions" variant="secondary">
            Open the Transaction Builder →
          </LinkButton>

          <Link href="/docs" className={textLink}>
            Back to docs hub →
          </Link>
        </div>
      </header>

      <section id="what-happens" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          01 / The four phases
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Every on-chain transaction moves through the same pipeline. Simulation
          is free and changes nothing; signing authorizes the exact envelope on
          your screen; submission is what actually executes on the network.
        </p>

        <ol className="mt-8 max-w-2xl space-y-7">
          <Step number="01" title="Build & simulate">
            <p>
              Pick the network, component, and method, fill in the parameters,
              and connect Freighter. Clicking{" "}
              <span className="font-mono text-xs">Build Transaction</span>{" "}
              validates your inputs and runs a real{" "}
              <span className="font-mono text-xs">simulateTransaction</span> call
              against the selected network&apos;s RPC.
            </p>
            <p>
              The simulation returns the resource cost, the return value (for
              read-only calls), whether the call is read-only or
              state-changing, whether your source account exists on-chain, and a
              ready-to-sign transaction envelope (base64 XDR).
            </p>
          </Step>

          <Step number="02" title="Sign with Freighter">
            <p>
              Clicking <span className="font-mono text-xs">Sign Transaction</span>{" "}
              sends the assembled envelope to Freighter, which prompts you to
              approve the exact XDR shown in the preview. The signature is added
              client-side; your key never leaves the wallet.
            </p>
            <p>
              The signing wallet must be on the same network as the builder, and
              the source account must be funded. If the prepared envelope has
              lapsed, the builder quietly re-simulates before signing.
            </p>
          </Step>

          <Step number="03" title="Submit to Testnet">
            <p>
              Clicking <span className="font-mono text-xs">Submit Transaction</span>{" "}
              sends only <span className="font-mono text-xs">{"{ network, signedXdr }"}</span>{" "}
              to the submission route. The server re-verifies the source
              signature and the envelope&apos;s time bounds, then calls{" "}
              <span className="font-mono text-xs">sendTransaction</span> on the
              network RPC and polls for settlement.
            </p>
          </Step>

          <Step number="04" title="Confirm the result">
            <p>
              The result is one of <span className="font-mono text-xs">SUCCESS</span>,{" "}
              <span className="font-mono text-xs">FAILED</span>, or{" "}
              <span className="font-mono text-xs">PENDING</span>. A pending
              transaction was accepted but not yet included in a ledger — use{" "}
              <span className="font-mono text-xs">Check status</span> to poll
              again. The transaction hash is shown so you can inspect it on a
              block explorer.
            </p>
          </Step>
        </ol>
      </section>

      <section id="funding" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          02 / Testnet funding (Friendbot)
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Testnet accounts hold test XLM and can be created for free. If your
          connected wallet&apos;s account does not yet exist on Testnet, the
          builder detects it during simulation and shows a{" "}
          <span className="font-mono text-xs">Fund with Friendbot</span> action.
        </p>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Friendbot is a Stellar testnet faucet: the builder POSTs your address
          to <span className="font-mono text-xs">https://friendbot.stellar.org?addr=G…</span>{" "}
          and the account is created. You can also fund an account directly from
          Freighter. After funding, rebuild the transaction to sign and submit.
        </p>

        <Callout tone="warn">
          Friendbot only works on <strong>Testnet</strong>. Futurenet has no
          faucet in this tool, and mainnet is not supported. The funding action
          is hidden for any non-testnet network.
        </Callout>
      </section>

      <section id="read-only" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          03 / Read-only vs state-changing
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          The simulation reports whether a call is read-only. A call is{" "}
          <strong>read-only</strong> when it requires no authorization entries
          and touches no read-write ledger state — for example querying a
          token&apos;s <span className="font-mono text-xs">balance</span>,{" "}
          <span className="font-mono text-xs">decimals</span>, or{" "}
          <span className="font-mono text-xs">name</span>.
        </p>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          A <strong>state-changing</strong> call (such as{" "}
          <span className="font-mono text-xs">mint</span>,{" "}
          <span className="font-mono text-xs">transfer</span>, or{" "}
          <span className="font-mono text-xs">approve</span>) writes ledger
          state and therefore requires a funded source account, a signature, and
          submission. The preview labels each method as read-only or
          state-changing so you always know what a build will do.
        </p>
      </section>

      <section id="authorization" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          04 / Authorization & admin-only methods
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Each method declares one of three authorization requirements:
        </p>

        <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-6 font-sans text-sm leading-7 text-text-secondary">
          <li>
            <span className="font-mono text-xs text-text-primary">none</span> —
            any wallet can invoke the method.
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">admin</span> —
            the contract administrator (set at deploy time) must authorize it.
            Stellar-Forge does not hold the admin key for the deployed contracts,
            so a visitor signing an admin method with a non-admin wallet will be
            rejected on-chain.
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">first-address</span>{" "}
            — the first address argument must be authorized by the signing
            wallet. If the connected wallet does not own that address, the
            transaction will be rejected on-chain.
          </li>
        </ul>

        <Callout tone="warn">
          Authorization is enforced by the contract at execution time, not by
          the builder UI. The builder surfaces the requirement and warns you
          before signing, but it cannot override the contract. If a submission
          fails with an authorization error, the signing wallet was not the
          account the contract required.
        </Callout>
      </section>

      <section id="xdr" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          05 / XDR & the transaction envelope
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          A Stellar transaction is serialized as an{" "}
          <strong>envelope</strong> in base64 XDR. After simulation, the preview
          shows the assembled envelope — this is the exact transaction that will
          be signed and submitted. Freighter signing produces a{" "}
          <span className="font-mono text-xs">signedXdr</span>; the submission
          route parses and verifies that string before relaying it.
        </p>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          The submission route rejects fee-bump envelopes and requires a valid
          signature from the transaction&apos;s source account, so a tampered or
          unsigned envelope is never sent to the network.
        </p>
      </section>

      <section id="fees" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          06 / Fees
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          The network fee has two parts: the base fee (100 stroops) and the
          resource fee reported by simulation (
          <span className="font-mono text-xs">minResourceFee</span>), which
          covers CPU and memory consumed by the contract. The assembled envelope
          includes the combined fee, and the source account pays it on
          submission. On Testnet these amounts are negligible.
        </p>
      </section>

      <section id="expiration" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          07 / Expiration & retry
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          A prepared envelope carries a short time bound — roughly 30 seconds
          from simulation. If it lapses before you sign or submit, the builder
          re-simulates automatically and asks you to sign again. The submission
          route also refuses envelopes with no upper time bound or an expiry
          more than 24 hours in the future.
        </p>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Re-submitting the same signed transaction is safe: the network
          de-duplicates by transaction hash. If the network is busy and returns{" "}
          <span className="font-mono text-xs">TRY_AGAIN_LATER</span>, the tool
          polls for settlement, and a still-pending result can be re-checked
          with <span className="font-mono text-xs">Check status</span>.
        </p>
      </section>

      <section id="failures" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          08 / Common failures
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Most errors map to a clear cause:
        </p>

        <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-6 font-sans text-sm leading-7 text-text-secondary">
          <li>
            <span className="font-mono text-xs text-text-primary">Contract deployment required</span>{" "}
            — no contract address is registered for that network + component
            (for example, Futurenet, or a component that is not yet deployed).
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">Parameter errors</span>{" "}
            — a required field is empty, an integer is out of the i128/u32 range,
            or an address does not start with G/M.
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">Source account missing / unfunded</span>{" "}
            — connect Freighter (it becomes the locked source account) and fund
            it with Friendbot before signing state-changing calls.
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">Simulation failed</span>{" "}
            — the contract rejected the call (commonly an authorization or
            argument problem), or the call requires restoring expired contract
            state (not supported by the builder yet).
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">Envelope expired / unsigned / invalid</span>{" "}
            — re-build to refresh the envelope, and make sure Freighter actually
            signed it.
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">Submit rejected</span>{" "}
            — the network returned an error, most often an on-chain authorization
            failure. The message explains that the signing wallet was not the
            account the contract required.
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">RPC unavailable</span>{" "}
            — the builder could not reach the network RPC; retry or check the
            selected network.
          </li>
        </ul>
      </section>

      <section id="supported" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          09 / Which components support Testnet today
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          The Transaction Builder only lists components that are deployed to a
          public network. Today that is{" "}
          <Link href="/docs/components/token" className="font-mono text-xs text-accent-stellar hover:underline">
            Token
          </Link>{" "}
          and{" "}
          <Link href="/docs/components/payment" className="font-mono text-xs text-accent-stellar hover:underline">
            Payment
          </Link>{" "}
          on <strong>Stellar Testnet</strong>. All eight catalog components are
          implemented and run in the local sandbox; the other six (Access
          Control, Escrow, Multi-signature, Subscription, Vesting, Staking) are
          not yet deployed to a public network, so they are not selectable in
          the builder until a deployment address is registered.
        </p>

        <Callout>
          Futurenet is selectable in the network dropdown, but Stellar-Forge
          currently registers no Futurenet deployments — preparing a transaction
          there reports that no contract is deployed yet.
        </Callout>
      </section>

      <section id="sandbox-vs-testnet" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          10 / Playground sandbox vs real Testnet
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          The two execution paths are intentionally different:
        </p>

        <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-6 font-sans text-sm leading-7 text-text-secondary">
          <li>
            <span className="font-mono text-xs text-text-primary">Local sandbox (Playground)</span>{" "}
            runs the real contract WASM in an isolated Soroban environment with
            deterministic mock identities. No network, no wallet, no fees, and
            no persisted state — every run starts fresh. It is the place to
            learn and iterate.
          </li>
          <li>
            <span className="font-mono text-xs text-text-primary">Testnet transaction</span>{" "}
            talks to the real Stellar Testnet RPC. It needs a funded account,
            Freighter signing, and consumes (test) fees, and it mutates real
            ledger state that persists. Results are real, just on test XLM.
          </li>
        </ul>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Use the sandbox to understand a component and the transaction builder
          to take it on-chain.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/playground" variant="secondary">
            Open the Playground →
          </LinkButton>
          <LinkButton href="/transactions" variant="secondary">
            Open the Transaction Builder →
          </LinkButton>
        </div>
      </section>

      <section id="summary" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          11 / The on-chain step of the journey
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Stellar-Forge is built around a developer journey: discover,
          understand, configure, run locally, generate integration code, then go
          on-chain. The Transaction Builder is that final on-chain step — it
          does not replace the sandbox or the catalog, it completes the path
          from idea to a real Testnet transaction.
        </p>

        <p className="mt-6 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          For a hands-on walkthrough, open the builder and try a read-only Token
          call first — it simulates without any funding — then fund your account
          and submit a state-changing call to see the full lifecycle.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/transactions" variant="secondary">
            Start with the Transaction Builder →
          </LinkButton>
          <Link href="/docs" className={textLink}>
            Back to docs hub →
          </Link>
        </div>
      </section>
    </main>
  );
}
