# Subscription Component Specification

> Status: **Implemented (v1), sandbox-ready, NOT on Stellar Testnet.**
> The Subscription contract lives in `contracts/contracts/subscription`, builds
> for `wasm32v1-none`, is registered in the catalog as
> `implemented: true, sandbox: true, testnet: false`, runs in the local
> Playground sandbox (with its token dependency provisioned generically), and
> ships with a passing Rust test suite.
>
> `capabilities.testnet` is **`false`** and there is **no** entry in
> `src/lib/transactions/deployments.ts`. Subscription is therefore excluded from
> the Testnet transaction flow. No Testnet interaction, deployment, or address
> registration was performed.

## Purpose

Give developers a small, reusable Soroban component that models a
**recurring payment**: a subscriber agrees to be charged a fixed amount of a
token at a fixed time interval, with the funds moving to a merchant. It is a
deliberate stress-test of the Component Standard's handling of **time-driven,
stateful** logic.

The key architectural proof of this component: **time stays internal contract
state.** The next charge time is a Soroban `Timepoint` kept entirely inside the
contract; it never enters or leaves as a platform parameter type. The component
is therefore expressible through the existing catalog → Playground → sandbox →
integration pipeline **without expanding the F2 parameter-type system** (which
remains exactly `Address`, `MuxedAddress`, `i128`, `u32`, `String`, `Symbol`).

## Scope

Subscription v1 covers exactly:

- `subscriber` — the account authorized to be charged (and to cancel).
- `merchant` — the recipient of each charge.
- `asset` — the SEP-41 token contract being transferred (a dependency).
- `amount` — the fixed quantity charged each interval (`i128`).
- `interval` — the charge period in **seconds** (`u32`).

Charges are time-gated: a charge only succeeds once the ledger time has reached
the contract's internal `next_charge`, and the schedule then advances by
`interval`.

## Non-goals

Subscription v1 does **not** include:

