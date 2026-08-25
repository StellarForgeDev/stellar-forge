# Stellar-Forge Roadmap

This roadmap is the long-term development plan for Stellar-Forge. It is
organized around meaningful capabilities and milestones, not a sequence of tiny
phases. Items are direction, not promises; see [Roadmap Rules](#roadmap-rules).

All "completed" claims below are verified against the repository at the time of
writing. Proposed/future items describe intent and must be confirmed against the
repository before being marked done.

## Current State

Stellar-Forge is at **release-candidate** maturity. It is Testnet-focused; there
is no mainnet support. One component (`token`) is fully implemented and deployed
to Testnet; the other five catalog entries are concepts/documentation only.

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
- **Vercel build architecture** — `vercel-build` script, Linux runner build
  (`scripts/vercel-sandbox-build.sh`), `outputFileTracingIncludes` in
  `next.config.ts`, committed prebuilt WASM. (End-to-end deployment is
  configured but **not independently verified**.)

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

Use **Payment** as the first major test of the Component Standard. Payment is
currently a **concept** (no contract). A future Payment implementation should
ideally move through:

```text
Contract
  → Tests
  → WASM
  → Metadata
  → Catalog
  → Documentation
  → Playground
  → Integration
  → Testnet
```

This exercises every layer established by the Component Standard. **Payment is
not currently implemented** and is not claimed as such.

### Component Ecosystem

Potential future components (all currently **concepts** unless/until
implemented):

- **Escrow**
- **Access Control**
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
- Long-term maintenance ownership.

## Roadmap Rules

- Roadmap items can change; priorities shift as the project learns.
- Architecture decisions (in `ARCHITECTURE.md`) take precedence over stale
  assumptions in this file or elsewhere.
- Completed work must be **verified against the repository** before being marked
  done; do not mark items complete based on intent.
- New work must map to a roadmap capability or milestone; speculative features
  should not displace core reliability work without justification.
- Proposed/future capabilities (Payment, SDK, mainnet, etc.) are not present
  until the repository proves them.
