# Stellar-Forge

[![CI](https://github.com/StellarForgeDev/stellar-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/StellarForgeDev/stellar-forge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A developer platform for discovering, understanding, experimenting with, and reusing Stellar/Soroban building blocks. Stellar-Forge catalogs reusable components, documents how they work, and provides an interactive playground plus a transaction workflow that operates against Stellar Testnet.

## Current Status

- **Release Candidate.**
- **15 implemented components**, all registered for Stellar Testnet and runnable in the local sandbox: `token`, `payment`, `access-control`, `escrow`, `multi-signature`, `subscription`, `vesting`, `staking`, `atomic-swap`, `timelock`, `merkle-airdrop`, `oracle`, `crowdfund`, `allowance`, `claimable-balance`. Registry presence is not, by itself, independent proof of on-chain behavior or WASM hash parity.
- **Network model:** centralized `NetworkConfig` (`testnet` | `mainnet` | `futurenet`) with `rpcUrl`, `passphrase`, `explorerUrl` and env overrides (`STELLAR_RPC_*_URL`). `Testnet` is operational and the default; `Mainnet` is architecture-aware (config, deployment lookup, validation, and integration generation are network-aware) but has no deployments and no `mainnet:true` capabilities -- it correctly reports "not deployed" and will not submit; `Futurenet` plumbing is retained with no deployments.
- Transaction flows run against real Testnet RPC via the generic pipeline (builder -> simulation -> Freighter signing -> submission). The Token `name` flow has been manually verified end to end in production; the remaining registry entries are not independently verified by that test. The project is **not production/mainnet ready**.

All components in the catalog are fully implemented contracts, documented throughout this document and in the [Component Catalog Status](#component-catalog-status) section.

## Features

Functionality that currently exists in the repository:

- **Component catalog** -- a searchable, filterable list of Stellar/Soroban building blocks (`src/data/components.ts`).
- **Interactive component documentation** -- per-component catalog pages and a documentation hub with getting-started, component library, playground, and integration sections.
- **Local Soroban Playground** -- configure a component and inspect the structure it produces.
- **Real local sandbox execution** -- the Playground executes the real contract WASM for all 15 components (including `token.wasm`, `crowdfund.wasm`, `allowance.wasm`, `claimable-balance.wasm` and 11 others) in an isolated Soroban host, with deterministic execution and no network, wallet, or gas costs.
- **Transaction builder** -- network-aware assembly, simulation, signing, and submission (Testnet operational, Mainnet architecture-ready, Futurenet plumbing).
- **Stellar transaction simulation** -- preparation calls the selected network's RPC (Testnet by default) to simulate operations.
- **Freighter wallet integration** -- connect Freighter to provide a signing account.
- **Transaction signing/submission** -- signed transactions are submitted to the selected network.
- **Friendbot funding for Testnet** -- a built-in action to fund a Testnet account via Friendbot.
- **Integration code generator** -- network-aware Rust and TypeScript examples from a component's interface and the current configuration.
- **Documentation hub** -- `src/app/docs` covering getting started, the component library, the Playground, and Integration.

All fifteen components are implemented contracts with a live local sandbox and Testnet deployment registrations. The generic pipeline (catalog -> playground -> transactions -> integration) is network-aware; the live Testnet transaction path is independently verified for Token `name`, while the other registered entries remain to be verified individually. Mainnet remains architecture-ready but undeployed.

## Tech Stack

Verified from `package.json` and the repository:

- **Next.js** `16.3.0` (App Router)
- **React** `19.2.8`
- **TypeScript** `^5`
- **Tailwind CSS** `^4`
- **pnpm** `11.21.0` (package manager)
- **Rust / Cargo** -- used for the Soroban contracts and the native `sandbox-runner`
- **Soroban SDK** -- Rust contract development
- **Stellar CLI** (`stellar`) -- builds contract WASM artifacts

## Project Structure and Repository Architecture

Stellar-Forge is structured across three repositories connected via Git submodules:

* **`stellar-forge`** (this repository) -- Web application, UI, App Router pages, API routes, and documentation.
* **`stellar-forge-contracts`** (submodule at `contracts/`) -- Soroban smart contracts, unit tests, prebuilt WASM artifacts, and deployment evidence.
* **`stellar-forge-sandbox`** (nested submodule at `contracts/contracts/sandbox-runner/`) -- Native sandbox-runner executable that powers the local Soroban Playground.

```text
stellar-forge/                  (https://github.com/StellarForgeDev/stellar-forge)
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
│   ├── data/                   Component catalog and metadata
│   └── lib/                    Application logic
├── contracts/                  Git submodule (https://github.com/StellarForgeDev/stellar-forge-contracts)
│   ├── contracts/
│   │   ├── access-control/     Role-based authorization (implemented, Testnet-deployed)
│   │   ├── allowance/          Delegated allowance (implemented, Testnet-deployed)
│   │   ├── atomic-swap/        Atomic swap (implemented, Testnet-deployed)
│   │   ├── claimable-balance/  Time-locked claimable balance (implemented, Testnet-deployed)
│   │   ├── crowdfund/          Fixed-deadline crowdfund (implemented, Testnet-deployed)
│   │   ├── escrow/             Conditional escrow (implemented, Testnet-deployed)
│   │   ├── greeter/            Example contract used by the generic sandbox
│   │   ├── merkle-airdrop/     Merkle distributor (implemented, Testnet-deployed)
│   │   ├── multi-signature/    Threshold multisig (implemented, Testnet-deployed)
│   │   ├── oracle/             Signed price feed (implemented, Testnet-deployed)
│   │   ├── payment/            Stateless payment primitive (implemented, Testnet-deployed)
│   │   ├── staking/            Single-asset staking (implemented, Testnet-deployed)
│   │   ├── subscription/       Recurring billing (implemented, Testnet-deployed)
│   │   ├── test-asset/         Minimal SEP-41 fixture for payment tests
│   │   ├── timelock/           Simple timelock (implemented, Testnet-deployed)
│   │   ├── token/              SEP-41 token (implemented, Testnet-deployed)
│   │   ├── vesting/            Vesting/timelock (implemented, Testnet-deployed)
│   │   └── sandbox-runner/     Nested Git submodule (https://github.com/StellarForgeDev/stellar-forge-sandbox)
│   └── prebuilt/               Committed contract WASM (15 x *.wasm + metadata.json + checksums.txt)
├── scripts/                    Build/deploy helpers
│   ├── build-sandbox-runner.mjs Native runner build script
│   ├── sandbox-build.mjs       Local sandbox-runner + WASM build
│   └── vercel-sandbox-build.sh Vercel Linux sandbox-runner build
├── .gitmodules                 Root submodule declarations
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
- **Git** with recursive submodule support

### Cloning and Setup

Clone the repository with all submodules initialized recursively:

```bash
git clone --recurse-submodules https://github.com/StellarForgeDev/stellar-forge.git
cd stellar-forge
```

For an existing clone:

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

### Workflow

```text
pnpm install        # install dependencies
pnpm sandbox:build  # build the native sandbox-runner and contract WASM
pnpm dev            # start the development server (http://localhost:3000)
pnpm build          # create a production build (compiles sandbox-runner, then Next.js)
pnpm start          # serve the production build
pnpm lint           # run ESLint
pnpm vercel-build   # Vercel build entry point (runs pnpm build)
```

`pnpm sandbox:build` runs `cargo build -p sandbox-runner` and builds missing contract WASM with Cargo for the `wasm32v1-none` target. The **native `sandbox-runner` binary is required by the Playground API** (`/api/playground`); without it, the Playground returns a `503`. The committed `contracts/prebuilt/*.wasm` files are used as a fallback for the WASM itself, but the runner must still be built locally.

## Deployment

Stellar-Forge is deployed on Vercel. The production Playground path has been independently verified: the deployed Linux runner executes trusted Token WASM and returns a successful real result.

- **`vercel-build`** -- the `package.json` build script Vercel runs. It delegates to `pnpm run build`, which compiles the sandbox-runner via `scripts/build-sandbox-runner.mjs` and then runs `next build`.
- **`scripts/build-sandbox-runner.mjs`** -- compiles the native sandbox-runner binary for the current platform.
- **`scripts/vercel-sandbox-build.sh`** -- installs the Rust toolchain if needed and compiles `sandbox-runner` for **Linux** (release). Contract WASM is platform-independent and ships prebuilt in `contracts/prebuilt/`.
- **Next.js output tracing** -- `next.config.ts` sets `outputFileTracingIncludes` for `/api/playground` so the serverless function bundle contains the WASM artifacts and the runner binary.
- **Artifact resolution** -- at runtime (`src/lib/playground/artifacts.ts`), the Playground resolves the runner from local build directories and the WASM from either the local build or the committed prebuilt copy.
- **Optional environment variables** (with built-in defaults; override only if needed):
  - `STELLAR_RPC_TESTNET_URL`
  - `STELLAR_RPC_MAINNET_URL`
  - `STELLAR_RPC_FUTURENET_URL`

This setup is **not** a statement of production/mainnet readiness.

## Component Catalog Status

- **15 implemented components**, all **registered for Stellar Testnet** in `src/lib/transactions/deployments.ts`: `token`, `payment`, `access-control`, `multi-signature`, `escrow`, `oracle`, `subscription`, `vesting`, `staking`, `atomic-swap`, `timelock`, `merkle-airdrop`, `crowdfund`, `allowance`, `claimable-balance`. All support local sandbox execution; the Token `name` transaction was manually verified through production, while the other registry entries are not independently verified here. Contract instance existence, expected behavior, and exact WASM-byte/hash parity are separate claims. The generic transaction pipeline is network-aware: `NetworkConfig` (`testnet` | `mainnet` | `futurenet`) centralizes `rpcUrl`, `passphrase`, and `explorerUrl`; `Testnet` is operational (default), `Mainnet` is architecture-ready but has no deployments (`mainnet:false` for all components) and correctly reports "not deployed" without submitting, `Futurenet` plumbing is retained with no deployments.
  - Every catalog entry is an implemented contract; the catalog also documents each component's patterns, use cases, and configuration. The authorization-stable `expiration_ledger` fix (Phase 5.3B) ensures `token.approve` via an intermediate contract remains valid across ledgers (`current < expiration <= current+1_000_000`).

## Testnet Status

Stellar-Forge is focused on **Stellar Testnet**. The Testnet section (`/testnet`) provides controlled Testnet deployment and verification infrastructure:

- **Controlled deployment** -- the deployment flow requires explicit wallet confirmation and does not sign or submit automatically.
- **Artifact verification** -- deployed WASM artifacts are verified against repository prebuilt checksums.
- **Repository-authoritative evidence** -- deployment evidence is committed to the repository, not stored on a runtime server.

**Current verified deployment:**

- **Access Control** contract: `CDQLJ6YAPI4JSIYRHLIKJFC6636ZEQUXHNDINQFPBXSWKMZVCJ7EXFBR`
- Artifact SHA verified against repository prebuilt.

**Mainnet is not supported** by the controlled deployment path. No Mainnet deployment occurs in this project.

## Roadmap

The authoritative phase tracker is [`ROADMAP.md`](./ROADMAP.md).

- **Phases 1–33:** completed baseline capability work, verified against the
  current repository where claimed.
- **Phase 34:** active dependency and supply-chain hardening. Dependabot PRs
  are reviewed individually; major upgrades are not merged blindly.
- **Phases 35–64:** planned verification, lifecycle, security, reliability,
  release, and maintenance work.

The roadmap preserves the distinction between historical evidence, current
candidate authorization, and future work. No Mainnet deployment is planned by
the current release roadmap.

## Known Limitations

- **Network support:** `Testnet` is operational and supported (15 registered deployments); `Mainnet` is architecture-aware (config, deployment lookup, validation, generators, and UI are network-aware) but **no Mainnet contracts are deployed** (`mainnet:false` for all components, `getDeployment("mainnet",...)` correctly returns null, transactions are gated as "not deployed"); `Futurenet` plumbing is retained with no deployments. No Mainnet deployment occurs in this phase.
- **Deployment evidence:** the Token `name` flow is independently verified end to end on Testnet. The other 14 registry entries are registered but not independently verified in this documentation. Token and Payment on-chain WASM hashes differ from the current repository prebuilt artifacts, so exact artifact parity must not be inferred from a working contract instance.
- **Layout verification:** the transaction-builder overflow fix is present and covered by successful checks, but pixel-level browser viewport verification is not recorded in the repository.
- **Web application test suite is growing.** Run `pnpm test` for the Vitest suite and `cargo test -p sandbox-runner` for the native runner tests. The suites cover catalog, identity, parameter, dependency, authorization, integration-generation, network configuration, and route behavior.
- **Vercel Playground execution:** production execution has been verified with the deployed Linux runner and real Token WASM.
- **Admin-only Token methods cannot be exercised by visitors.** The token admin key is held outside the repository, so `mint`/`set_admin` cannot be run by a connected wallet; the local sandbox is the only place to observe state changes.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, verification commands, and how to add a new catalog-driven component. The repository also follows the development principles in `AGENTS.md` and `CLAUDE.md`.

### Adding a component

The generic execution pipeline currently handles address, integer, string,
symbol, byte, collection, option, and time-related parameter values. The exact
interface for each component remains defined by `src/data/components.ts`.

Adding a new reusable building block requires **no component-specific application code** -- the catalog, identity resolution, dependency provisioning, authorization, configuration, transaction, and integration-code paths are all generic over the supported parameter types. The registration steps are:

1. **Contract crate** -- add a Soroban contract under `contracts/contracts/<slug>/`. The workspace (`contracts/Cargo.toml`) uses a `contracts/*` glob and the build script (`scripts/sandbox-build.mjs`) discovers contract directories automatically, so no build-list edit is required.
2. **Catalog entry** -- add an entry to `src/data/components.ts` describing the component, its `interface`, `constructorArgs`, `dependencies`, `config`, `category`, and `testnet` flag. This single metadata object drives every part of the UI, sandbox, and generator.
3. **Prebuilt WASM** -- run `pnpm sandbox:build` (or `scripts/sandbox-build.mjs --prebuilt`) and commit the refreshed `contracts/prebuilt/<slug>.wasm` so the Playground works where WASM cannot be rebuilt. The native `sandbox-runner` is built locally and is not committed.
4. **(Optional) Category** -- if the component introduces a new `category`, add it to the `componentCategories` array in `src/data/components.ts` so it appears in the catalog filter.

No edits to `src/app`, the API routes, the transaction builder, or the integration generator are needed.

## License

Stellar-Forge is distributed under the MIT License. See [`LICENSE`](./LICENSE).
