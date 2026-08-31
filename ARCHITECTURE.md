# Stellar-Forge Architecture

This document describes how Stellar-Forge is currently structured and how the
architecture is intended to evolve. It is the source of truth for architectural
decisions; where a section describes a future direction rather than something
already built, it is explicitly labeled **Proposed**.

Everything in the *Current implementation* sections is verified against the
repository at the time of writing. Do not treat proposed architecture as if it
already exists.

> **Status note (Phase 5, 2026-08-30):** All **15** catalog components are now implemented and sandbox-executable and **all 15 are deployed to Stellar Testnet** (`token`, `payment`, `access-control`, `escrow`, `multi-signature`, `subscription`, `vesting`, `staking`, `atomic-swap`, `timelock`, `merkle-airdrop`, `oracle`, `crowdfund`, `allowance`, `claimable-balance`). The transaction and integration pipelines are now **network-aware** via centralized `NetworkConfig` (`testnet` | `mainnet` | `futurenet`): `Testnet` is operational (default, 15 deployments), `Mainnet` is architecture-aware but unavailable (0 deployments, all `mainnet:false`), `Futurenet` plumbing is retained. The authorization-stable `expiration_ledger` fix for `crowdfund`/`allowance`/`claimable-balance` is validated on Testnet.

> **Status note (Stage 2B, 2026-08-28):** the product surface (global nav,
> homepage, catalog, Playground, detail/docs, transactions) was made cohesive and
> hardened for responsive + accessibility in Stage 2B. This changed no
> architectural boundaries, contracts, catalog data, or transaction/integration
> logic; the architecture remains catalog-driven with no component-specific
> branching.

## Overview

Stellar-Forge is a developer platform for discovering, understanding, testing,
integrating, and eventually deploying reusable Stellar/Soroban building blocks.

The north-star developer workflow is:

```text
Discover
  ↓
Understand
  ↓
Configure
  ↓
Experiment
  ↓
Validate
  ↓
Integrate
  ↓
Deploy
  ↓
Use
```

The Playground is **one part** of this journey, not the entire product. The
current repository already implements a meaningful subset of this workflow:
discovery (catalog), understanding (documentation), configuration (component
config), experiment (local sandbox), validate (real Testnet simulation +
signing + submission), and a first step toward integrate (generated Rust
example).

## Current System Architecture

Stellar-Forge is a single Next.js application with an embedded Rust/Soroban
workspace. There is no separate backend service, microservice fleet, or
database. All state is either static (catalog data, contract artifacts) or
ephemeral (in-memory request handling).

### Web application

- **Next.js 16.3.0** with the **App Router** (`src/app`).
- **React 19.2.8** and **TypeScript 5** (strict).
- **Tailwind CSS 4** for styling, with a small set of foundational primitives
  in `src/components/ui/` (`Button`, `Card`).
- The app is served as a standard Next.js app; there is no custom server.

### Catalog data

