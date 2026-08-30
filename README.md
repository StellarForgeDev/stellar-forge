# Stellar-Forge

A developer platform for discovering, understanding, experimenting with, and reusing Stellar/Soroban building blocks. Stellar-Forge catalogs reusable components, documents how they work, and provides an interactive playground plus a transaction workflow that operates against Stellar Testnet.

## Current Status

- **Release Candidate.**
- **15 implemented components**, all deployed to Stellar Testnet and runnable in the local sandbox: `token`, `payment`, `access-control`, `escrow`, `multi-signature`, `subscription`, `vesting`, `staking`, `atomic-swap`, `timelock`, `merkle-airdrop`, `oracle`, `crowdfund`, `allowance`, `claimable-balance`.
- **Network model:** centralized `NetworkConfig` (`testnet` | `mainnet` | `futurenet`) with `rpcUrl`, `passphrase`, `explorerUrl` and env overrides (`STELLAR_RPC_*_URL`). `Testnet` is operational and the default; `Mainnet` is architecture-aware (config, deployment lookup, validation, and integration generation are network-aware) but has no deployments and no `mainnet:true` capabilities — it correctly reports “not deployed” and will not submit; `Futurenet` plumbing is retained with no deployments.
- Transaction flows run against real Testnet RPC via the generic pipeline (builder → simulation → Freighter signing → submission). The project is **not production/mainnet ready**.

