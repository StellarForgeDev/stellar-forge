# Escrow Component Specification

> Status: **Implemented (v1), sandbox-ready; NOT deployed to Stellar Testnet.**
> The Escrow contract lives in `contracts/contracts/escrow`, builds for
> `wasm32v1-none`, is registered in the catalog as
> `implemented: true, sandbox: true, testnet: false`, runs in the local
> Playground sandbox (with its token dependency provisioned generically), and
> ships with a passing Rust test suite plus a cross-contract sandbox execution
> proof.
>
> Escrow is the **third** component built on the Component Standard (after
> `token` and `payment`) and the first to require a *stateful* contract with a
> *constructor*, *role-based authorization*, and a *provisioned dependency*. It
> was added specifically to validate that the platform is generic: the work
> required was catalog metadata, contract code, a dependency record, and two
> small catalog-driven platform enhancements — **no** Escrow-specific branching
> anywhere in `src`.
>
> `testnet` stays `false` because no real Testnet deployment exists; Escrow is
> correctly excluded from Testnet transactions until a deployment address is
> registered in `src/lib/transactions/deployments.ts`.

## Purpose

Give developers a small, reusable Soroban component that holds an asset on
behalf of a depositor and releases it to a beneficiary only when an independent
arbiter approves — or refunds the depositor if the arbiter rejects. Escrow is a
stress-test of the Component Standard: it must work through the existing
catalog → Playground → transaction → integration pipeline **without** any
Escrow-specific code, and it must exercise capabilities the first two components
did not (a constructor, instance storage, multi-role authorization, and a
deployed dependency contract).

## Problem

Stellar-Forge could deploy/mint/transfer a token it owns (`token`) and move an
asset between two accounts (`payment`), but it had no *conditional* primitive:
"hold my funds and only release them when a third party says so." That pattern
underlies marketplaces, freelancer escrow, milestone payouts, and custody
demos. Escrow closes that gap while proving the platform supports stateful,
constructor-initialized, dependency-composing components.

## Scope

Escrow v1 covers exactly:

- A **depositor** who funds the escrow (authorizes `deposit`).
- A **beneficiary** who receives the funds on release.
- An **arbiter** who unilaterally decides release or refund.
- An **asset** (a SEP-41 token) that is held and moved.
- Two terminal transitions: `release` (to beneficiary) and `refund` (to
  depositor). Each may be called once; after either, the escrow is closed.

## Non-goals

Escrow v1 does **not** include:

- Multi-arbiter / quorum / multisig release logic (a single arbiter is
  sufficient for v1).
- Partial or split release.
- Time-based auto-release or dispute windows.
- Fee skimming or intermediary routing.
- Multiple assets held simultaneously.
- On-ledger memos, metadata, or receipts beyond the status flag.
- Mainnet support (Testnet eventually).

These belong to future extensions (see *Future Extensions*).

## Interface

Escrow is a **stateful** contract. It stores its configuration and balance in
instance storage and moves the asset only through the asset's own SEP-41 token
contract.

| Method           | Parameters                                  | Returns | Purpose                                                              |
| ---------------- | ------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `__constructor`  | `depositor: Address`, `beneficiary: Address`, `arbiter: Address`, `asset: Address` | `()`   | Initialize roles and the held asset. No balance is moved here.        |
| `deposit`        | `depositor: Address`, `amount: i128`        | `()`    | Transfer `amount` of `asset` from `depositor` into the escrow.       |
| `release`        | `arbiter: Address`                          | `()`    | Transfer the held balance to `beneficiary`; closes the escrow.       |
| `refund`         | `arbiter: Address`                          | `()`    | Transfer the held balance back to `depositor`; closes the escrow.    |
| `status`         | —                                           | `u32`   | `0` = open, `1` = released, `2` = refunded.                          |

