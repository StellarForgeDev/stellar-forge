# Vesting Component Specification

> Status: **Implemented (v1), sandbox-ready, NOT on Stellar Testnet.**
> The Vesting contract lives in `contracts/contracts/vesting`, builds
> for `wasm32v1-none`, is registered in the catalog as
> `implemented: true, sandbox: true, testnet: false`, runs in the local
> Playground sandbox (with its token dependency provisioned generically), and
> ships with a passing Rust test suite.
>
> `capabilities.testnet` is **`false`** and there is **no** entry in
> `src/lib/transactions/deployments.ts`. Vesting is therefore excluded from
> the Testnet transaction flow. No Testnet interaction, deployment, or address
> registration was performed.

## Purpose

Give developers a small, reusable Soroban component that models a **vesting /
timelock**: a single `beneficiary` receives a SEP-41 `asset` that is locked in
the contract and released linearly over a fixed window that begins a configurable
offset after deployment, after an initial `cliff`, across a `duration`. It is a
deliberate stress-test of the Component Standard's handling of **time-driven,
stateful** logic combined with a **held balance** — the same shape as a token
grant, founder unlock, or scheduled payout.

The key architectural proof of this component: **time stays internal contract
state.** The vesting schedule is a set of Soroban `Timepoint`s kept entirely
inside the contract; they never enter or leave as a platform parameter type. The
component is therefore expressible through the existing catalog → Playground →
sandbox → integration pipeline **without expanding the F2 parameter-type system**
(which remains exactly `Address`, `MuxedAddress`, `i128`, `u32`, `String`,
`Symbol`).

## Scope

Vesting v1 covers exactly:

- `beneficiary` — the single account authorized to claim the vested asset.
- `asset` — the SEP-41 token contract being held (a dependency).
- `total` — the full quantity that will vest (`i128`).
- `start` — seconds after deployment when vesting begins (`u32`).
- `duration` — the vesting span in seconds, relative to `start` (`u32`).
- `cliff` — the initial period (seconds, relative to `start`) before any amount
  vests (`u32`).

Funds are moved into the contract via a `deposit` call, then released to the
beneficiary via `claim`.

## Non-goals

Vesting v1 **does not** include:

