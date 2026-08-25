# Stellar-Forge Roadmap

This roadmap is the long-term development plan for Stellar-Forge. It is
organized around meaningful capabilities and milestones, not a sequence of tiny
phases. Items are direction, not promises; see [Roadmap Rules](#roadmap-rules).

All "completed" claims below are verified against the repository at the time of
writing. Proposed/future items describe intent and must be confirmed against the
repository before being marked done.

## Current State

Stellar-Forge is at **release-candidate** maturity. It is Testnet-focused; there
is no mainnet support. Four components are implemented: `token` (deployed to
Testnet), `payment` (deployed to Testnet via the generic dependency mechanism),
`escrow` (sandbox-ready; not yet deployed to Testnet), and `access-control`
(sandbox-ready; not yet deployed to Testnet, and the first to exercise a
`Symbol`-typed argument and the `admin` authorization model through the generic
pipeline). `escrow` is the first *stateful, constructor-driven,
dependency-composing, multi-role* component and was added to validate that the
platform is generic. The other two catalog entries are concepts/documentation
only.

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

**Testnet readiness (v1)** — the generic transaction machinery already supports
Payment end-to-end: once a real `payment` deployment address is registered in
`src/lib/transactions/deployments.ts` and `capabilities.testnet` is set to
`true`, the existing builder / validate / prepare / submit flow discovers
`pay` automatically with no component-specific branching. The plumbing is in
place (a `deploy-testnet` Makefile target, a `payment.wasm` prebuilt artifact,
and a registry comment documenting the registration step). The actual Testnet
deployment is a **manual, credentialed step** (Stellar CLI + a funded
`deployer` identity) that has **not** been performed in this environment, so
`testnet` remains `false` and Payment is correctly excluded from Testnet
transactions until the address exists. On Testnet the `asset` argument is
supplied by the caller and should reuse the existing deployed `token` contract.
See [Subsequent Milestones](#production-readiness).

### Component Ecosystem

Potential future components (currently **concepts** unless/until implemented):

- **Escrow** — *implemented (v1)*: stateful, constructor-driven, dependency-
  composing, multi-role; sandbox-ready, not Testnet-deployed. Added to validate
  the platform is generic (see Completed above).
- **Access Control** — *implemented (v1)*: role-based authorization with a
  single admin and `(role, account)` grants; sandbox-ready, not Testnet-deployed.
  Added to validate that the `Symbol` argument type and `admin` authorization
  model are generic (see Completed above).
- **Subscription**
- **Multi-signature**

Treat these as planned work. Each should follow the same Component Standard
pipeline rather than bespoke wiring.

### Developer Integration

- Stronger integration generation (more languages, more accurate generated
  code).
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
- Testnet deployment of additional components (e.g. `payment`) beyond `token`.
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
