import Link from "next/link";
import { TransactionBuilder } from "@/components/transactions/TransactionBuilder";
import { StateBadge } from "@/components/ui/StateBadge";

const lifecycleSteps = [
  {
    number: "1",
    title: "Build",
    body: "Pick a component and method, fill in the arguments, and choose the account that pays the fee.",
  },
  {
    number: "2",
    title: "Simulate",
    body: "The prepared transaction is run against a live Soroban RPC so you can preview the result without changing anything on-chain.",
  },
  {
    number: "3",
    title: "Sign",
    body: "Authorize the transaction with your Freighter wallet. The wallet must be able to authorize the method (see the Authorization note in the preview).",
  },
  {
    number: "4",
    title: "Submit",
    body: "The signed transaction is sent to the network. State-changing transactions update ledger state and consume network resources; read-only calls never write anything.",
  },
];

export default function TransactionsPage() {
  return (
    <main className="flex-1">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-3xl">
          <p className="mb-4 font-mono text-xs tracking-[0.18em] text-accent-stellar">
            STELLAR-FORGE / TRANSACTIONS
          </p>

          <h1 className="font-display text-4xl font-medium leading-tight text-text-primary sm:text-5xl">
            Transaction Builder
          </h1>

          <p className="mt-5 font-sans text-base leading-7 text-text-secondary sm:text-lg">
            Construct a transaction, simulate it against a live Soroban RPC,
            and sign the prepared envelope with your Freighter wallet. Select an
            implemented component, choose a contract method, fill its
            parameters, and build a typed transaction request.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-default border border-tone-onchain/40 bg-tone-onchain/5 p-4">
            <StateBadge tone="testnet">Testnet · on-chain</StateBadge>

            <p className="font-sans text-sm text-text-secondary">
              This builder talks to the real Stellar Testnet RPC. It needs a
              funded account and Freighter signing, and it mutates real ledger
              state. For local, wallet-free experimentation, use the Playground
              sandbox.
            </p>

            <Link
              href="/playground"
              className="font-mono text-xs text-accent-stellar hover:underline"
            >
              Open the Playground →
            </Link>
          </div>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {lifecycleSteps.map((step) => (
            <li
              key={step.number}
              className="flex flex-col gap-2 rounded-default border border-border bg-surface p-4"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-stellar/15 font-mono text-sm text-accent-stellar">
                {step.number}
              </span>
              <h2 className="font-sans text-sm font-medium text-text-primary">
                {step.title}
              </h2>
              <p className="font-sans text-xs leading-relaxed text-text-secondary">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <TransactionBuilder />
      </section>
    </main>
  );
}