`src/data/components.ts` is the catalog source of truth. It exports
`stellarComponents`, an array of `StellarComponent` records. Each record carries
structured metadata (see [Component Model](#component-model)): identity,
description, category, status, documentation prose, an optional `interface`
(function signatures), an optional `implementation` (contract build metadata),
and a `config` (form fields).

### Application / domain logic

`src/lib/` holds the domain logic, separated from UI:

- `src/lib/transactions/` — building, preparing, simulating, and submitting
  Stellar transactions against Testnet/Futurenet RPC.
- `src/lib/playground/` — resolution of the native sandbox-runner and contract
  WASM, plus client-side orchestration.
- `src/lib/integration/` — the integration code generator.
- `src/lib/wallet/` — the Freighter wallet adapter.
- `src/lib/docs/` — documentation content/snippets.

### Soroban contracts

`contracts/` is a Cargo workspace (`contracts/Cargo.toml`) with members under
`contracts/contracts/`:

- `token/` — an **implemented** component: a standard SEP-41 fungible
  token (`soroban_sdk::token::TokenInterface`). Ships with a Rust unit test
  suite (`contracts/contracts/token/src/test.rs`).
- `payment/` — the second **implemented** component: a stateless payment
  primitive (`pay(from, to, asset, amount)`) that delegates the balance
  movement to a SEP-41 asset contract. Ships with a Rust unit test suite
  (`contracts/contracts/payment/src/test.rs`).
- `escrow/` — the third **implemented** component: a stateful holding contract
  (`__constructor(depositor, beneficiary, arbiter, asset)`, `deposit`,
  `release`, `refund`, `status`) that locks a SEP-41 asset and releases or
  refunds it via an arbiter. Ships with a Rust unit test suite
  (`contracts/contracts/escrow/src/test.rs`).
- `access-control/` — the fourth **implemented** component: a role-based
  authorization contract (`__constructor(admin)`, `grant_role`, `revoke_role`,
  `has_role`, `transfer_admin`) with a single admin and `(role, account)` grants.
  Ships with a Rust unit test suite
  (`contracts/contracts/access-control/src/test.rs`).
- `subscription/` — an **implemented** component: recurring subscription /
  billing logic (implemented, Testnet-deployed).
- `vesting/` — an **implemented** component: token vesting / unlock schedules
  (implemented, Testnet-deployed).
- `staking/` — an **implemented** component: staking and rewards
  (implemented, Testnet-deployed).
- `multi-signature/` — an **implemented** component: threshold multisig
  approvals (implemented, Testnet-deployed).
- `atomic-swap/` — an **implemented** component: atomic two-party swap (implemented, Testnet-deployed).
- `timelock/` — an **implemented** component: simple timelock (implemented, Testnet-deployed).
- `merkle-airdrop/` — an **implemented** component: Merkle distributor (implemented, Testnet-deployed).
- `oracle/` — an **implemented** component: signed price feed (implemented, Testnet-deployed).
- `crowdfund/` — an **implemented** component: fixed-deadline crowdfund with authorization-stable `expiration_ledger` (implemented, Testnet-deployed).
- `allowance/` — an **implemented** component: delegated allowance with stable `expiration_ledger` (implemented, Testnet-deployed).
- `claimable-balance/` — an **implemented** component: time-locked claimable balance with stable `expiration_ledger` (implemented, Testnet-deployed).
- `sandbox-runner/` — a **native** (non-contract) Rust binary that loads a
  contract WASM into an in-process Soroban `Env`, deploys it, and invokes the
  requested functions. It is the execution engine behind the Playground.
- `test-asset/` — a minimal SEP-41 token used only as a test/sandbox fixture
  for `payment` (listed in `scripts/sandbox-build.mjs` as a non-contract
  package, so it is not built into a published WASM artifact).
- `greeter/` — a small example contract used as a sandbox-runner test fixture
  (listed in `scripts/sandbox-build.mjs` as a non-contract package, so it is
  not built into a published WASM artifact).

### Sandbox runner

The sandbox-runner is a standalone Rust executable (`sandbox-runner`). At
runtime the Playground API route spawns it via `execFile`, pipes a JSON request
over stdin, and parses the JSON response from stdout. It compiles the contract
in an isolated Soroban host, mocks constructor auth (like the SDK's own
`register` testutils), then enforces auth for each subsequent call via
`mock_auths`. Results are JSON-serialized ScVal values.

### Local WASM execution

For implemented components, the Playground executes the **real** contract WASM
locally in the sandbox-runner. No network, wallet, or gas is involved. The
deployed contract address is deterministic (fixed salt `[0u8; 32]` plus the
`deployer` identity), so executions are reproducible.

### Transaction preparation

`src/app/api/transactions/prepare/route.ts` accepts a structured request
(network, component, method, source account, parameters). It validates the
request, looks up the deployed contract address from
`src/lib/transactions/deployments.ts`, converts parameters to `ScVal`s, then
calls `simulateSorobanInvocation` in `src/lib/transactions/rpc.ts`, which
performs a real **Testnet (or Futurenet) RPC simulation** via
`@stellar/stellar-sdk/rpc`. The simulation returns resource costs, return value,
and whether the call is read-only or state-changing.

### Freighter signing

`src/lib/wallet/freighter.ts` is a `WalletAdapter` that loads `@stellar/freighter-api`
dynamically in the browser, connects, reads the account and network, and signs
the assembled transaction XDR. It also subscribes to wallet changes.

### Testnet submission

`src/app/api/transactions/submit/route.ts` accepts only `{ network, signedXdr }`.
It rejects any payload containing secret-key field names, parses and validates
the base64 XDR, **requires a valid source-account signature** before relaying,
caps envelope expiry at 24 hours, then sends the transaction to the network RPC
and polls for settlement.

### Friendbot

Friendbot funding is a client-side action in
`src/components/transactions/TransactionBuilder.tsx`. When a source account is
not funded, the UI offers a "Fund with Friendbot" action that POSTs to
`https://friendbot.stellar.org?addr=<source>`. This is Testnet-only.

### Integration code generation

`src/lib/integration/generators.ts` produces a Rust example from a component's
interface and the current configuration. It is a **generated example**, not a
formal SDK or published package. The generated snippet deploys the contract WASM
in an isolated Soroban host and drives the public interface — explicitly framed
as a starting point, not a complete SDK.

### Deployment / Vercel architecture

Stellar-Forge is configured for deployment on Vercel but the end-to-end path has
**not been independently verified** in this repository. The committed
configuration is:

- `package.json` `vercel-build` runs `scripts/vercel-sandbox-build.sh` then
  `next build`.
- `scripts/vercel-sandbox-build.sh` installs the Rust toolchain if needed and
  compiles `sandbox-runner` for **Linux** (release). Contract WASM is
  platform-independent and ships prebuilt in `contracts/prebuilt/`.
- `next.config.ts` sets `outputFileTracingIncludes` for `/api/playground` so the
  serverless bundle contains the WASM artifacts and the runner binary.
- At runtime, `src/lib/playground/artifacts.ts` resolves the runner from local
  build directories (platform-aware) and the WASM from either the local build
  or the committed prebuilt copy.

This is **not** a statement of production/mainnet readiness.

## Repository Architecture

```text
src/
  app/                  Next.js App Router: pages + API routes
    page.tsx            Landing page
    components/         Catalog list + per-component detail pages
    docs/               Documentation hub + per-component docs
    playground/         Interactive Playground page
    transactions/       Transaction builder page
    api/
      playground/       Local sandbox execution route (spawns runner)
      transactions/
        prepare/        Build + Testnet RPC simulation
        submit/         Validation + Testnet submission
  components/           Reusable UI and feature components
    catalog/            Catalog cards/listing
    docs/               Documentation-rendering components
    integration/        Integration code generator UI
    layout/             Navigation/layout
    playground/         Playground + sandbox UI
    transactions/       Transaction builder + preview UI
    ui/                 Foundational primitives (Button, Card)
  data/                 Catalog + metadata (the catalog source of truth)
  lib/
    docs/               Documentation content/snippets
    integration/        Integration code generation
    playground/         Sandbox artifact resolution + execution
    transactions/       Preparation, simulation, signing, submission
    wallet/             Freighter wallet integration

 contracts/              Rust/Soroban workspace
   Cargo.toml            Workspace manifest (members: contracts/*)
   contracts/
      token/              SEP-41 token contract (implemented, Testnet-deployed)
      payment/            Stateless payment primitive (implemented, Testnet-deployed)
       escrow/             Stateful holding contract (implemented)
       access-control/     Role-based authorization contract (implemented)
       subscription/       Recurring subscription contract (implemented)
       vesting/            Token vesting / unlock schedules (implemented)
       staking/            Staking and rewards contract (implemented)
       multi-signature/    Threshold multisig approvals (implemented)
       test-asset/         Minimal SEP-41 fixture for payment tests
      greeter/            Example/sandbox test fixture (not a catalog component)
      sandbox-runner/     Native runner that executes contract WASM
     prebuilt/             15 committed contract WASM artifacts plus metadata.json and checksums.txt

scripts/
  sandbox-build.mjs     Local sandbox-runner + WASM build
  vercel-sandbox-build.sh  Vercel Linux sandbox-runner build

public/                 Static assets
```

The meaningful boundary is **catalog data (`src/data`) ↔ domain logic
(`src/lib`) ↔ presentation (`src/components`) ↔ contracts (`contracts/`)**. The
catalog data is consumed by both the UI and the server-side logic (the API
routes and integration generator read the same `StellarComponent` records).

Within `contracts/`, the workspace separates **contract packages** (`token`,
`payment`, `escrow`, `access-control`) from **native tooling** (`sandbox-runner`) and **fixtures**
(`greeter`, `test-asset`). `token`, `payment`, `escrow`, and `access-control` are published catalog
components with committed WASM; `test-asset` is a fixture only.

## Component Model

In the current implementation, a **component** is a single record of type
`StellarComponent` defined in `src/data/components.ts`. It is not (yet) a
framework-level abstraction; it is a typed data object that the UI, API routes,
and integration generator all read.

The fields that currently exist:

- **Identity** — `slug`, `name`, `description`, `category`, `shortDescription`.
- **Capabilities** — `capabilities: { implemented, sandbox, testnet }`. These
  are orthogonal booleans defined in Component Standard v1 (see
  [Component Lifecycle](#component-lifecycle)). `implemented` means the
  component has a real contract in `contracts/`; `sandbox` means it can execute
  locally via the Soroban sandbox-runner; `testnet` means a contract address is
  registered for it in `src/lib/transactions/deployments.ts`. A `Concept`
  component has all three `false`. The display label (`Concept`/`Implemented`)
  is derived from `implemented` via `componentMaturity()`.
  - **Declared, not dynamically verified.** The capability flags are authored
    metadata, not runtime-checked. Future validation could verify them:
    `implemented` by the presence of a contract package in `contracts/`;
    `sandbox` by a built WASM artifact resolvable via `componentWasmPath`/the
    prebuilt copy; `testnet` by a registered, checksum-valid address in
    `src/lib/transactions/deployments.ts`. The API routes already enforce the
    underlying prerequisites (e.g. the Playground requires `implementation` +
    `interface` at request time), so a mis-declared capability fails safely at
    the boundary rather than silently.
- **Metadata / documentation** — `overview`, `useCases`.
- **Implementation** (optional) — `implementation: { language, package,
  sourcePath, buildTarget }`. Present for `token`, `payment`, `escrow`, and `access-control`.
- **Contract interface** (optional) — `interface: FunctionSpec[]`, where each
  `FunctionSpec` has `name`, `params` (`ParameterSpec[]` with `name`/`type`/
  `placeholder`), optional `returns`, optional `description`, and optional
  `authorization: "none" | "admin" | "first-address"`.
- **Configuration** — `config: ConfigField[]`, where each field has `key`,
  `label`, `type` (`"text" | "number" | "select"`), `default`, optional
  `min`/`max`/`options`/`disabled`/`mono`.
- **Dependencies** (optional) — `dependencies?: ComponentDependency[]`, where each
  `ComponentDependency` has an `alias`, a `package` (another component's
  `implementation.package`), an optional `constructor` (values keyed by the
  dependency's `__constructor` parameter names), and an optional `setup`
  (calls to run after the dependency deploys). A component declares that it
  needs another contract provisioned alongside it — for example, Payment
  declares an `asset` dependency on `token`, with a `mint` setup call. The
  sandbox-runner provisions every dependency **generically** (no
  component-specific branching) and exposes each `alias` as an address
  reference the component's own calls can resolve.
- **Playground relationship** — the Playground reads `config` for form fields
  and, for implemented components, `interface` + `implementation` to drive the
  sandbox and integration generator.
- **Integration relationship** — the integration generator reads `interface` and
  `config` to emit a Rust example. Concept components (no `interface`) yield a
  placeholder rather than generated code.

No deployment, versioning, or ownership fields exist on a component today beyond
the registry in `src/lib/transactions/deployments.ts` (which maps
`{network, componentSlug}` → contract address for any deployed component, e.g.
`token` and — once deployed — `payment`).

### Proposed: first-class component abstraction

> **Proposed architecture — not implemented.** Do not build this yet unless
> separately instructed.

A future component should ideally become a first-class entity so that adding one
connects the following concerns:

```text
Contract
  ↓
Tests
  ↓
WASM
  ↓
Metadata (catalog record)
  ↓
Documentation
  ↓
Sandbox support
  ↓
Integration example
  ↓
Testnet deployment
```

This would mean a component carries, in one place, its source location, build
target, test strategy, catalog metadata, documentation, sandbox configuration,
integration template, and deployment registry entry — so that implementing a
component once makes it flow through every layer without bespoke wiring.

## Component Lifecycle

The catalog's current `status` field is binary (`Concept` vs `Implemented`). As
the project grows, components should move through a richer maturity model.

### Proposed maturity levels

> **Model — Component Standard v1 now encodes the coarse end of this lifecycle
> as orthogonal capabilities.** As of Component Standard v1, each component
> declares `capabilities: { implemented, sandbox, testnet }`. The finer
> lifecycle levels below remain the intended direction for tracking component
> progress; the capabilities capture the three platform-relevant states
> (has a contract, can run locally, is deployed) without conflating them.

```text
Concept
  ↓
Specified
  ↓
Implemented
  ↓
Sandbox-ready
  ↓
Testnet-ready
  ↓
Integration-ready
  ↓
Community-ready
```

Meaning of each level:

- **Concept** — a documented pattern with no contract. (As of Phase 20, all
  eight catalog components are implemented; this level is no longer occupied by
  any current component — Escrow, Access Control, Subscription, Multi-signature,
  Vesting, and Staking are all implemented alongside Token and Payment.)
- **Specified** — the interface, configuration, and expected behavior are
  written down (in the catalog record and docs), even before the contract
  exists.
- **Implemented** — a real contract exists in `contracts/` with a passing test
  suite. (Today `token` is at least this far; it is also further along.)
- **Sandbox-ready** — the WASM is built and the local sandbox-runner can execute
  it, so the Playground can run it without a network.
- **Testnet-ready** — a deployment address is registered and the transaction
  flow can simulate/submit against Testnet.
- **Integration-ready** — a working integration example is generated and the
  component is documented end-to-end for project adoption.
- **Community-ready** — the component has contribution guidelines, stable
  interfaces, and is safe for external reuse.

The `token` component declares `capabilities: { implemented: true, sandbox: true,
testnet: true }`, so it is *Implemented*, *Sandbox-ready*, and *Testnet-ready*
in the terms below; the catalog now distinguishes these via the capability
flags rather than a single status string.

## Component Standard — Direction

> **Component Standard v1 is implemented.** The `capabilities` model in
> `src/data/components.ts` makes "component" a first-class concept. The platform
> (catalog, docs, Playground sandbox, transaction builder) now checks the
> specific capability it needs rather than a single coarse status.

The near-term priority (see `ROADMAP.md`) was to establish the *Component
Standard*: the set of conventions and (eventually) shared types that make a
component first-class. The goal is that implementing a component connects:

```text
Contract
  ↓
Tests
  ↓
WASM
  ↓
Metadata
  ↓
Catalog
  ↓
Documentation
  ↓
Sandbox
  ↓
Integration
  ↓
Testnet deployment
```

Today each of those steps exists in isolation (a contract + tests in `contracts/`,
metadata in `src/data/components.ts`, docs in `src/app/docs`, sandbox via the
runner, integration via the generator, deployment in `deployments.ts`). The
standard would make them a single, coherent pipeline rather than parallel,
hand-maintained pieces. This document deliberately stops short of prescribing the
exact schema or tooling; that is the work of the Component Standard milestone.

## Playground Architecture

### How the Playground works

The Playground page (`src/app/playground/`) lets a user pick a component, edit
its `config` fields, and (for implemented components) define a constructor and a
sequence of contract calls. It has two execution paths:

1. **Local sandbox** (implemented components only) — runs the real contract WASM
   locally.
2. **Transaction flow** — builds, simulates, signs, and submits against Testnet.

### How the API route communicates with the sandbox runner

`src/app/api/playground/route.ts` (`runtime = "nodejs"`):

1. Resolves the runner via `resolveRunner()` (returns `503` if the native binary
   is missing — see `scripts/sandbox-build.mjs` / `vercel-sandbox-build.sh`).
2. Parses and strictly validates the JSON body **server-side**: rejects any
   `wasmPath` from the browser, validates component/method/arguments/types,
   ranges (i128/u32), identity allowlist, call count, string lengths, and
   authorization requirements.
3. Resolves the WASM via `resolveWasm()` (local build first, then prebuilt).
4. Spawns the runner with `execFile` (fixed path, no shell), pipes the request
   JSON over stdin, enforces a 10s timeout + 1MB output cap.
5. Parses the runner's JSON stdout and returns it.

### How WASM is resolved

`src/lib/playground/artifacts.ts` computes candidate WASM paths in order:
the locally built artifact
(`contracts/target/wasm32v1-none/release/<package>.wasm`, via
`componentWasmPath`) first, then the committed prebuilt copy
(`contracts/prebuilt/<package>.wasm`). The prebuilt copy is platform-independent
and is what backs Vercel deployments.

### How the sandbox executes contracts

The runner (`contracts/contracts/sandbox-runner/src/main.rs`) reads the WASM
from disk, creates a default `Env`, builds constructor args from the schema
provided by the API route, uploads the WASM, deploys the contract (constructor
auth mocked), then for each call builds args by type, applies `mock_auths` when a
signer is supplied, and invokes the function. Results are ScVal→JSON.

Before the main contract is deployed, the runner provisions every declared
`dependency` with a unique salt: it deploys the dependency WASM, runs its
constructor from the `constructor` values, executes each `setup` call (under
host-level mock auth), and records the deployed address under its `alias`. The
component's own calls resolve that alias to the dependency address. Every
invocation runs under `mock_all_auths_allowing_non_root_auth`, so nested
cross-contract authorization (e.g. Payment calling the asset's `transfer`) is
satisfied generically — without any component-specific auth wiring in the
runner.

### What is local vs network-based

- **Local**: the sandbox execution of implemented components — no RPC, wallet,
  or gas.
- **Network-based**: the transaction flow (prepare/submit) talks to real Testnet
  (or Futurenet) RPC. The Playground sandbox never touches the network.

### Limitations of the current implementation

- The native runner must be built locally (or by the Vercel build script);
  without it the Playground API returns `503`.
- The deployed contract address in the sandbox is deterministic (fixed salt), so
  all sandbox runs share the same address space.
- Only components with `implementation` + `interface` can run in the sandbox.
  All **15** catalog components now satisfy this and run locally; none are documentation-only.
- Admin-only methods (`mint`, `set_admin`) cannot be exercised by a visitor
  because the deployed token's admin key is held outside the repository; the
  sandbox is the only place a visitor can observe state changes.

## Transaction Architecture

> **Phase 5.4 network model:** `NetworkConfig` (`testnet` | `mainnet` | `futurenet`) centralized in `src/lib/transactions/networks.ts` (`rpcUrl`, `passphrase`, `explorerUrl`, `STELLAR_RPC_*_URL` overrides) is the single source for `getDeployment(network, slug)`, RPC selection, builder, validation, and integration generation. `Testnet` is operational (15 deployments, default), `Mainnet` is architecture-aware but has 0 deployments (all `mainnet:false`, correctly gated as “not deployed”), `Futurenet` plumbing is retained.

The actual current transaction flow:

```text
Builder (UI, network-aware)
  ↓
Preparation (prepare route → selected network RPC simulation)
  ↓
Freighter signing (client)
  ↓
Submission (submit route → selected network)
  ↓
Network result (poll for settlement)
```

1. **Builder** — `src/components/transactions/TransactionBuilder.tsx` collects
   network, component, method, source account, and parameters.
2. **Preparation** — `POST /api/transactions/prepare` validates the request,
   looks up the deployment address, converts parameters to `ScVal`
   (`src/lib/transactions/args.ts`), and calls `simulateSorobanInvocation`
   (`src/lib/transactions/rpc.ts`), which performs a real RPC `simulateTransaction`.
   It returns resource cost, return value, and read-only/state-changing flag.
   The envelope is assembled (`assembleTransaction`) but **not** submitted yet.
3. **Signing** — Freighter signs the assembled XDR client-side
   (`src/lib/wallet/freighter.ts`).
4. **Submission** — `POST /api/transactions/submit` accepts only
   `{ network, signedXdr }`. It rejects secret-key fields, validates base64
   XDR, **verifies a valid source-account signature**, caps envelope expiry at
   24h, sends to the network, and polls for settlement (`sendTransaction` +
   `getTransaction`).
5. **Friendbot** — when the source account is unfunded, the UI offers Friendbot
   funding (`https://friendbot.stellar.org?addr=...`) before preparation.

Real Testnet behavior (simulation + submission) is clearly distinct from the
local sandbox: the transaction flow mutates real ledger state and consumes fees;
the sandbox does not.

## Integration Architecture

`src/lib/integration/generators.ts` produces a language-specific example from a
component's `interface` and the current `config` values, routed by
`generateIntegrationCode({ component, configValues }, language)`. The Rust
generator (`generateRustIntegration`) and the TypeScript generator
(`generateTypescriptIntegration`) both follow the same data-driven pattern:
SDK imports, a deploy step (the Rust generator uploads the contract WASM and
runs the constructor; the TypeScript generator points to the Stellar CLI for
deployment), and callable examples for every function. Both honor
`dependencies`, `constructorArgs`, and per-function `authorization`.

Its role is to take a developer from **experimentation** to **project
integration**: it is a copy-paste starting point, explicitly commented as "not a
complete SDK" and "verify before shipping." There is **no** published SDK,
package, or client library today. Concept components (no `interface`) render a
placeholder instead of generated code. The supported languages are `rust` and
`typescript` (`IntegrationLanguage = "rust" | "typescript"`).

## Deployment Architecture

> **Status note (Phase 5.2, 2026-08-30):** the `vercel-sandbox-build.sh` script was
> corrected to build from the `contracts/` Cargo workspace (it previously `cd`'d to
> the repo root, where no `Cargo.toml` exists, which would have failed the Vercel
> build). The local runtime path — API route → `sandbox-runner` → prebuilt WASM →
> structured JSON — is verified. An actual Vercel deployment has **not** been
> reached in this environment (no credentialed access), so the cloud path remains
> unverified; the primary residual cloud risk is whether Next.js output tracing
> preserves the runner's executable bit (the build script now `chmod +x`s it as a
> guard).

Current arrangement (committed, **not verified end-to-end**):

- Vercel invokes `vercel-build` (`scripts/vercel-sandbox-build.sh` then
  `next build`).
- `vercel-sandbox-build.sh` builds the Linux `sandbox-runner` release binary.
- Contract WASM ships prebuilt in `contracts/prebuilt/`.
- `next.config.ts` `outputFileTracingIncludes` ensures `/api/playground`'s
  bundle contains the WASM and runner.
- `STELLAR_RPC_TESTNET_URL` / `STELLAR_RPC_FUTURENET_URL` are optional env
  overrides with built-in defaults.

No production/mainnet deployment, no multi-region, no database, and no
server-side persistence exist. This setup is **not** a statement of production
readiness.

## Repository Boundary Strategy

Stellar Forge follows this repository evolution strategy:

```text
PHASE A — NOW
One repository
Strong internal boundaries
Minimal coupling
Clear ownership

        ↓

PHASE B — GROWTH
Packages/modules become mature
Public APIs stabilize
Independent release needs emerge

        ↓

PHASE C — EXTRACTION
Move mature modules into independent repositories/packages

        ↓

PHASE D — ECOSYSTEM
Multiple repositories
Published packages
Independent contributors
Separate CI/CD
```

### Phase A — Current monorepo

The project intentionally remains a unified repository while its modules,
interfaces, and workflows are still evolving. The monorepo is the current
development boundary, not a permanent architectural limitation. It keeps
iteration fast and makes the relationships between catalog data, contracts,
artifacts, sandbox execution, and the web application auditable.

### Phase B — Internal growth

As the project grows, internal modules should become increasingly independent:

- Component catalog
- Developer SDK
- Artifact tooling
- Playground core
- Testing utilities
- Contract tooling

This phase establishes ownership, stable interfaces, independent tests, and
real release requirements before any repository move is considered.

### Phase C — Selective extraction

A module should be extracted only when independence provides a measurable
benefit. Extraction should relocate a mature boundary rather than discover the
boundary during migration.

### Phase D — Ecosystem

The long-term ecosystem may contain independently maintained repositories and
published packages with separate contributors, release processes, and CI/CD.
Not every internal module needs to reach this phase.

### Directional internal architecture

The following is a proposed direction, not an immediate migration requirement:

```text
stellar-forge/
│
├── apps/
│   └── web/
│       ├── app/
│       ├── components/
│       └── API routes
│
├── packages/
│   ├── catalog/
│   │   └── Component definitions
│   │
│   ├── sdk/
│   │   └── Future developer SDK
│   │
│   ├── artifacts/
│   │   └── Artifact metadata + validation
│   │
│   ├── playground-core/
│   │   └── Execution abstractions
│   │
│   └── testing/
│       └── Test utilities
│
├── contracts/
│   ├── contracts/
│   │   ├── token/
│   │   ├── escrow/
│   │   ├── staking/
│   │   └── ...
│   │
│   └── prebuilt/
│       ├── *.wasm
│       ├── metadata.json
│       └── checksums.txt
│
├── scripts/
│
└── docs/
```

Existing code should move toward this separation only when doing so provides a
concrete architectural benefit. The directories shown above are directional;
they must not be created merely to match the diagram.

### Internal boundary principles

- Keep the current repository unified while the project is evolving rapidly.
- Establish clear ownership boundaries inside the repository.
- Keep coupling between modules minimal.
- Prefer stable interfaces between major subsystems.
- Avoid unnecessary cross-module dependencies.
- Avoid prematurely publishing internal packages.
- Place new functionality according to its architectural responsibility rather
  than adding it to a large general-purpose directory.
- Drive extraction by maturity and independence, not repository size alone.

### Repository extraction criteria

A module becomes a candidate for extraction when most of the following are
true:

- **Ownership** — it has a clear responsibility and ownership boundary.
- **Stable API** — its public interface is stable enough to avoid constant
  breaking changes during extraction.
- **Independent usefulness** — it provides meaningful value outside the main
  Stellar Forge application.
- **Independent release requirements** — there is a real reason to version,
  publish, or release it independently.
- **Low coupling** — it does not depend heavily on private implementation
  details of unrelated modules.
- **Independent testing** — it has a meaningful test suite that does not
  require the entire application.
- **Independent CI/CD** — it can eventually be built, tested, and released
  independently.
- **Community contribution potential** — contributors can work on it without
  understanding the entire codebase.

> Repository extraction is an architectural optimization, not a milestone that
> must happen simply because the repository becomes large.

### Potential future repository boundaries

The following are potential future extractions, not current commitments.

#### Core platform — `stellar-forge`

The primary repository would continue to own the web application,
documentation, component catalog UI, Playground UI, developer portal, and the
broader ecosystem entry point.

#### Contracts — `stellar-forge-contracts`

This could eventually contain `token`, `payment`, `escrow`, `access-control`,
`subscription`, `vesting`, `staking`, `atomic-swap`, `timelock`,
`merkle-airdrop`, `oracle`, `crowdfund`, `allowance`, `claimable-balance`, and
`multi-signature`, together with Rust/Soroban tests, contract build tooling,
and contract versioning. The current Cargo workspace already provides the
appropriate internal seam, but this repository must not be extracted until
contract development, versioning, and release workflows are genuinely
independent.

#### Developer SDK — `stellar-forge-sdk`

This could eventually provide `@stellar-forge/sdk`, including component
discovery, contract interfaces, transaction helpers, deployment utilities,
artifact lookup, and developer abstractions. It should become independent only
after its developer-facing API is sufficiently mature.

#### Artifact distribution — `stellar-forge-artifacts`

This could eventually contain WASM artifacts, metadata, checksums, release
manifests, and artifact versions. The existing verified artifact boundary
provides groundwork for this possibility; the eventual repository, release, or
storage mechanism remains intentionally undecided.

#### Sandbox infrastructure — `stellar-forge-sandbox`

This could eventually contain the sandbox runner, execution engine, isolation,
resource limits, execution API, and hosted execution infrastructure. The
current `sandbox-runner` remains under `contracts/contracts/sandbox-runner` and
must not be extracted until hosted execution creates a justified independent
ownership and release boundary.

### Current decision and migration progression

**Stellar Forge will remain a monorepo during the current development stage.**
The immediate priority is not repository splitting:

```text
Strong internal architecture
        ↓
Stable module boundaries
        ↓
Mature implementations
        ↓
Stable public APIs
        ↓
Evidence of independent usefulness
        ↓
Selective extraction
```

This progression allows rapid development while preserving a realistic path
toward an ecosystem of independently maintained packages and repositories.

The anti-pattern to avoid is:

```text
Large repository
      ↓
Immediately split everything
      ↓
Many repositories
      ↓
Cross-repository dependencies
      ↓
Versioning overhead
      ↓
CI/CD complexity
      ↓
Slower development
```

The preferred progression is:

```text
Monorepo
   ↓
Strong boundaries
   ↓
Mature modules
   ↓
Stable APIs
   ↓
Selective extraction
```

Rationale:

- The web app, catalog data, domain logic, and the contract workspace are
  tightly coupled today (the UI and API routes read the same catalog records,
  and the contracts are consumed directly by the sandbox). Splitting now would
  add cross-repo coordination cost without a clear benefit.
- The contract workspace is already a Cargo workspace with clear member
  boundaries; that is the natural internal seam.
- A single `pnpm` + Cargo repository keeps contributor setup simple and the
  catalog-to-contract relationship auditable.

Potential future boundaries (only when they have independent value and
ownership): a published integration SDK/package, a standalone contract
registry, or a separate deployment service. Do **not** create those repositories
or directories now.

## Architectural Principles

1. The repository is the source of truth; verify claims against it.
2. Prefer simple architecture over unnecessary complexity.
3. Generalize only when repeated patterns justify it.
4. Keep contract logic separate from presentation logic.
5. Components should eventually be reusable outside Stellar-Forge.
6. The Playground is a validation environment, not the final destination.
7. Real Testnet behavior must be clearly distinguished from local simulation.
8. Don't claim production readiness prematurely.
9. Every new major feature should have a clear owner/layer.
10. Avoid Token-specific abstractions when a generic component abstraction is
    appropriate.

---

*This document is descriptive of the current repository plus a proposed
direction. Where a section is labeled **Proposed**, it is guidance for future
work and does not describe shipped behavior.*
