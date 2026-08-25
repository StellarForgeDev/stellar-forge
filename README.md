# Stellar-Forge

A developer platform for discovering, understanding, experimenting with, and reusing Stellar/Soroban building blocks. Stellar-Forge catalogs reusable components, documents how they work, and provides an interactive playground plus a transaction workflow that operates against Stellar Testnet.

## Current Status

- **Release Candidate.**
- Focused on **Stellar Testnet** (a Testnet + Futurenet configuration exists; no mainnet support).
 - **Three implemented components**: the `Token` contract (deployed on Stellar Testnet), the `Payment` contract (deployed on Stellar Testnet; also sandbox-ready), and the `Escrow` contract (sandbox-ready; not yet deployed to Testnet).
- The other **three catalog entries are concepts/documentation only** — they describe patterns but have no contract implementation.
- Transaction flows run against real Testnet RPC, but the project is **not production/mainnet ready**.

The distinction between implemented functionality and catalog concepts is maintained throughout this document and in the [Component Catalog Status](#component-catalog-status) section.

## Features

Functionality that currently exists in the repository:

- **Component catalog** — a searchable, filterable list of Stellar/Soroban building blocks (`src/data/components.ts`).
- **Interactive component documentation** — per-component catalog pages and a documentation hub with getting-started, component library, playground, and integration sections.
- **Local Soroban Playground** — configure a component and inspect the structure it produces.
- **Real local sandbox execution** (implemented components only) — the Playground executes the real contract WASM (e.g. `token.wasm`, `payment.wasm`, `escrow.wasm`) in an isolated Soroban host on the local machine, with deterministic execution and no network, wallet, or gas costs.
- **Transaction builder** — assemble, simulate, sign, and submit Stellar transactions.
- **Stellar Testnet transaction simulation** — preparation calls the real Testnet RPC to simulate operations.
- **Freighter wallet integration** — connect Freighter to provide a signing account.
- **Testnet transaction signing/submission** — signed transactions are submitted to Testnet.
- **Friendbot funding for Testnet** — a built-in action to fund a Testnet account via Friendbot.
- **Integration code generator** — produces a Rust example from a component's interface and the current configuration.
- **Documentation hub** — `src/app/docs` covering getting started, the component library, the Playground, and Integration.

Catalog concepts (Access Control, Subscription, Multi-signature) are documented as patterns but are **not** implemented contracts, so they do not have a live sandbox or transaction flow.

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
│   │   ├── greeter/            Example contract used by the generic sandbox
│   │   └── sandbox-runner/     Native runner that executes contract WASM
│   └── prebuilt/               Committed contract WASM (e.g. token.wasm)
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

- **Token**, **Payment**, and **Escrow** are the implemented components. `Token` is a standard SEP-41 fungible token contract **deployed on Stellar Testnet** (address registered in `src/lib/transactions/deployments.ts`); it supports local sandbox execution and real Testnet simulation/submission. `Payment` is a stateless `pay` primitive **deployed on Stellar Testnet** via the generic dependency mechanism; it also runs in the local sandbox. `Escrow` is a stateful holding contract (depositor/beneficiary/arbiter/asset) that runs in the local sandbox but is **not** yet deployed to Testnet (`testnet` is `false`).
- The remaining **three catalog entries are concepts**, not implemented contracts:
  - **Access Control**
  - **Subscription**
  - **Multi-signature**

These entries carry descriptions, use cases, and configuration metadata but have no contract code, so they expose documentation only.

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

- Implement the remaining catalog components (currently concepts).
- Add a dedicated Transactions documentation section.
- Add an automated test/CI suite for the web application.
- Expand contribution guidance.
- Finalize project licensing.
- Verify the Vercel deployment path end-to-end.
- Broaden network support beyond Testnet/Futurenet.

No features beyond the above are implied or promised.

## Known Limitations

- **Testnet-focused.** The configuration targets Stellar Testnet (and Futurenet); mainnet is not supported.
- **Three implemented components.** `Token` and `Payment` are deployed on Stellar Testnet; `Escrow` is sandbox-ready but not yet deployed to Testnet. The other three catalog entries (Access Control, Subscription, Multi-signature) are concepts with no contract code.
- **Transactions documentation is incomplete.** There is no dedicated Transactions documentation page yet.
- **No automated test/CI suite for the web application.** Rust contract unit tests exist; the Next.js app has none.
- **Vercel sandbox execution path requires end-to-end verification.**
- **Admin-only Token methods cannot be exercised by visitors.** The token admin key is held outside the repository, so `mint`/`set_admin` cannot be run by a connected wallet; the local sandbox is the only place to observe state changes.

## Contributing

Contribution guidance will be expanded as the project matures. For now, the repository follows the development principles in `AGENTS.md` and `CLAUDE.md`.

## License

Licensing has not yet been finalized. No `LICENSE` file is present in the repository.