**Parameter-ordering note (important for authorization):** `depositor` is the
*first* `Address` parameter of `deposit`, and `arbiter` is the *first*
`Address` parameter of `release`/`refund`. The generic authorization heuristic
in `src/lib/transactions/builder.ts` (`authorizationInfo`) treats the *first*
`Address`/`MuxedAddress` parameter as the required signer, so declaring these
methods `authorization: "first-address"` resolves the correct role with **no**
Escrow-specific auth code. This is the same convention `payment` uses for `from`.

## Data Types

| Field         | Type      | Meaning                                                                 |
| ------------- | --------- | ----------------------------------------------------------------------- |
| `depositor`   | `Address` | Funds the escrow; receives a refund. Must authorize `deposit`.           |
| `beneficiary` | `Address` | Receives funds on `release`.                                            |
| `arbiter`     | `Address` | Sole decision-maker; must authorize `release`/`refund`.                 |
| `asset`       | `Address` | Contract address of a SEP-41 token (the held asset).                    |
| `amount`      | `i128`    | Non-negative balance held in escrow, in the asset's smallest unit.      |

Return codes from `status()`: `0` open, `1` released, `2` refunded. The balance
moved is observable via the asset contract's own `Transfer` events.

## Authorization

- `__constructor` stores the four roles and the asset; no auth required at
  deploy time (the deployer is irrelevant to the escrow's trust model).
- `deposit` calls `depositor.require_auth()` **before** `asset.transfer(depositor, escrow, amount)`.
- `release` / `refund` call `arbiter.require_auth()` **before** the
  corresponding `asset.transfer`.
- In the catalog `interface`, each of `deposit`/`release`/`refund` is declared
  `authorization: "first-address"`, which (given the parameter ordering above)
  maps to the correct role. **No `addressParam` / custom auth kind was added**
  — the existing `first-address` model already expresses "the named first
  parameter is the signer," which is exactly the role semantics Escrow needs.
  The audit's S6 proposal (`addressParam`) is therefore **deferred**: Escrow
  proves it is unnecessary.

## Asset Model

A "Stellar asset" is represented generically as an **`Address`** pointing to a
contract that implements `soroban_sdk::token::TokenInterface` (SEP-41). Escrow
does not hardcode *which* token: the `asset` constructor argument is supplied as
a **dependency alias** (`"asset"`) in the catalog, and the generic sandbox-runner
resolves that alias to the address of a freshly deployed `token` contract. On
Testnet (when enabled later) the `asset` argument would be supplied at
invocation time by the caller, exactly as `payment` already does. Escrow imposes
no asset-specific logic.

### Dependency provisioning (generic)

Escrow declares a generic dependency in its catalog record:

```ts
dependencies: [
  {
    alias: "asset",
    package: "token",
    constructorArgs: {
      admin: "admin",
      decimal: "7",
      name: "Forge Token",
      symbol: "FORGE",
    },
    setup: [{ fn: "mint", args: ["admin", "1000000"], signer: "admin" }],
  },
]
```

The Playground API resolves that into a runner `dependencies` entry; the runner
deploys the token, records `asset → <address>` in its identity map, seeds the
balance via the setup call, and resolves Escrow's `asset` constructor parameter
(and any later `asset`-named argument) to the deployed token. **No
Token-specific branch exists** — the runner treats every dependency identically,
driven entirely by request data.

## Errors

Escrow v1 surfaces errors mostly through the delegated token call, plus local
guards:

- `escrow: already finalized` — `release`/`refund` after the escrow has closed.
- `escrow: only arbiter can release/refund` — a non-arbiter attempts a terminal
  transition (in practice caught by `require_auth` on `arbiter`).
- `escrow: only depositor can deposit` — non-depositor attempts `deposit`.
- `negative amount is not allowed` — panicked by the token on `amount < 0`.
- `insufficient balance` — propagated from `asset.transfer` when the depositor
  lacks funds.
- `auth failed` — when the required role does not authorize.
- `invalid asset` — when `asset` does not implement `TokenInterface`.

Escrow does not invent its own error enumeration beyond the role/finalization
guards; it relies on Soroban/SDK panics and the asset contract's errors.

## State

Escrow is **stateful**. It stores, in instance storage:

| Key          | Type      | Meaning                                  |
| ------------ | --------- | ---------------------------------------- |
| `Depositor`  | `Address` | Configured depositor.                    |
| `Beneficiary`| `Address` | Configured beneficiary.                   |
| `Arbiter`    | `Address` | Configured arbiter.                      |
| `Asset`      | `Address` | Configured held asset.                   |
| `Amount`     | `i128`    | Current balance held in escrow.           |
| `Status`     | `u32`     | `0` open, `1` released, `2` refunded.    |

A `DataKey` enum indexes these entries. `release`/`refund` set `Status` and
transfer the `Amount`, then it is never modified again. There is no TTL/bump
logic of its own (instance storage TTL is managed by the SDK defaults). This is
the minimum storage needed to be a correct, reusable escrow and stays contained
in the contract — the platform remains unaware of it.

## Component Standard Mapping

In `src/data/components.ts`, Escrow is added as a `StellarComponent` record:

- `implemented: true` — a real contract lives in `contracts/contracts/escrow`.
- `sandbox: true` — its WASM runs in the local sandbox-runner.
- `testnet: false` — no deployment address is registered in
  `src/lib/transactions/deployments.ts`, so Escrow is excluded from Testnet
  transactions.
- `constructorArgs` — catalog-driven defaults for the primary constructor:
  `{ depositor: "user1", beneficiary: "user2", arbiter: "admin", asset: "asset" }`.
  Values may reference identity names (`user1`, `user2`, `admin`, all of which
  resolve to sandbox addresses) or a dependency alias (`asset`, which resolves
  to the deployed token). This keeps constructor defaults **data-driven** so the
  generic execution layer never assumes a Token-shaped `"admin"` default.
- `dependencies` — the `asset` token dependency described above.

`componentMaturity()` reports `Implemented` (since `implemented: true`). The
platform must not advertise Testnet availability it cannot honor — Escrow's
`testnet` flag stays `false` until a real deployment is registered.

## Platform changes required (all generic)

Escrow required exactly two small, component-agnostic platform enhancements.
Neither is Escrow-specific; both make the catalog more expressive for *any*
component with a constructor or a dependency.

1. **Catalog-driven constructor defaults** (`constructorArgs`). Added an
   optional `constructorArgs?: Record<string, string>` field to both
   `StellarComponent` (primary component constructor) and `ComponentDependency`
   (dependency constructor) in `src/data/components.ts`. The field is named
   `constructorArgs` — not `constructor` — specifically to avoid colliding with
   the built-in `Object.prototype.constructor`. `buildConstructorRequest` in
   `src/lib/playground/execution.ts` now seeds each constructor parameter from
   `component.constructorArgs[name]` when present, else falls back to the
   existing admin-identity / config-value logic. Token/Payment behavior is
   unchanged (they declare no `constructorArgs`, so they use the existing
   fallback). This resolves audit item **S2**.

2. **Generator dependency-alias resolution** (`constructorArg`). In
   `src/lib/integration/generators.ts`, `constructorArg` now resolves a
   `&${param.name}_address` alias (e.g. `&asset_address`) to the deployed
   dependency address, matching the resolution `placeholderArg` already performed
   for invocation arguments. This fixes a Token-shaped heuristic that previously
   only recognized dependencies via the literal `token` name, so Escrow's
   `asset` constructor parameter resolves correctly too. This resolves audit
   item **S3**.

No change was needed to `validate.ts`, `builder.ts`, `args.ts`, `rpc.ts`,
`submit.ts`, `freighter.ts`, the Playground API route, or the sandbox-runner
execution engine — they are already generic over `interface`, `config`,
`dependencies`, and `constructorArgs`.

## Playground Integration

The Playground discovers Escrow purely from its catalog record:

- `config` renders the config form (`name` text + `network` select). Escrow has
  no Token-shaped `symbol`/`decimals` config, so `buildConstructorRequest`
  returns only `name`/`network` from config (audit item **S4** addressed by
  simply not adding those fields).
- `__constructor` is exposed via `interface`, so `buildConstructorRequest` seeds
  `depositor`/`beneficiary`/`arbiter` from `constructorArgs` identity names and
  `asset` from the `asset` dependency alias. `execution.ts` (`defaultArgValue`,
  `signerFor`, `callRequestFor`) then work generically for `deposit`/`release`/
  `refund`/`status`; the `first-address` role is the signer for each.
- The sandbox-runner deploys the Escrow WASM (with the constructor args),
  provisions the `asset` token dependency, and invokes the methods. Because the
  dependency is generic, the runner needs no Escrow branch.

## Transaction Integration

Escrow reuses the existing Testnet flow — *when enabled*. Because `testnet` is
`false`, `validateTransactionRequest` already excludes it from
`/api/transactions/prepare`. The moment a deployment address is registered in
`deployments.ts` and `testnet` is flipped to `true`, the same builder → prepare
→ sign → submit pipeline will work for `deposit`/`release`/`refund` with **no**
code change (the signer is the first-address role per method).

## Developer Integration

`generateRustIntegration` reads Escrow's `interface` and emits a compilable
example: deploy the Escrow WASM with the constructor args, then call
`escrow_client.deposit(&depositor, &amount_i128)`, etc. Because the generator is
driven entirely by `interface`/`config`/`constructorArgs`/`dependencies`, it
needs no Escrow-specific code.

## Testing Strategy

- **Rust contract tests** (`contracts/contracts/escrow/src/test.rs`): 7 tests
  covering constructor storage, deposit balance movement, arbiter release to
  beneficiary, arbiter refund to depositor, double-release panic, non-arbiter
  release rejection, and `status()` transitions.
- **Cross-contract sandbox proof** (`contracts/contracts/sandbox-runner/src/main.rs`,
  `escrow_executes_against_provisioned_dependency`): deploys Escrow alongside
  the provisioned `asset` token dependency, deposits from `user1`, releases via
  `admin`, and asserts `status() == 1` with the beneficiary's balance increased.
  This is the end-to-end execution proof that the generic runner + dependency
  provisioning work for a stateful, constructor-driven, dependency-composing
  component.
- **Catalog tests** (`tests/data/components.test.ts`): `implemented/sandbox/
  testnet` flags match the declared progression; `componentMaturity` =
  `Implemented`; `constructorArgs` and the `asset` dependency are asserted; Escrow
  is no longer a *concept* (removed from `CONCEPT_SLUGS`); the
  `componentWasmPath` concept case moved to `access-control`.
- **Playground tests** (`tests/playground/escrow.test.ts`): `buildConstructorRequest`
  for Escrow resolves role identity names and the `asset` alias; `defaultArgValue`/
  `signerFor`/`callRequestFor` behave per method.
- **Integration tests** (`tests/integration/escrow.generators.test.ts`):
  `generateRustIntegration` for Escrow yields output containing `deposit`/
  `release`/`refund`/`status` and an `EscrowClient` call; `constructorArg`
  resolves the `asset` alias.
- **Transaction-readiness tests** (`tests/transactions/escrow-readiness.test.ts`):
  confirms Escrow is `implemented` + `sandbox` but excluded from the Testnet
  transaction component list (`testnet: false`).
- **Sandbox-runner tests** (`cargo test -p sandbox-runner`): the escrow
  execution proof above, plus the existing payment/token proofs.

## Future Extensions

Possible later capabilities, **explicitly excluded from v1**:

- Multi-arbiter / quorum / multisig release
- Partial or split release; milestone-gated partial release
- Time-based auto-release or dispute windows
- Fee / intermediary routing
- Multiple assets held simultaneously
- Memo / metadata / off-chain receipt attachment
- Testnet deployment (gated on registering an address in `deployments.ts`)

## Architecture Review

### Files added / changed

- `contracts/contracts/escrow/` — `Cargo.toml`, `src/lib.rs`, `src/test.rs`,
  `Makefile` (mirrors `payment`; builds for `wasm32v1-none`).
- `contracts/prebuilt/escrow.wasm` — refreshed prebuilt artifact (the build
  script auto-discovers `escrow` via the workspace members glob; no script or
  workspace edit required).
- `src/data/components.ts` — added `constructorArgs?` to `StellarComponent` and
  `ComponentDependency`; replaced the Escrow *concept* block with an *implemented*
  record.
- `src/lib/playground/execution.ts` — `buildConstructorRequest` consumes
  `component.constructorArgs` (S2).
- `src/lib/integration/generators.ts` — `constructorArg` resolves dependency
  aliases (S3).
- `contracts/contracts/sandbox-runner/src/main.rs` — added
  `escrow_executes_against_provisioned_dependency`.
- `tests/...` — catalog, playground, integration, and transaction-readiness
  tests for Escrow.

### Token / Payment / Escrow-specific assumptions discovered

**None in logic.** A full-tree search for `escrow`, `payment`, and `token`
across `src/app` and `src/lib` found *no* behavioral references — only the
catalog records (data) and the `deployments.ts` registry entry for `token`/
`payment` (data). No `if component === "escrow"`, no special-casing in the
builder, validator, argument converter, integration generator, playground
helpers, or API routes. Escrow's constructor, dependency, roles, and state are
all expressed through the existing Component Standard and executed by the
generic runner.

### Architectural changes introduced

1. **`constructorArgs` field** on `StellarComponent` and `ComponentDependency`
   (catalog-driven constructor defaults). Generic; benefits any future
   constructor-bearing component. Named to avoid the `Object.prototype.constructor`
   collision.
2. **`constructorArg` alias resolution** in the integration generator. Generic;
   benefits any component whose constructor takes a dependency address.
3. **No auth-kind change.** Escrow's multi-role model is fully expressible with
   the existing `first-address` authorization convention (role = named first
   parameter). Audit item **S6** (`addressParam`) is therefore *deferred* — it
   would be speculative and is not needed.
4. **No new config field types.** Escrow needs only `text` (`name`) and the
   existing `network` select. Audit item **S1** (`address`/`boolean`
   `ConfigFieldType`) is *deferred* — not required by Escrow.

### Can Escrow be implemented using the existing Component Standard unchanged?

**Yes — with exactly two small generic enhancements** (`constructorArgs` and
`constructorArg` alias resolution), neither of which is Escrow-specific. Adding
the `StellarComponent` record (with `capabilities`, `implementation`,
`interface`, `constructorArgs`, and `dependencies`) makes Escrow flow through
catalog, Playground, sandbox execution, transaction builder (when Testnet-enabled),
prepare/submit, and integration generation with **no** modifications to the
platform's behavioral code. This validates the Component Ecosystem v1 thesis:
the platform is generic, and a third, substantially different component
(stateful, constructor-driven, dependency-composing, multi-role) required no
component-specific branching.

### Risks / unanswered questions

- **Testnet deployment:** `testnet` must remain `false` until a real deployment
  is registered in `deployments.ts`; the CI/process should not flip it
  speculatively. The local sandbox proof already covers execution correctness.
- **Multi-role signer UX:** the Transaction Builder keys the signer off the
  `first-address` per method; for `deposit` that is the depositor, for
  `release`/`refund` the arbiter. This is correct but relies on the parameter
  ordering convention — a future designer reordering params should revisit
  `authorizationInfo`.
- **Double-finalization guard:** enforced in-contract via `Status`; the runner
  does not need to know about it.
