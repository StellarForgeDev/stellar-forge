# Contributing to Stellar-Forge

Thanks for your interest in Stellar-Forge. This guide is intentionally
lightweight today; it will become more detailed as the project opens to more
external contributors.

## Welcome

Stellar-Forge is an open-source developer platform focused on reusable
Stellar/Soroban building blocks — discovering, understanding, testing,
integrating, and eventually deploying them. Contributions that improve the
catalog, documentation, contracts, Playground, transaction flow, or developer
experience are welcome.

## Development Setup

Requirements (verified against the repository):

- **Node.js** (recent LTS)
- **pnpm** (`packageManager: pnpm@11.21.0`)
- **Rust toolchain** (`cargo`) with the `wasm32v1-none` target
- **Stellar CLI** (`stellar`)

Setup commands:

```bash
pnpm install        # install web dependencies
pnpm sandbox:build  # build the native sandbox-runner + contract WASM
pnpm dev            # start the dev server (http://localhost:3000)
```

`pnpm sandbox:build` runs `cargo build -p sandbox-runner` and
`stellar contract build`, then refreshes local WASM artifacts. The native
`sandbox-runner` binary is **required** by the Playground API; without it the
Playground returns `503`. `contracts/prebuilt/token.wasm` is a committed
fallback for the WASM itself.

## Repository Structure

- `src/app/` — Next.js App Router pages and API routes.
- `src/components/` — reusable UI and feature components.
- `src/data/` — the component catalog (source of truth for components).
- `src/lib/` — domain logic (transactions, playground, integration, wallet).
- `contracts/` — Rust/Soroban workspace (token contract, sandbox-runner,
  greeter fixture).
- `scripts/` — build/deploy helpers (`sandbox-build.mjs`,
  `vercel-sandbox-build.sh`).
- `public/` — static assets.

See `ARCHITECTURE.md` for the full architectural description.

## Development Principles

- Make **small, focused changes**.
- **Preserve existing behavior** unless a change is explicitly intended to alter
  it.
- **Verify before claiming completion** — run the checks below and confirm the
  behavior against the repository. Do not claim functionality that is not
  present.
- **Don't introduce unnecessary dependencies.**
- **Don't mix unrelated refactors into feature work**; keep changes scoped.
- **Keep contracts and application logic clearly separated** (Rust in
  `contracts/`, TypeScript in `src/`).
- **Document architectural decisions** — when in doubt, reflect them in
  `ARCHITECTURE.md` or the relevant docs.

## Working on Components

The intended future workflow for adding a component is:

```text
Define
  ↓
Implement contract
  ↓
Test
  ↓
Build WASM
  ↓
Add metadata
  ↓
Add documentation
  ↓
Integrate with Playground
  ↓
Add integration example
  ↓
Deploy/Testnet where appropriate
```

**Implemented today:** the `token` component demonstrates most of this pipeline
end-to-end. Adding a new catalog entry today means editing
`src/data/components.ts` to add a `StellarComponent` record (with `config`, and
for implemented components an `interface` and `implementation`). The sandbox,
integration generator, and transaction routes all read from that same record.

**Planned / not yet automated:** the richer Component Standard (single coherent
pipeline, maturity lifecycle, generic vs Token-specific logic) is the current
roadmap priority (see `ROADMAP.md`). Until then, new components are added by
extending the existing data-driven model rather than a dedicated scaffolding
tool.

Concept components (no `implementation`/`interface`) are documentation-only and
do not run in the sandbox or generate real integration code.

## Testing and Verification

Commands that currently exist:

```bash
pnpm lint                 # ESLint
pnpm exec tsc --noEmit    # TypeScript typecheck
pnpm build                # production build
pnpm sandbox:build        # build sandbox-runner + contract WASM
```

Rust / Soroban verification (run from `contracts/`):

```bash
cargo test                              # run contract unit tests
stellar contract build                  # build contract WASM
cargo fmt --all                         # format Rust
```

(Verify the exact commands against `contracts/README.md` and `package.json`
before relying on them; the web app has **no** automated test suite yet.)

For contract changes, also run the sandbox build and confirm the Playground still
executes. For transaction changes, confirm the prepare/submit routes and
signature verification behave as documented.

## Pull Requests

- Keep PRs focused on a single capability or fix.
- Run `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build` before opening.
- Describe what changed and why; reference the relevant roadmap milestone when
  applicable.
- Don't commit `node_modules`, `.next`, secrets, API keys, or private
  credentials.
- Prefer clear, descriptive commit messages.

## Issues

A useful issue includes:

- What you expected and what happened.
- Steps to reproduce (for bugs).
- The component/route/page affected.
- Environment details (network, wallet, OS) when relevant.

Feature requests should map to a roadmap capability where possible.

## Future Contribution Expansion

Contribution guidance will become more detailed as Stellar-Forge opens to more
external contributors — including component contribution guidelines, SDK/package
contribution paths, and a documented release process. Until then, follow the
principles and workflow above and keep the repository as the source of truth.
