# Stellar-Forge Roadmap

This roadmap is the long-term development plan for Stellar-Forge. It is
organized around meaningful capabilities and milestones, not a sequence of tiny
phases. Items are direction, not promises; see [Roadmap Rules](#roadmap-rules).

All "completed" claims below are verified against the repository at the time of
writing. Proposed/future items describe intent and must be confirmed against the
repository before being marked done.

## Current State

> **Status note (Phase 5, 2026-08-30):** Phase 5 is **COMPLETE**. The catalog now has **15 reusable Soroban components**, all with passing Rust tests and local sandbox execution; all 15 are deployed to Stellar Testnet and registered in `src/lib/transactions/deployments.ts` with `testnet:true`. The transaction and integration pipelines are network-aware (`testnet` | `mainnet` | `futurenet`) via centralized `NetworkConfig` (`src/lib/transactions/networks.ts`): **Testnet is operational** (default, 15 deployments), **Mainnet is architecture-aware but unavailable** (0 deployments, all `mainnet:false`), **Futurenet** plumbing is retained (0 deployments). The generic pipeline (catalog → docs → sandbox → transactions) remains validated without component-specific branching.

Stellar-Forge is at **release-candidate** maturity. The network model is centralized (`NetworkConfig` with `rpcUrl`, `passphrase`, `explorerUrl` and `STELLAR_RPC_*_URL` overrides). All 15 components are implemented and sandbox-executable and **all 15 are deployed to Stellar Testnet** (`testnet:true`); Mainnet and Futurenet have no deployments by design. The generic pipeline was validated across every component without component-specific branching.

### Completed (verified)

- **Foundation** — Next.js 16 App Router, React 19, TypeScript strict, Tailwind
  4, foundational UI primitives, design system, landing page.
- **Catalog** — searchable/filterable component catalog (`src/data/components.ts`)
  with detail pages (`src/app/components/[slug]`), categories, and status.
- **Documentation** — documentation hub (`src/app/docs`) covering getting
  started, component library, Playground, and Integration, plus per-component
  docs (`src/app/docs/components/[slug]`).
- **Playground** — interactive Playground (`src/app/playground`) driven by
  component `config`; for implemented components it runs the real contract WASM
  in the local sandbox.
- **Sandbox** — native `sandbox-runner` that executes contract WASM in an
  isolated Soroban host, deterministic, no network/wallet/gas
  (`contracts/contracts/sandbox-runner`, `src/app/api/playground`).
- **Transactions** — builder, real Testnet RPC simulation, Freighter signing,
  Testnet submission with signature verification and settlement polling
  (`src/lib/transactions`, `src/app/api/transactions/*`, `src/lib/wallet`).
- **Wallet integration** — Freighter adapter (`src/lib/wallet/freighter.ts`).
- **Friendbot** — client-side Testnet funding action
  (`src/components/transactions/TransactionBuilder.tsx`).
- **Integration generator** — Rust example generator from a component interface
  (`src/lib/integration/generators.ts`).
- **Token implementation/deployment** — SEP-41 token contract with passing Rust
  tests, deployed to Stellar Testnet; address registered in
  `src/lib/transactions/deployments.ts`.
- **Payment implementation (v1)** — stateless `payment` contract
  (`pay(from, to, asset, amount)`) with passing Rust tests, a catalog record
  that declares a generic `asset` dependency on `token` (with a `mint` setup
  call), per-component docs, Playground sandbox execution through the generic
  dependency mechanism, and integration generation. Testnet deployment is
  complete (registered in `deployments.ts`, `testnet: true`). No component-specific branching was added; the
  dependency engine is data-driven.
- **Vercel build architecture** — `vercel-build` script, Linux runner build
  (`scripts/vercel-sandbox-build.sh`), `outputFileTracingIncludes` in
  `next.config.ts`, committed prebuilt WASM. (End-to-end deployment is
  configured but **not independently verified**.)
- **Escrow implementation (v1)** — stateful `escrow` contract
  (`__constructor(depositor, beneficiary, arbiter, asset)`, `deposit`,
  `release`, `refund`, `status`) with passing Rust tests and a cross-contract
  sandbox execution proof (`escrow_executes_against_provisioned_dependency` in
  the sandbox-runner). Catalog record declares `constructorArgs` (role identity
  names + an `asset` dependency alias) and a generic `asset` token dependency
  with a `mint` setup call. Per-component docs, Playground sandbox execution
  through the generic dependency mechanism, and integration generation. No
  component-specific branching was added; only two small generic platform
  enhancements were required (`constructorArgs` catalog field and
  `constructorArg` dependency-alias resolution). Testnet deployment is **not**
  done (`testnet: false`); the generic transaction machinery will support it once
  a deployment address is registered in `deployments.ts`.

## Phase 5 — Completed

> **Phase 5 is COMPLETE.** All items below are verified against the repository (`main == origin/main`, working tree clean).

- **Phase 5.1 — Repo hygiene & contribution foundation** — `CONTRIBUTING.md`, `LICENSE`, `.env.example`, hygiene checks.
- **Phase 5.2 — Vercel deployment/runtime/serverless sandbox verification** — `vercel-sandbox-build.sh` hardened to build from `contracts/` workspace, `outputFileTracingIncludes`, prebuilt WASM.
- **Phase 5.3 — Testnet expansion for existing components** — catalog expanded to 15 reusable components (`token`, `payment`, `access-control`, `escrow`, `multi-signature`, `subscription`, `vesting`, `staking`, `atomic-swap`, `timelock`, `merkle-airdrop`, `oracle`, `crowdfund`, `allowance`, `claimable-balance`) with generic pipeline validation and 15 Testnet deployments registered.

  **Phase 5.3B — Authorization-stable sequence** — `5.3B.18` TTL fixed but `auth/invalid_action` discovered (ledger-dependent `expiration_ledger` recomputed in contract caused simulation/execution mismatch); `5.3B.19` implemented caller-supplied stable `expiration_ledger` validated as `current < expiration ≤ current+1_000_000` for `crowdfund`, `allowance`, `claimable-balance` (+ tests + WASM 23227/10820/19465); `5.3B.20` real Testnet lifecycle validation succeeded (10 workflows: crowdfund contribute/withdraw/claim_refund, allowance approve/increase/decrease/transfer_from, claimable deposit/claim/cancel) with `latest+1000` strategy; `5.3B.21` replaced obsolete crowdfund deployment and enabled `allowance`/`claimable-balance` `testnet:true`; `5.3B.22` committed and pushed as `6b21f8e fix: stabilize token approval authorization on testnet` with working tree clean.

- **Phase 5.4 — Configurable network support** — centralized `NetworkConfig` (`testnet` | `mainnet` | `futurenet`) with `rpcUrl`, `passphrase`, `explorerUrl` and `STELLAR_RPC_*_URL` overrides in `src/lib/transactions/networks.ts`; generic `getDeployment(network, slug)`, builder, validation, RPC selection, and integration generators are network-aware; `Testnet` operational (15 deployments, default), `Mainnet` architecture-aware but unavailable (0 deployments, all `mainnet:false`, correctly gated), `Futurenet` plumbing retained; committed as `f10764a feat: add configurable network support`.

- **Phase 5.5 — Integration generator strengthening** — TypeScript generators now include `pnpm add @stellar/stellar-sdk`, `STELLAR_RPC_*_URL` override guidance derived from `NetworkConfig`, and `explorerUrl` link; Rust generators include `soroban-sdk = "27"` guidance and local-host clarification; committed as `247decb feat: strengthen integration generators`. No new language, SDK package, or publishing system introduced.

**Current network state:** `Testnet = operational (15 deployments)` / `Mainnet = architecture-aware but unavailable (0 deployments, all mainnet:false)` / `Futurenet = plumbing retained (0 deployments)`. No Mainnet deployment was performed.

## Current Priority

### Component Standard — Completed (v1)

> **Component Standard v1 is complete.** It introduced the `capabilities`
> model (`implemented`, `sandbox`, `testnet`) in `src/data/components.ts`, made
> `token` the first conforming component, and moved platform code (catalog, docs,
> Playground sandbox, transaction builder) to check the specific capability it
> needs instead of a single coarse status. See `ARCHITECTURE.md`.

The immediate priority was to establish the architecture that makes components
**first-class entities** rather than mere catalog entries. This milestone
connects contract, metadata, docs, playground, integration, and deployment into a
coherent pipeline (see `ARCHITECTURE.md`).

Scope of the milestone:

- Define the **component model** (what a component is, what it must declare).
- Define the **component lifecycle** (Concept → Specified → Implemented →
  Sandbox-ready → Testnet-ready → Integration-ready → Community-ready).
- Define the **maturity/status model** that supersedes today's binary
  `Concept`/`Implemented`.
- Separate **generic** component logic from **Token-specific** logic so future
  components reuse the same machinery.
- Clarify the relationship between contract, metadata, docs, playground,
  integration, and deployment.
- Produce/refine the architecture documentation (this roadmap and
  `ARCHITECTURE.md`).

This milestone is primarily **architecture and conventions**; it should not
require rewriting the existing `token` flow. Do not implement Payment or other
components as part of this milestone unless separately instructed.

## Subsequent Milestones

### Engineering Foundation

- **Automated testing** — a web/app test runner and test suite (none exists
  today beyond Rust contract unit tests).
- **CI** — continuous integration running lint, typecheck, build, and tests on
  every change.
- **Contract test strategy** — standardize and document `cargo test` for every
  contract.
- **Web test strategy** — unit/component tests for domain logic and UI.
- **Build verification** — confirm `pnpm build` and the Vercel path reliably.
- **Contribution infrastructure** — issue/PR templates, `.env.example`,
  security headers, contribution guide.
- **Security baseline** — rate limiting on public routes, headers, and a
  documented threat model.

### Payment

Use **Payment** as the first major test of the Component Standard. Payment
exercised every layer established by the standard:

```text
Contract
  → Tests
  → WASM
  → Metadata
  → Catalog
  → Documentation
  → Playground
  → Integration
```

It was implemented as a **stateless** payment primitive that delegates balance
movement to a SEP-41 asset declared as a generic `asset` dependency on `token`
(with a `mint` setup call). The sandbox-runner provisions that dependency
generically, so no Payment-specific code was added to the runner, route, or
UI.

**Testnet readiness (v1)** — Payment is implemented, sandbox-executable, and
registered for Testnet use. The generic builder / validate / prepare / submit
flow discovers it from the catalog and deployment registry without
component-specific branching. On Testnet the `asset` argument is supplied by
the caller and can reuse the deployed `token` contract.

### Component Ecosystem

All 15 catalog components are implemented, sandbox-executable, and registered
for Testnet use. Their current capability and deployment state is maintained in
`src/data/components.ts` and `src/lib/transactions/deployments.ts`.

- **Escrow**, **Access Control**, **Subscription**, **Multi-signature**,
  **Vesting**, and **Staking** are implemented v1 components with local sandbox
  execution and Testnet registrations, following the same generic Component
  Standard pipeline as Token and Payment.

### Developer Integration

- Stronger integration generation (more languages, more accurate generated
  code). TypeScript generation was added in Phase 21; Rust remains the default
  and is behaviorally unchanged.
- Reusable client libraries.
- **SDK/package extraction** — only if justified by reuse needs (no SDK exists
  today).
- Project scaffolding from a component.
- Improved developer workflows between the Playground and a real project.

Do **not** claim an SDK currently exists.

### Community

- Contribution workflows and guidelines.
- Issue templates and PR templates.
- Component contribution guidelines (how to add a component that meets the
  standard).
- Community feedback loops.
- A documented release process.

### Production Readiness

Eventually consider, but do not promise dates for:

- Security review.
- Stable versioning and compatibility guarantees.
- Mainnet strategy (currently unsupported).
- Production deployment beyond Testnet.
- Testnet deployment of additional components (e.g. `escrow`, `access-control`,
  `subscription`, `multi-signature`, `vesting`, `staking`) beyond the
  current Testnet deployment set.
- Long-term maintenance ownership.

## Roadmap Rules

- Roadmap items can change; priorities shift as the project learns.
- Architecture decisions (in `ARCHITECTURE.md`) take precedence over stale
  assumptions in this file or elsewhere.
- Completed work must be **verified against the repository** before being marked
  done; do not mark items complete based on intent.
- New work must map to a roadmap capability or milestone; speculative features
  should not displace core reliability work without justification.
- Proposed/future capabilities are not present until the repository proves them.
  Payment is implemented for the sandbox and deployed to Testnet (`testnet: true`); an SDK and mainnet
  are not present.
