# Contributing to Stellar-Forge

Thanks for your interest in Stellar-Forge. This guide explains how to set up
the project, run verification, and contribute — including how to add a new
reusable component through the catalog-driven pipeline.

Stellar-Forge is an open-source developer platform for discovering,
understanding, experimenting with, and reusing Stellar/Soroban building blocks.
Network support is centralized in `src/lib/transactions/networks.ts` (`testnet` | `mainnet` | `futurenet`): **Testnet is operational** (default, 15 deployments), **Mainnet is architecture-aware but undeployed** (`mainnet:false` for all components, correctly gated), **Futurenet** plumbing is retained.

## Project setup

Requirements (verified against the repository):

- **Node.js** (recent LTS)
- **pnpm** (`packageManager: pnpm@11.21.0`)
- **Rust toolchain** (`cargo`) with the `wasm32v1-none` target
- **Stellar CLI** (`stellar`)

Install and build the native sandbox-runner plus contract WASM:

```bash
pnpm install        # install web dependencies
pnpm sandbox:build  # build the native sandbox-runner + contract WASM
```

`pnpm sandbox:build` runs `cargo build -p sandbox-runner` and
`stellar contract build`, then refreshes local WASM artifacts. The native
`sandbox-runner` binary is **required** by the Playground API
(`/api/playground`); without it the Playground returns `503`. Committed
`contracts/prebuilt/*.wasm` files are a fallback for the WASM itself so the
Playground works where WASM cannot be rebuilt.

## Running the web application

```bash
pnpm dev      # start the dev server (http://localhost:3000)
pnpm build    # create a production build
pnpm start    # serve the production build
```

## Running verification

Run these before opening a pull request:

```bash
pnpm lint                 # ESLint (also: pnpm lint)
pnpm exec tsc --noEmit    # TypeScript typecheck (strict)
pnpm build                # production build
pnpm test                 # Vitest web/domain unit tests (pnpm test:watch to watch)
pnpm verify:prebuilt      # verify committed prebuilt WASM integrity
```

### Contract / Soroban verification

Run from `contracts/`:

```bash
cargo test                              # run contract unit tests
stellar contract build                  # build contract WASM
cargo fmt --all                         # format Rust
```

`contracts/README.md` is the source of truth for contract commands.

## Architecture principles

- **Small, focused changes.** Keep PRs scoped to a single capability or fix.
- **Preserve existing behavior** unless a change is explicitly intended to alter
  it.
- **Catalog data is the source of truth.** `src/data/components.ts` drives the
  UI, API routes, sandbox, transaction builder, and integration generator.
- **Generic over component-specific.** The platform is data-driven across the
  six supported parameter types (`Address`, `MuxedAddress`, `i128`, `u32`,
  `String`, `Symbol`). **Do not introduce component-specific branching** in the
  UI, API, transaction, or integration code. New behavior should be expressed as
  catalog metadata, not bespoke wiring.
- **Keep contracts and application logic separated** (Rust in `contracts/`,
  TypeScript in `src/`).
- **Verify before claiming completion.** Run the checks above and confirm
  behavior against the repository. Do not claim functionality that is not
  present.
- **Don't introduce unnecessary dependencies.**
- **Document architectural decisions** in `ARCHITECTURE.md` or the relevant docs.

## Component architecture

A **component** is a single `StellarComponent` record in
`src/data/components.ts`. It carries structured metadata — identity, category,
`capabilities` (`implemented` / `sandbox` / `testnet`), `interface`
(`FunctionSpec[]`), `implementation` (`package` / `sourcePath` /
`buildTarget`), `config` (`ConfigField[]`), `dependencies`, and `constructorArgs`.

The generic pipeline (no component-specific code) is:

```text
Contract (contracts/)
  -> Tests (cargo test)
  -> WASM (stellar contract build)
  -> Metadata (src/data/components.ts)
  -> Catalog + Docs (src/app/components, src/app/docs)
  -> Playground sandbox (src/app/api/playground)
  -> Integration example (src/lib/integration)
  -> Testnet deployment (src/lib/transactions/deployments.ts, where applicable)
```

## How to add a new reusable component

Adding a component requires **no component-specific application code**. The
registration steps:

1. **Contract crate** — add a Soroban contract under
   `contracts/contracts/<slug>/`. The Cargo workspace uses a `contracts/*` glob
   and `scripts/sandbox-build.mjs` discovers contract directories automatically,
   so no build-list edit is required. Each component should ship a `Makefile`
   with `build` / `test` / `deploy-testnet` targets and a passing
   `cargo test` suite.
2. **Catalog entry** — add a `StellarComponent` record to
   `src/data/components.ts` describing the component: `slug`, `name`,
   `description`, `category`, `shortDescription`, `overview`, `useCases`,
   `capabilities`, `interface`, `implementation`, `config`, `dependencies`,
   and `constructorArgs` as needed. This single object drives the catalog,
   docs, Playground sandbox, transaction builder, and integration generator.
3. **Build & prebuilt WASM** — run `pnpm sandbox:build` (or
   `scripts/sandbox-build.mjs --prebuilt`) and commit the refreshed
   `contracts/prebuilt/<slug>.wasm` so the Playground works where WASM cannot be
   rebuilt. The native `sandbox-runner` is built locally and is not committed.
4. **(Optional) Category** — if the component introduces a new `category`, add
   it to the `componentCategories` array in `src/data/components.ts`.
5. **(Optional) Testnet** — to make the component Testnet-usable, deploy its WASM
   with the contract `Makefile` (`make -C contracts/contracts/<slug>
   deploy-testnet`, a manual, credentialed step using the Stellar CLI) and
   register the printed `C...` address in `src/lib/transactions/deployments.ts`,
   then set `capabilities.testnet = true`. The generic transaction flow
   discovers it automatically.

No edits to `src/app`, the API routes, the transaction builder, or the
integration generator are needed.

### Required tests

- **Contract:** a passing `cargo test` suite in the component crate.
- **Web/domain logic:** extend the Vitest suite under `src/` when you change
  catalog, identity, parameter, dependency, authorization, or integration
  generation code.
- **Sandbox:** after any contract change, run `pnpm sandbox:build` and confirm
  the Playground still executes the component.
- **Prebuilt integrity:** commit refreshed prebuilt WASM and confirm
  `pnpm verify:prebuilt` passes.

### No component-specific branching

The catalog, identity resolution, dependency provisioning, authorization,
configuration, transaction, and integration-code paths are all generic over the
six supported parameter types. If you find yourself adding `if (slug === "...")`
logic outside the catalog data, stop and express it as metadata instead.

## Pull request expectations

- Keep PRs focused on a single capability or fix.
- Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, and `pnpm test`
  before opening. Add `cargo test` / `pnpm sandbox:build` when contracts change.
- Use the pull request template; disclose any breaking changes and their
  migration path.
- Describe what changed and why; reference the relevant `ROADMAP.md` milestone
  when applicable.
- Don't commit `node_modules`, `.next`, secrets, API keys, or private
  credentials.
- Prefer clear, descriptive commit messages.

## Issues

Use the provided issue templates. A useful bug report includes expected vs
actual behavior, reproduction steps, the affected component/route/page, and the
environment (network, wallet, OS). Feature requests should map to a `ROADMAP.md`
capability where possible.

## Licensing

Stellar-Forge is distributed under the MIT License. See `LICENSE`.

## Future contribution expansion

Contribution guidance will continue to grow as Stellar-Forge opens to more
external contributors — including SDK/package contribution paths and a documented
release process. Until then, follow the principles and workflow above and keep
the repository as the source of truth.