- A production scheduler / cron (claims are pulled by the beneficiary when the
  time condition is met; timing is the claimer's concern).
- Multiple beneficiaries, cliffs per tranche, or accelerated-vesting events.
- Revocation / clawback by an admin.
- On-chain memos, metadata, or receipts beyond the transfer event.
- Mainnet / Testnet deployment (sandbox-local only).

## Interface

Vesting is a **stateful** contract.

| Method          | Parameters                      | Returns | Purpose                                                                 |
| --------------- | ------------------------------- | ------- | ----------------------------------------------------------------------- |
| `__constructor` | `beneficiary: Address`, `asset: Address`, `total: i128`, `start: u32`, `duration: u32`, `cliff: u32` | `()` | Configures the schedule; derives `start_time`/`cliff_time`/`end_time` from the current ledger time + the relative offsets. |
| `deposit`       | `from: Address`, `amount: i128` | `()`    | Moves `amount` of the held asset from `from` into the contract. Authorized by `from`. |
| `claim`         | `beneficiary: Address`          | `i128`  | Releases the currently vested (and unclaimed) amount to the beneficiary. Authorized by the beneficiary. |
| `claimable`     | —                               | `i128`  | Reports the amount currently vested and not yet claimed.                |
| `released`      | —                               | `i128`  | Reports the total amount already claimed.                               |

**Funding note:** Vesting is a *holder* contract — it must custody `total` before
it can release anything. Because the SEP-41 `TokenClient` exposes no `mint`, the
contract cannot self-fund in its constructor. Instead the token dependency's
`setup` step mints `total` to an `admin`, and the caller funds the contract with
a `deposit(admin, total)` call (authorized by `admin`). This keeps the component
inside the generic pipeline: the only addition beyond the spec's four read/write
methods is the `deposit` funding helper, and `claim` takes the beneficiary
explicitly so the generic `first-address` authorization model can bind the
signer to the beneficiary (mirroring Escrow's `release(arbiter)`).

**Parameter ordering note:** `claim` takes `beneficiary` as its first (and only)
`Address` parameter, so the generic `first-address` authorization heuristic in
`src/lib/transactions/builder.ts` (`authorizationInfo`) identifies the
beneficiary as the required signer — no component-specific code.

## Data Types

| Field        | Type      | Meaning                                                                 |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `beneficiary`| `Address` | The only party authorized to claim.                                     |
| `asset`      | `Address` | Contract address of a SEP-41 token (the held asset).                    |
| `total`      | `i128`    | Full quantity that vests over the schedule.                             |
| `start`      | `u32`     | Seconds after deployment when vesting begins.                           |
| `duration`   | `u32`     | Vesting span in seconds, relative to `start`.                           |
| `cliff`      | `u32`     | Initial no-vest period in seconds, relative to `start`.                |

**Internal-only state (never a parameter):**

| Field         | Type       | Meaning                                                              |
| ------------- | ---------- | -------------------------------------------------------------------- |
| `start_time`  | `Timepoint`| Ledger time at which vesting begins. Not F2-exposed.                |
| `cliff_time`  | `Timepoint`| Ledger time before which nothing vests. Not F2-exposed.            |
| `end_time`    | `Timepoint`| Ledger time at which the full `total` is vested. Not F2-exposed.    |
| `released`    | `i128`     | Running total already claimed by the beneficiary.                    |

Return types are `i128` (already supported by the sandbox serializer and the
platform) and `()` (void).

## Time / Interval Semantics

- `start`, `duration`, and `cliff` are **`u32`** supplied at construction —
  interpreted as **seconds**. `start` is relative to deployment; `cliff` and
  `duration` are relative to `start`.
- The schedule is computed internally: `start_time = ledger.timestamp() + start`,
  `cliff_time = start_time + cliff`, `end_time = start_time + duration`. Each is
  a `Timepoint`. The ledger timestamp is read via `env.ledger().timestamp()`
  (returns `u64`); arithmetic is done in `u64` and re-wrapped into `Timepoint`,
  never crossing the parameter boundary as `u64`/`Timepoint`/`Duration`.
- `claimable` compares the current `ledger.timestamp()` against the schedule:
  - `now < cliff_time` → `0` (cliff not reached).
  - `now >= end_time` → `total - released`.
  - otherwise → `total * (now - start_time) / (end_time - start_time) - released`
    (linear, monotonically increasing).
- Constructor validation: `duration == 0` panics; `cliff > duration` panics.

This demonstrates that a **time-driven state machine needs no F2 time-type
expansion**: time is an internal implementation detail resolved against the host
ledger, exactly as Subscription's `next_charge` needed no new type.

## Authorization

- `deposit` calls `from.require_auth()` and uses `first-address` authorization in
  the catalog (`authorization: "first-address"`), resolving to `from`.
- `claim` verifies `beneficiary == stored_beneficiary`, calls
  `beneficiary.require_auth()`, and uses `first-address` authorization
  (`authorization: "first-address"`), resolving to the supplied `beneficiary`. No
  admin role exists. The stored-beneficiary check rejects a non-beneficiary
  caller even when auth is mocked.
- `claimable` and `released` are `authorization: "none"`.
- The `__constructor` performs no caller check (constructor auth is mocked at
  deploy, like every other component).

## Asset / Dependency Model

Vesting has exactly **one direct dependency**, the `token` contract, aliased
`asset`:

```ts
dependencies: [
  {
    alias: "asset",
    package: "token",
    constructorArgs: { admin: "admin", decimal: "7", name: "Vesting Asset", symbol: "VEST" },
    setup: [{ fn: "mint", args: ["admin", "1000000"], signer: "admin" }],
  },
]
```

- **Flat dependency only**: `Vesting → Token`. It does **not** go through
  Payment or Escrow, avoiding nested dependencies.
- The asset alias is referenced by the constructor `asset` parameter; the
  Playground API and sandbox-runner resolve `asset → <token address>`
  generically (same machinery Payment/Escrow/Subscription use). No `asset`- or
  `vesting`-specific branch exists in the runner or platform.
- The `setup` mint gives `admin` the `total`; the caller then funds the contract
  with `deposit(admin, total)` (signer `admin`) before claims begin.

## Errors

- `duration must be greater than zero` — constructor `duration == 0`.
- `cliff must not exceed duration` — constructor `cliff > duration`.
- `deposit amount must be positive` — `deposit` with `amount <= 0`.
- `claim must be called by the beneficiary` — `claim` invoked by a
  non-beneficiary (the stored-beneficiary check, independent of mocked auth).
- `auth failed` — when the beneficiary does not authorize (live networks).
- Insufficient balance is propagated from `asset.transfer` if the contract has
  not been funded with `total`. Time gating is a clean `0` return, not a panic.

## State

Vesting stores, in instance storage: `beneficiary`, `asset`, `total`,
`start_time` (`Timepoint`), `cliff_time` (`Timepoint`), `end_time` (`Timepoint`),
and `released` (`i128`). There is no dependency recursion and no `Map`/`Vec`
crossing the platform boundary.

## Component Standard Mapping

In `src/data/components.ts`, Vesting is a `StellarComponent` record:

- `implemented: true` — a real contract lives in `contracts/contracts/vesting`.
- `sandbox: true` — its WASM runs in the local sandbox-runner.
- `testnet: false` — no `deployments.ts` entry; excluded from Testnet flow.
- `category: "Tokens"` — fits the existing category; no new category was added.

`componentMaturity()` reports `Implemented`. The platform must not advertise
Testnet availability it cannot honor, so `testnet` stays `false`.

## Playground Integration

The Playground discovers Vesting purely from its catalog record:

- `config` renders a `name` field plus the standard `network` select.
- `interface` exposes `deposit`/`claim`/`claimable`/`released`;
  `buildConstructorRequest` seeds `beneficiary`/`asset` from the catalog's
  `constructorArgs`, `asset` from the dependency alias, and
  `total`/`start`/`duration`/`cliff` from their defaults.
- `discoverIdentityNames` automatically finds `beneficiary` (plus `admin`,
  inherited from the token dependency constructor) — no global identity list was
  edited. `playgroundIdentityOptions` surfaces `beneficiary`, `asset`, and the
  base defaults.
- The sandbox-runner deploys the Vesting WASM and the token dependency, seeds the
  balance via the `setup` mint, exercises `deposit`/`claim`/`claimable`/`released`,
  and asserts the pre-cliff state and the non-beneficiary rejection — all with no
  component-specific runner code.

## Transaction Integration

Vesting is **not** in the Testnet flow: `capabilities.testnet` is `false`, so
`validateTransactionRequest` rejects it and there is no `deployments.ts` entry. No
change to `validate.ts`, `builder.ts`, `args.ts`, `rpc.ts`, `submit.ts`, or
`freighter.ts` is required (they remain generic over `interface`/`capabilities`).

## Developer Integration

`generateRustIntegration` reads Vesting's `interface` and emits a compilable
example: deploy the Vesting WASM, then call `vesting_client.deposit(&admin, &1_000_000)`
and `vesting_client.claim(&beneficiary)`. The client name (`vesting` →
`VestingClient`) and `use vesting::VestingClient;` are derived from
`implementation.package` — there is **no** hardcoded `VestingClient` branch in
the generator.

## Testing Strategy

- **Rust contract tests** (`contracts/contracts/vesting/src/test.rs`):
  - constructor rejects `duration == 0` and `cliff > duration`.
  - `claimable` is `0` before the cliff; `released` starts at `0`.
  - only the beneficiary may claim (stored-beneficiary check rejects an intruder
    even under mocked auth).
  - full timeline via `env.ledger().set_timestamp`: 25% / 50% / 100% points
    release the correct linear amounts, and nothing remains after `end_time`.
  - a claim before the cliff returns `0` and transfers nothing.
- **Sandbox-runner test** (`vesting_executes_generically`): a full request (with
  the token dependency) deploys and exercises `deposit`/`claim`/`claimable`/
  `released`, asserting the pre-cliff state and non-beneficiary rejection
  generically. The runner cannot advance ledger time, so the full timeline is
  covered by the contract's own Rust tests.
- **Component Standard tests** (`tests/data/components.test.ts`):
  `implemented/sandbox/testnet` flags, dependency metadata, constructor
  identity defaults, interface shape, and "supported parameter types only" all
  match.
- **Identity tests** (`tests/playground/vesting.test.ts`): novel `beneficiary`
  discovery, deterministic resolution, and catalog-driven constructor requests.
- **Integration tests** (`tests/integration/vesting.generators.test.ts`): the
  generator yields output containing `VestingClient` and
  `use vesting::VestingClient;`, derived from the package.

## Architecture Review

### Files added / modified

- Added: `contracts/contracts/vesting/` (Cargo.toml, src/lib.rs, src/test.rs),
  `contracts/prebuilt/vesting.wasm`, `tests/integration/vesting.generators.test.ts`,
  `tests/playground/vesting.test.ts`, `docs/components/vesting.md`.
- Modified (tracked): `src/data/components.ts` (added the Vesting component),
  `tests/data/components.test.ts` (added a Vesting standard block),
  `contracts/contracts/sandbox-runner/src/main.rs` (added a generic end-to-end
  test — no production logic change), `README.md` (added Vesting to the
  implemented-components list and the contracts tree).

### F2 / parameter-type audit

`src/lib/transactions/parameter-types.ts` is **unchanged**. Vesting uses only
`Address`, `i128`, and `u32`. A repo-wide search for `slug === "vesting"`,
`switch (slug)`, `case "vesting"`, `vestingIdentity*`, and hard-coded
`VestingClient` in platform source found **nothing** — the only `VestingClient`
references are the Rust contract's own generated client and the tests that assert
generic derivation.

### Can Vesting be implemented using the existing Component Standard unchanged?

**Yes.** Adding the catalog record (with `capabilities`, `implementation`,
`interface`, `dependencies`, `constructorArgs`) makes Vesting flow through
catalog, Playground, sandbox execution, and integration generation with **no
modifications** to platform code. The only required infrastructure changes were
the new contract crate, its `Cargo.lock` entry, and the committed prebuilt WASM.
This confirms the architecture cleanly hosts a time-driven, balance-holding state
machine without expanding F2.
