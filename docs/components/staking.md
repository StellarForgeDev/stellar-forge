# Staking

A single-asset staking contract for the Stellar-Forge platform. Stakers deposit a
SEP-41 asset, accrue rewards over time at a fixed rate funded by an admin, and
claim them. Rewards are proportional to each staker's share of the pool and to
the time staked.

This is the **eighth implemented component**. It follows the same
catalog-driven, component-agnostic architecture as the other components: there is
no Staking-specific code anywhere in the platform, and the entire component is
described by its catalog entry in `src/data/components.ts`.

## Purpose

`Staking` lets an admin bootstrap a reward program around a single token. The
admin funds a reward pool with `fund_rewards`; after that, every staker who
deposits the asset accrues rewards continuously at a fixed rate
(`funded amount / duration`) for as long as the reward window is active. Stakers
can leave part or all of their stake in the pool while claiming rewards at any
time.

## Scope

In scope:

- Staking and unstaking a single SEP-41 asset.
- Admin-funded, fixed-rate, time-based rewards.
- Per-staker reward accrual proportional to stake size and time.
- Claiming accrued rewards independently of unstaking.
- Read views: staked balance, earned, total staked, reward rate.

Out of scope (deliberately, to keep the MVP minimal and generic):

- Multiple reward assets or multiple staked assets.
- Lockup/cliff periods, boost multipliers, or slashing.
- Compounding auto-stake.
- Reward duration extension beyond the funded window (a new `fund_rewards`
  starts a fresh window).

## Contract design

`Staking` is implemented in Rust (`contracts/contracts/staking`) and compiled to
`wasm32v1-none`. It is built around a single SEP-41 asset that serves as **both**
the staked asset and the reward asset. The reward math uses the standard
reward-per-token accounting (the same approach used by Synthetix-style staking):

- `reward_per_token_stored` plus a continuously accruing
  `reward_rate * elapsed / total_staked`, scaled by `1e18` precision.
- Each staker tracks the `reward_per_token_paid` snapshot at their last update,
  so earned rewards are
  `balance * (reward_per_token_now - reward_per_token_paid) / 1e18 + unclaimed`.

The contract holds the staked balances and the reward reserve, and delegates all
balance movement to the asset contract via `token::Client` (transfer in/out).

### Authorization

- `__constructor`, `staked_balance`, `earned`, `total_staked`, `reward_rate`:
  no auth.
- `fund_rewards`: admin only (the admin is the asset contract's admin as
  provisioned by the dependency).
- `stake`, `unstake`, `claim`: authorized by the `from` argument
  (first-address). `unstake` and `claim` first settle accrued rewards to `from`.

### State

- `asset`: the SEP-41 asset `Address`.
- `duration`: the reward window length in seconds (`u32`).
- `reward_rate`, `period_finish`, `last_update`, `total_staked`,
  `reward_per_token_stored`: pool-wide reward accounting.
- `balances`, `rewards`, `reward_per_token_paid`: per-staker `Map<Address, i128>`.

### Errors

- `__constructor` with `duration == 0` panics.
- `stake`/`fund_rewards`/`unstake` with a non-positive `amount` panic.
- `unstake` caps the returned stake at the staker's actual balance.
- `fund_rewards` requires admin authorization.
- All balance transfers go through the asset, so insufficient balances revert at
  the asset layer.

## Catalog entry

`Staking` is registered in `src/data/components.ts` with:

- `slug: "staking"`, `category: "Tokens"`.
- `implementation`: rust package `staking`, source `contracts/contracts/staking`,
  build target `wasm32v1-none`.
- `interface`: `__constructor(asset: Address, duration: u32)`,
  `fund_rewards(from: Address, amount: i128)` (admin),
  `stake(from: Address, amount: i128)` (first-address),
  `unstake(from: Address, amount: i128)` (first-address),
  `claim(from: Address) -> i128` (first-address),
  `staked_balance(of: Address) -> i128`, `earned(of: Address) -> i128`,
  `total_staked() -> i128`, `reward_rate() -> i128`.
