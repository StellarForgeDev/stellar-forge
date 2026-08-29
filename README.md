# Stellar-Forge

A developer platform for discovering, understanding, experimenting with, and reusing Stellar/Soroban building blocks. Stellar-Forge catalogs reusable components, documents how they work, and provides an interactive playground plus a transaction workflow that operates against Stellar Testnet.

## Current Status

- **Release Candidate.**
- Focused on **Stellar Testnet** (a Testnet + Futurenet configuration exists; no mainnet support).
  - **Eight implemented components**: the `Token` contract (deployed on Stellar Testnet), the `Payment` contract (deployed on Stellar Testnet; also sandbox-ready), the `Access Control` contract (sandbox-ready; not yet deployed to Testnet), the `Escrow` contract (sandbox-ready; not yet deployed to Testnet), the `Multi-signature` contract (sandbox-ready; not yet deployed to Testnet), the `Subscription` contract (sandbox-ready; not yet deployed to Testnet), the `Vesting` contract (sandbox-ready; not yet deployed to Testnet), and the `Staking` contract (sandbox-ready; not yet deployed to Testnet).
  - All eight implemented components run in the local sandbox; only `Token` and `Payment` are also deployed to Stellar Testnet.
- Transaction flows run against real Testnet RPC, but the project is **not production/mainnet ready**.

All components in the catalog are fully implemented contracts, documented throughout this document and in the [Component Catalog Status](#component-catalog-status) section.

## Features

Functionality that currently exists in the repository:

- **Component catalog** — a searchable, filterable list of Stellar/Soroban building blocks (`src/data/components.ts`).
- **Interactive component documentation** — per-component catalog pages and a documentation hub with getting-started, component library, playground, and integration sections.
- **Local Soroban Playground** — configure a component and inspect the structure it produces.
- **Real local sandbox execution** (implemented components only) — the Playground executes the real contract WASM (e.g. `token.wasm`, `payment.wasm`, `access-control.wasm`, `escrow.wasm`, `multi-signature.wasm`, `subscription.wasm`, `vesting.wasm`, `staking.wasm`) in an isolated Soroban host on the local machine, with deterministic execution and no network, wallet, or gas costs.
- **Transaction builder** — assemble, simulate, sign, and submit Stellar transactions.
- **Stellar Testnet transaction simulation** — preparation calls the real Testnet RPC to simulate operations.
- **Freighter wallet integration** — connect Freighter to provide a signing account.
- **Testnet transaction signing/submission** — signed transactions are submitted to Testnet.
- **Friendbot funding for Testnet** — a built-in action to fund a Testnet account via Friendbot.
- **Integration code generator** — produces a Rust example from a component's interface and the current configuration.
- **Documentation hub** — `src/app/docs` covering getting started, the component library, the Playground, and Integration.

All eight components (Token, Payment, Access Control, Escrow, Multi-signature, Subscription, Vesting, Staking) are implemented contracts with a live local sandbox; only Token and Payment additionally expose a Testnet transaction flow.

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
│   │   ├── token/              SEP-41 token contract (implemented)
│   │   ├── access-control/     Role-based authorization contract (implemented)
│   │   ├── vesting/            Vesting/timelock contract (implemented)
│   │   ├── staking/            Single-asset staking with time-based rewards (implemented)
│   │   ├── greeter/            Example contract used by the generic sandbox
│   │   └── sandbox-runner/     Native runner that executes contract WASM
│   └── prebuilt/               Committed contract WASM (e.g. token.wasm, access-control.wasm, staking.wasm)
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
  - `STELLAR_RPC_FUTURENET_URL`

This setup is **not** a statement of production/mainnet readiness.

## Component Catalog Status

- **Token**, **Payment**, **Access Control**, **Escrow**, **Multi-signature**, **Subscription**, **Vesting**, and **Staking** are the implemented components. `Token` is a standard SEP-41 fungible token contract **deployed on Stellar Testnet** (address registered in `src/lib/transactions/deployments.ts`); it supports local sandbox execution and real Testnet simulation/submission. `Payment` is a stateless `pay` primitive **deployed on Stellar Testnet** via the generic dependency mechanism; it also runs in the local sandbox. `Access Control`, `Escrow`, `Multi-signature`, `Subscription`, `Vesting`, and `Staking` run in the local sandbox but are **not** yet deployed to Testnet (`testnet` is `false`).
  - Every catalog entry is an implemented contract; the catalog also documents each component's patterns, use cases, and configuration.

## Roadmap

### Completed

- Project foundation, design system, and landing page.
- Component catalog with detail pages, search, and filtering.
- Documentation hub (getting started, component library, playground, integration).
- Interactive Playground with real local Soroban sandbox execution for implemented components.
- Data-driven Playground and integration code generator.
- Transaction system: builder, real Testnet RPC simulation, Freighter signing, Testnet submission, and Friendbot funding.
- Real `Token` contract deployed to Stellar Testnet.
- Vercel build configuration (Linux `sandbox-runner` build, output tracing, prebuilt WASM).
- Engineering audit and remediation work.

### Planned

  - Continue expanding the component catalog using the existing generic pipeline (no component-specific code required for new components).
- Add a dedicated Transactions documentation section.
- Add an automated test/CI suite for the web application.
- Expand contribution guidance.
- Finalize project licensing.
- Verify the Vercel deployment path end-to-end.
- Broaden network support beyond Testnet/Futurenet.

No features beyond the above are implied or promised.

## Known Limitations

- **Testnet-focused.** The configuration targets Stellar Testnet (and Futurenet); mainnet is not supported.
  - **Eight implemented components.** `Token` and `Payment` are deployed on Stellar Testnet; `Access Control`, `Escrow`, `Multi-signature`, `Subscription`, `Vesting`, and `Staking` are sandbox-ready but not yet deployed to Testnet (`testnet` is `false`).
- **Transactions documentation is incomplete.** There is no dedicated Transactions documentation page yet.
  - **Web application test suite is growing.** A Vitest suite covers the catalog, identity, parameter, dependency, authorization, and integration-generation machinery; Rust contract unit tests also exist.
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