- A production billing scheduler / cron (charges are pulled by a caller when the
  time condition is met; timing is the caller's concern).
- Prorated or variable amounts.
- Multiple subscribers or multi-merchant splits.
- On-chain memos, metadata, or receipts beyond the transfer event.
- Mainnet / Testnet deployment (sandbox-local only).

## Interface

Subscription is a **stateful** contract.

| Method           | Parameters                       | Returns | Purpose                                                                 |
| ---------------- | -------------------------------- | ------- | ----------------------------------------------------------------------- |
| `__constructor`  | `subscriber: Address`, `merchant: Address`, `asset: Address`, `amount: i128`, `interval: u32` | `()` | Configures the agreement; derives `next_charge` from the current ledger time + `interval`. |
| `charge`         | `subscriber: Address`            | `bool`  | If active and the time has come, transfers `amount` from subscriber to merchant, advances the schedule. Returns whether a charge occurred. |
| `cancel`         | `subscriber: Address`            | `bool`  | Marks the subscription inactive. Returns whether cancellation occurred.  |
| `is_active`      | —                                | `bool`  | Reports whether the subscription is still active.                       |

**Parameter ordering note:** `charge`/`cancel` take `subscriber` as the first
(and only) `Address` parameter, so the generic `first-address` authorization
heuristic in `src/lib/transactions/builder.ts` (`authorizationInfo`) identifies
the subscriber as the required signer — no component-specific code.

## Data Types

| Field        | Type      | Meaning                                                                 |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `subscriber` | `Address` | Authorizing account; the only party that may be charged or cancel.      |
| `merchant`  | `Address` | Recipient of each charge.                                                |
| `asset`     | `Address` | Contract address of a SEP-41 token (the subscribed asset).              |
| `amount`    | `i128`    | Fixed, non-negative quantity charged each interval.                     |
| `interval`  | `u32`     | Charge period in seconds. Max ~136 years — sufficient for a v1 demo.    |

**Internal-only state (never a parameter):**

| Field         | Type       | Meaning                                                              |
| ------------- | ---------- | -------------------------------------------------------------------- |
| `next_charge` | `Timepoint`| Internal ledger-time of the next eligible charge. Not F2-exposed.   |
| `active`      | `bool`     | Whether the subscription is still live.                             |

Return types are `bool` (already supported by the sandbox serializer, proven by
Multi-signature).

## Time / Interval Semantics

- `interval` is a **`u32`** supplied at construction — the only time-related
  platform parameter, interpreted as **seconds**.
- `next_charge` is computed internally as
  `Timepoint::from_unix(ledger.timestamp() + interval)` and stored as a
  `Timepoint`. The ledger timestamp is read via `env.ledger().timestamp()`
  (returns `u64`); arithmetic is done in `u64` and re-wrapped into `Timepoint`,
  never crossing the parameter boundary as `u64`/`Timepoint`/`Duration`.
- `charge` compares `ledger.timestamp() < next_charge.to_unix()` and fails
  cleanly (returns `false`) before the time is reached.
- After a successful charge, `next_charge` advances by `interval`.

This demonstrates that a **time-driven state machine needs no F2 time-type
expansion**: time is an internal implementation detail resolved against the
host ledger, exactly as Multi-signature's `threshold` needed no new type.

## Authorization

- `charge` and `cancel` call `subscriber.require_auth()` and additionally
  verify `subscriber == stored_subscriber`, then use `first-address`
  authorization in the catalog (`authorization: "first-address"`), resolving to
  the subscriber. No admin role exists.
- `is_active` is `authorization: "none"`.
- The `__constructor` performs no caller check (constructor auth is mocked at
  deploy, like every other component).

## Asset / Dependency Model

Subscription has exactly **one direct dependency**, the `token` contract, aliased
`asset`:

```ts
dependencies: [
  {
    alias: "asset",
    package: "token",
    constructorArgs: { admin: "admin", decimal: "7", name: "Subscription Asset", symbol: "SUB" },
    setup: [{ fn: "mint", args: ["admin", "1000000"], signer: "admin" }],
  },
]
```

- **Flat dependency only**: `Subscription → Token`. It does **not** go through
  Payment, avoiding nested dependencies.
- The asset alias is referenced by the constructor `asset` parameter; the
  Playground API and sandbox-runner resolve `asset → <token address>`
  generically (same machinery Payment/Escrow use). No `asset`-specific branch
  exists in the runner or platform.

## Errors

- `only the subscriber may charge this subscription` — `charge`/`cancel` invoked
  by a non-subscriber (the stored-subscriber check, independent of mocked auth).
- `insufficient balance` — propagated from `asset.transfer` when the subscriber
  lacks funds.
- `auth failed` — when the subscriber does not authorize (live networks).
- Time gate and inactive state are **clean `false` returns**, not panics.

## State

Subscription stores, in instance storage: `subscriber`, `merchant`, `asset`,
`amount`, `interval`, `next_charge` (`Timepoint`), and `active`. There is no
dependency recursion and no `Map`/`Vec` crossing the platform boundary.

## Component Standard Mapping

In `src/data/components.ts`, Subscription is a `StellarComponent` record:

- `implemented: true` — a real contract lives in `contracts/contracts/subscription`.
- `sandbox: true` — its WASM runs in the local sandbox-runner.
- `testnet: false` — no `deployments.ts` entry; excluded from Testnet flow.

`componentMaturity()` reports `Implemented`. The platform must not advertise
Testnet availability it cannot honor, so `testnet` stays `false`.

## Playground Integration

The Playground discovers Subscription purely from its catalog record:

- `config` renders a `name` field plus the standard `network` select.
- `interface` exposes `charge`/`cancel`/`is_active`; `buildConstructorRequest`
  seeds `subscriber`/`merchant` from the catalog's `constructorArgs`,
  `asset` from the dependency alias, and `amount`/`interval` from their defaults.
- `discoverIdentityNames` automatically finds `subscriber` and `merchant`
  (plus `admin`, inherited from the token dependency constructor) — no global
  identity list was edited. `playgroundIdentityOptions` surfaces
  `subscriber`, `merchant`, `asset`, and the base defaults.
- The sandbox-runner deploys the Subscription WASM and the token dependency,
  seeds the balance via the setup call, and invokes `charge`/`cancel`. The
  generic end-to-end test (`subscription_executes_generically`) confirms the
  time gate (charge before interval returns `false`) and cancellation, with no
  component-specific runner code.

## Transaction Integration

Subscription is **not** in the Testnet flow: `capabilities.testnet` is `false`,
so `validateTransactionRequest` rejects it and there is no `deployments.ts`
entry. No change to `validate.ts`, `builder.ts`, `args.ts`, `rpc.ts`,
`submit.ts`, or `freighter.ts` is required (they remain generic over
`interface`/`capabilities`).

## Developer Integration

`generateRustIntegration` reads Subscription's `interface` and emits a
compilable example: deploy the Subscription WASM, then call
`subscription_client.charge(&subscriber)`. The client name
(`subscription` → `SubscriptionClient`) and `use subscription::SubscriptionClient;`
are derived from `implementation.package` — there is **no** hardcoded
`SubscriptionClient` branch in the generator.

## Testing Strategy

- **Rust contract tests** (`contracts/contracts/subscription/src/test.rs`):
  - starts active; charge before interval returns `false` (time gate).
  - charge succeeds after `env.ledger().set_timestamp` reaches `next_charge`,
    moves `amount` subscriber→merchant, and advances the schedule; a second
    immediate charge is gated.
  - cancel stops further charges; cancelling again is a no-op.
  - only the subscriber may charge/cancel (stored-subscriber check rejects an
    intruder even under mocked auth).
- **Sandbox-runner test** (`subscription_executes_generically`): a full
  request (with the token dependency) deploys and exercises charge/cancel/
  is_active, asserting the time gate and cancellation behavior generically.
- **Component Standard tests** (`tests/data/components.test.ts`):
  `implemented/sandbox/testnet` flags, dependency metadata, constructor
  identity defaults, interface shape, and "supported parameter types only" all
  match.
- **Identity tests** (`tests/playground/subscription.test.ts`): novel
  `subscriber`/`merchant` discovery, deterministic resolution, and
  catalog-driven constructor requests.
- **Integration tests** (`tests/integration/subscription.generators.test.ts`):
  the generator yields output containing `SubscriptionClient` and
  `use subscription::SubscriptionClient;`, derived from the package.

## Architecture Review

### Files added / modified

- Added: `contracts/contracts/subscription/` (Cargo.toml, src/lib.rs,
  src/test.rs), `tests/integration/subscription.generators.test.ts`,
  `tests/playground/subscription.test.ts`, `docs/components/subscription.md`.
- Modified (tracked): `src/data/components.ts` (Subscription concept →
  implemented component), `tests/data/components.test.ts`,
  `tests/integration/generators.test.ts`, `contracts/Cargo.lock` (added the
  `subscription` package), `contracts/contracts/sandbox-runner/src/main.rs`
  (added a generic end-to-end test — no production logic change).

### F2 / parameter-type audit

`src/lib/transactions/parameter-types.ts` is **unchanged**. Subscription uses
only `Address`, `i128`, and `u32`. A repo-wide search for
`slug === "subscription"`, `switch (slug)`, `case "subscription"`,
`subscriptionIdentity*`, and hard-coded `SubscriptionClient` in platform source
found **nothing** — the only `SubscriptionClient` references are the Rust
contract's own generated client and the tests that assert generic derivation.

### Can Subscription be implemented using the existing Component Standard unchanged?

**Yes.** Adding the catalog record (with `capabilities`, `implementation`,
`interface`, `dependencies`, `constructorArgs`) makes Subscription flow through
catalog, Playground, sandbox execution, and integration generation with **no
modifications** to platform code. The only required infrastructure change was
the new contract crate and its `Cargo.lock` entry. This confirms the
architecture cleanly hosts a time-driven state machine without expanding F2.