- `dependencies`: a single token aliased `asset`, minted with
  `mint(admin, 1000000)`.
- `constructorArgs`: `{ asset: "asset", duration: "86400" }`.
- `capabilities`: `{ implemented: true, sandbox: true, testnet: false }`.

Because the only constructor parameter types are `Address` and `u32`, Staking
fits entirely within the supported scalar parameter catalog (`Address`, `i128`,
`u32`, `String`, `Symbol`, `MuxedAddress`) and required no changes to the
parameter-type system, the transaction pipeline, or the integration generators.

## Component standard mapping

`Staking` adheres to the same Component Standard v1 contract the other
components follow:

- Constructed with `(asset, duration)`; no return value.
- Named methods (`fund_rewards`, `stake`, `unstake`, `claim`, ...).
- All public methods return a single value or nothing (no tuple or
  multi-value returns that would need `Vec`/`Map` parameter types).
- Asset balance movement delegated to a SEP-41 dependency.

## Playground integration

In the Playground, `Staking` is discovered from the catalog and executed through
the **exact same** generic executor used by every other component
(`src/lib/playground/execution.ts`). Identities (`admin`, `user1`, `asset`, ...)
are derived deterministically, and the asset dependency is provisioned and wired
through the standard dependency resolver. No Staking-specific code exists in the
Playground. A contract-level test
(`contracts/contracts/sandbox-runner/src/main.rs`,
`staking_executes_generically`) provisions the token dependency, funds rewards,
stakes through `user1`, and asserts the pool/token effects end-to-end.

## Transaction integration

`Staking` generates Soroban transactions through the same generic pipeline as
other components (`src/lib/transactions/*` and
`src/lib/integration/generators.ts`). Because it is not yet deployed to Testnet,
`capabilities.testnet` is `false` and the transaction builder keeps the network
configuration local; the generated integration examples and request payloads are
otherwise identical in shape to every other component.

## Developer integration

The Rust integration example generated for `Staking` looks like:

```rust
use soroban_sdk::{token::TokenClient, Address, Env, vec};
use staking::StakingClient;

let env = Env::default();
let asset_address = Address::generate(&env);
let asset = TokenClient::new(&env, &asset_address);
let admin = Address::generate(&env);
let alice = Address::generate(&env);
asset.mint(&admin, &1_000_000);

let contract_address = env.register(staking::WASM, (asset_address.clone(), 86400_u32));
let client = StakingClient::new(&env, &contract_address);

client.fund_rewards(&admin, &500_000);
client.stake(&alice, &100_000);
client.unstake(&alice, &50_000);
client.claim(&alice);
```

## Testing strategy

- **Contract unit tests** (`src/test.rs`): zero-duration rejection, non-positive
  stake rejection, linear reward accrual over time, pool/total accounting,
  unstake returns stake and claims rewards, claim transfers accrued rewards,
  partial unstake keeps remaining stake accruing. Run with
  `cd contracts && cargo test -p staking`.
- **Sandbox runner** (`sandbox-runner`): `staking_executes_generically` exercises
  the full generic pipeline against the built `staking.wasm`.
- **Platform tests**: `tests/playground/staking.test.ts` (catalog metadata and
  identity/constructor resolution), `tests/integration/staking.generators.test.ts`
  (generated Rust example), and `tests/data/components.test.ts` (catalog
  invariants, including a global check that every catalog interface parameter
  type is a supported parameter type).

## Architecture review

`Staking` adds no component-specific branches to the platform. The platform
remains catalog-driven: adding the new component required only a catalog entry,
a contract, its tests, and the prebuilt `staking.wasm`. The scalar-only
parameter catalog was sufficient, so `SUPPORTED_PARAMETER_TYPES`, the
transaction builders, and the integration generators were left unchanged.

## Known limitations

- Single staked and reward asset (same token).
- Reward windows are fixed at funding time; a new `fund_rewards` starts a fresh
  window and carries any leftover reward proportionally.
- No production Testnet deployment yet (`capabilities.testnet = false`).