All components in the catalog are fully implemented contracts, documented throughout this document and in the [Component Catalog Status](#component-catalog-status) section.

## Features

Functionality that currently exists in the repository:

- **Component catalog** — a searchable, filterable list of Stellar/Soroban building blocks (`src/data/components.ts`).
- **Interactive component documentation** — per-component catalog pages and a documentation hub with getting-started, component library, playground, and integration sections.
- **Local Soroban Playground** — configure a component and inspect the structure it produces.
- **Real local sandbox execution** — the Playground executes the real contract WASM for all 15 components (including `token.wasm`, `crowdfund.wasm`, `allowance.wasm`, `claimable-balance.wasm` and 11 others) in an isolated Soroban host, with deterministic execution and no network, wallet, or gas costs.
- **Transaction builder** — network-aware assembly, simulation, signing, and submission (Testnet operational, Mainnet architecture-ready, Futurenet plumbing).
- **Stellar transaction simulation** — preparation calls the selected network’s RPC (Testnet by default) to simulate operations.
- **Freighter wallet integration** — connect Freighter to provide a signing account.
- **Transaction signing/submission** — signed transactions are submitted to the selected network.
- **Friendbot funding for Testnet** — a built-in action to fund a Testnet account via Friendbot.
- **Integration code generator** — network-aware Rust and TypeScript examples from a component’s interface and the current configuration.
- **Documentation hub** — `src/app/docs` covering getting started, the component library, the Playground, and Integration.

All fifteen components are implemented contracts with a live local sandbox and a Testnet transaction flow. The generic pipeline (catalog → playground → transactions → integration) is network-aware and validated for Testnet; Mainnet remains architecture-ready but undeployed.

## Tech Stack

Verified from `package.json` and the repository:

- **Next.js** `16.3.0` (App Router)
- **React** `19.2.8`
- **TypeScript** `^5`
- **Tailwind CSS** `^4`
- **pnpm** `11.21.0` (package manager)
- **Rust / Cargo** — used for the Soroban contracts and the native `sandbox-runner`
- **Soroban SDK** — Rust contract development
- **Stellar CLI** (`stellar`) — builds contract WASM artifacts

## Project Structure

```text
stellar-forge/
├── public/                     Static assets
├── src/
│   ├── app/                    Next.js App Router: pages and API routes
│   │   ├── page.tsx            Landing page
│   │   ├── components/         Catalog list and per-component detail pages
│   │   ├── docs/               Documentation hub and per-component docs
│   │   ├── playground/         Interactive Playground page
│   │   ├── transactions/       Transaction builder page
│   │   └── api/
│   │       ├── playground/     Local sandbox execution route
│   │       └── transactions/   prepare and submit routes
│   ├── components/             Reusable UI and feature components
│   │   ├── catalog/            Catalog cards and listing
│   │   ├── docs/               Documentation-rendering components
│   │   ├── integration/        Integration code generator UI
│   │   ├── layout/             Navigation and layout
│   │   ├── playground/         Playground and sandbox UI
│   │   ├── transactions/       Transaction builder and preview UI
│   │   └── ui/                 Foundational UI primitives (Button, Card)
│   ├── data/                   Component catalog and metadata
│   └── lib/                    Application logic
│       ├── docs/               Documentation content/snippets
│       ├── integration/        Integration code generation
│       ├── playground/         Sandbox artifact resolution and execution
│       ├── transactions/       Preparation, simulation, signing, submission
│       └── wallet/             Freighter wallet integration
├── contracts/                  Rust/Soroban workspace
│   ├── contracts/
│   │   ├── token/              SEP-41 token (implemented, Testnet-deployed)
│   │   ├── payment/            Stateless payment primitive (implemented, Testnet-deployed)
│   │   ├── access-control/     Role-based authorization (implemented, Testnet-deployed)
│   │   ├── escrow/             Conditional escrow (implemented, Testnet-deployed)
│   │   ├── multi-signature/    Threshold multisig (implemented, Testnet-deployed)
│   │   ├── subscription/       Recurring billing (implemented, Testnet-deployed)
│   │   ├── vesting/            Vesting/timelock (implemented, Testnet-deployed)
│   │   ├── staking/            Single-asset staking (implemented, Testnet-deployed)
│   │   ├── atomic-swap/        Atomic swap (implemented, Testnet-deployed)
│   │   ├── timelock/           Simple timelock (implemented, Testnet-deployed)
│   │   ├── merkle-airdrop/     Merkle distributor (implemented, Testnet-deployed)
│   │   ├── oracle/             Signed price feed (implemented, Testnet-deployed)
│   │   ├── crowdfund/          Fixed-deadline crowdfund (implemented, Testnet-deployed)
│   │   ├── allowance/          Delegated allowance (implemented, Testnet-deployed)
│   │   ├── claimable-balance/  Time-locked claimable balance (implemented, Testnet-deployed)
│   │   ├── greeter/            Example contract used by the generic sandbox
│   │   └── sandbox-runner/     Native runner that executes contract WASM
│   └── prebuilt/               Committed contract WASM (15 × *.wasm)
├── scripts/                    Build/deploy helpers
│   ├── sandbox-build.mjs       Local sandbox-runner + WASM build
│   └── vercel-sandbox-build.sh Vercel Linux sandbox-runner build
├── AGENTS.md
├── CLAUDE.md
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
└── ...
```

Generated/ignored directories (`node_modules/`, `.next/`, `contracts/target/`) are omitted. The committed `contracts/prebuilt/*.wasm` files back the Playground on environments where the WASM cannot be rebuilt.

## Local Development

### Requirements

- **Node.js** (recent LTS)
- **pnpm**
- **Rust toolchain** (`cargo`) with the `wasm32v1-none` target
- **Stellar CLI** (`stellar`)

### Workflow

```text
pnpm install        # install dependencies
pnpm sandbox:build  # build the native sandbox-runner and contract WASM
pnpm dev            # start the development server (http://localhost:3000)
pnpm build          # create a production build
pnpm start          # serve the production build
pnpm lint           # run ESLint
pnpm vercel-build   # Vercel build entry point (see Deployment)
```

`pnpm sandbox:build` runs `cargo build -p sandbox-runner` and `stellar contract build`, then refreshes local WASM artifacts. The **native `sandbox-runner` binary is required by the Playground API** (`/api/playground`); without it, the Playground returns a `503`. The committed `contracts/prebuilt/token.wasm` is used as a fallback for the WASM itself, but the runner must still be built locally.

## Deployment

Stellar-Forge is **configured** for deployment on Vercel. The complete Vercel sandbox execution path has **not been independently verified** end-to-end in this repository; the description below reflects the committed configuration, not a confirmed live deployment.

- **`vercel-build`** — the `package.json` build script Vercel runs instead of `next build`. It invokes `scripts/vercel-sandbox-build.sh` and then `next build`.
- **`scripts/vercel-sandbox-build.sh`** — installs the Rust toolchain if needed and compiles `sandbox-runner` for **Linux** (release). Contract WASM is platform-independent and ships prebuilt in `contracts/prebuilt/`.
- **Next.js output tracing** — `next.config.ts` sets `outputFileTracingIncludes` for `/api/playground` so the serverless function bundle contains the WASM artifacts and the runner binary.
- **Artifact resolution** — at runtime (`src/lib/playground/artifacts.ts`), the Playground resolves the runner from local build directories and the WASM from either the local build or the committed prebuilt copy.
 - **Optional environment variables** (with built-in defaults; override only if needed):
   - `STELLAR_RPC_TESTNET_URL`
   - `STELLAR_RPC_MAINNET_URL`
   - `STELLAR_RPC_FUTURENET_URL`

This setup is **not** a statement of production/mainnet readiness.

## Component Catalog Status

- **15 implemented components**, all **deployed on Stellar Testnet** and registered in `src/lib/transactions/deployments.ts`: `token`, `payment`, `access-control`, `multi-signature`, `escrow`, `oracle`, `subscription`, `vesting`, `staking`, `atomic-swap`, `timelock`, `merkle-airdrop`, `crowdfund`, `allowance`, `claimable-balance`. All support local sandbox execution and real Testnet simulation/submission. The generic transaction pipeline is network-aware: `NetworkConfig` (`testnet` | `mainnet` | `futurenet`) centralizes `rpcUrl`, `passphrase`, and `explorerUrl`; `Testnet` is operational (default), `Mainnet` is architecture-ready but has no deployments (`mainnet:false` for all components) and correctly reports “not deployed” without submitting, `Futurenet` plumbing is retained with no deployments.
  - Every catalog entry is an implemented contract; the catalog also documents each component's patterns, use cases, and configuration. The authorization-stable `expiration_ledger` fix (Phase 5.3B) ensures `token.approve` via an intermediate contract remains valid across ledgers (`current < expiration ≤ current+1_000_000`).

## Roadmap

### Completed

- Project foundation, design system, and landing page.
- Component catalog with detail pages, search, and filtering.
- Documentation hub (getting started, component library, playground, integration).
- Interactive Playground with real local Soroban sandbox execution for all 15 components.
- Data-driven Playground and network-aware integration code generator (Rust + TypeScript).
- Network-aware transaction system: centralized `NetworkConfig` (`testnet` | `mainnet` | `futurenet`), generic `getDeployment(network, slug)`, RPC selection, builder, simulation, Freighter signing, submission, and Friendbot funding.
- Real contracts deployed to Stellar Testnet — all 15 components (addresses in `src/lib/transactions/deployments.ts`), with `capabilities.testnet:true`.
- Authorization-stable `expiration_ledger` fix for `crowdfund`, `allowance`, `claimable-balance` (Phase 5.3B.19–5.3B.20): caller-supplied stable `expiration_ledger` validated as `current < expiration ≤ current+1_000_000`, eliminating the prior `auth/invalid_action` caused by ledger-dependent recomputation and the earlier `max_entry_ttl` failure (`SAFE_ALLOWANCE_TTL=1_000_000`).
- Vercel build configuration (Linux `sandbox-runner` build, output tracing, prebuilt WASM).
- Engineering audit and remediation work.

### Phase History

- **Phase 3** — Component expansion (8 → 15 reusable Soroban components, generic pipeline, local WASM sandbox).
- **Phase 4** — CI, reproducibility, prebuilt WASM integrity, and E2E hardening.
- **Phase 5.1** — Repository hygiene and contribution foundation.
- **Phase 5.2** — Vercel/serverless build-path verification.
- **Phase 5.3** — Testnet expansion and validation (5.3B.18 diagnostic, 5.3B.19 authorization-stable fix, 5.3B.20 Testnet lifecycle validation, 5.3B.21 registration, 5.3B.22 reconciliation — commit `6b21f8e`).
- **Phase 5.4** — Configurable network support (Mainnet architecture-aware, not deployed).

### Planned

- **Phase 5.5** — Integration generator strengthening (additional languages, SDK/package considerations).
- **Phase 6** — Repository splitting (monorepo → focused repos) when scaling justifies it.
- Continue expanding the catalog via the generic pipeline (no component-specific code).
- Dedicated Transactions documentation section.
- Automated test/CI hardening.
- Vercel end-to-end verification.
- Mainnet deployments (separate, credentialed future phase — not in 5.4).

No features beyond the above are implied or promised.

## Known Limitations

- **Network support:** `Testnet` is operational and supported (15 deployments); `Mainnet` is architecture-aware (config, deployment lookup, validation, generators, and UI are network-aware) but **no Mainnet contracts are deployed** (`mainnet:false` for all components, `getDeployment("mainnet",…)` correctly returns null, transactions are gated as “not deployed”); `Futurenet` plumbing is retained with no deployments. No Mainnet deployment occurs in this phase.
- **Transactions documentation is incomplete.** There is no dedicated Transactions documentation page yet.
- **Web application test suite is growing.** Vitest (29 files, ~292 tests) plus Rust contract tests (40 for the three authorization-stable contracts) cover catalog, identity, parameter, dependency, authorization, integration-generation, and network configuration; coverage continues to expand.
- **Vercel sandbox execution path requires end-to-end verification.**
- **Admin-only Token methods cannot be exercised by visitors.** The token admin key is held outside the repository, so `mint`/`set_admin` cannot be run by a connected wallet; the local sandbox is the only place to observe state changes.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, verification commands, and how to add a new catalog-driven component. The repository also follows the development principles in `AGENTS.md` and `CLAUDE.md`.

### Adding a component

Adding a new reusable building block requires **no component-specific application code** — the catalog, identity resolution, dependency provisioning, authorization, configuration, transaction, and integration-code paths are all generic over the six supported parameter types (`Address`, `MuxedAddress`, `i128`, `u32`, `String`, `Symbol`). The registration steps are:

1. **Contract crate** — add a Soroban contract under `contracts/contracts/<slug>/`. The workspace (`contracts/Cargo.toml`) uses a `contracts/*` glob and the build script (`scripts/sandbox-build.mjs`) discovers contract directories automatically, so no build-list edit is required.
2. **Catalog entry** — add an entry to `src/data/components.ts` describing the component, its `interface`, `constructorArgs`, `dependencies`, `config`, `category`, and `testnet` flag. This single metadata object drives every part of the UI, sandbox, and generator.
3. **Prebuilt WASM** — run `pnpm sandbox:build` (or `scripts/sandbox-build.mjs --prebuilt`) and commit the refreshed `contracts/prebuilt/<slug>.wasm` so the Playground works where WASM cannot be rebuilt. The native `sandbox-runner` is built locally and is not committed.
4. **(Optional) Category** — if the component introduces a new `category`, add it to the `componentCategories` array in `src/data/components.ts` so it appears in the catalog filter.

No edits to `src/app`, the API routes, the transaction builder, or the integration generator are needed.

## License

Stellar-Forge is distributed under the MIT License. See [`LICENSE`](./LICENSE).
