# Stellar-Forge Contracts

Soroban contract workspace for the Stellar-Forge reusable component
catalog. Each component in the catalog maps to a real, tested Soroban
contract in this workspace.

## Project Structure

```text
.
├── contracts
│   ├── payment
│   │   ├── src
│   │   │   ├── lib.rs             Payment contract (stateless pay primitive)
│   │   │   └── test.rs            Unit tests against a minimal SEP-41 asset
│   │   ├── Makefile              build / test / deploy-testnet targets
│   │   └── Cargo.toml
│   ├── test-asset
│   │   └── src                    Minimal SEP-41 fixture used by Payment tests
│   └── token
│       ├── src
│       │   ├── admin.rs          Admin storage helpers
│       │   ├── allowance.rs      Allowance storage helpers
│       │   ├── balance.rs        Balance storage helpers
│       │   ├── contract.rs       Token contract and SEP-41 interface
│       │   ├── lib.rs
│       │   ├── metadata.rs       Name/symbol/decimals helpers
│       │   ├── storage_types.rs  Storage keys and TTL constants
│       │   └── test.rs           Unit tests
│       ├── Makefile             build / test / deploy-testnet targets
│       └── Cargo.toml
├── Cargo.toml
└── README.md
```

## Components

The workspace currently contains 15 production catalog packages:
`access-control`, `allowance`, `atomic-swap`, `claimable-balance`, `crowdfund`,
`escrow`, `merkle-airdrop`, `multi-signature`, `oracle`, `payment`, `staking`,
`subscription`, `timelock`, `token`, and `vesting`. The workspace also contains
the non-production `sandbox-runner`, `greeter`, and `test-asset` packages; these
are excluded from the production prebuilt artifact set where appropriate.

### token

A standard fungible token contract implementing the SEP-41 token
interface (`soroban_sdk::token::TokenInterface`), following the official
[soroban-examples token
pattern](https://github.com/stellar/soroban-examples/tree/main/token).

Exported functions:

- `__constructor(admin, decimal, name, symbol)` — deploys and initializes
  the token (decimals must be ≤ 18)
- `name`, `symbol`, `decimals` — token metadata
- `balance(id)` — balance of any address (0 when unset)
- `transfer(from, to, amount)` — authorized transfer to a destination
  address (an ordinary account G-address, or a muxed address), authorized by
  `from`. The Stellar token interface encodes the destination as a
  `MuxedAddress`, so the web and integration tooling wrap a plain account
  address into a muxed address automatically.
- `allowance`, `approve`, `transfer_from` — spender allowances
- `burn`, `burn_from` — balance destruction
- `mint(to, amount)` — admin-only supply creation
- `set_admin(new_admin)` — admin rotation (emits a custom `SetAdmin` event)

Storage follows the official pattern: metadata and admin in instance
storage, balances in persistent storage with TTL bumps, allowances in
temporary storage.

### payment

A stateless payment primitive (`pay(from, to, asset, amount)`). It holds no
storage of its own: the balance movement happens inside the `asset` contract,
which Payment invokes through the standard SEP-41 token interface. This makes
Payment a clean, dependency-free contract whose only external coupling is
whatever SEP-41 contract the caller passes as `asset` at invocation time.

Exported functions:

- `__constructor()` — stateless init; takes no arguments.
- `pay(from, to, asset, amount)` — transfers `amount` of `asset` from `from`
  to `to`, authorized by `from`. A negative `amount` is rejected; any failure
  from the underlying asset `transfer` propagates unchanged. The web and
  integration tooling wrap the plain account addresses (`from`, `to`) into
  muxed addresses exactly as for `token.transfer`.

### test-asset

A minimal SEP-41 token used only as a fixture for `payment`'s Rust unit
tests. It is **not** a catalog component and is excluded from the wasm build
pipeline (`scripts/sandbox-build.mjs`).

## Commands

Build all contract WASM artifacts:

```bash
stellar contract build
```

Build a single contract:

```bash
stellar contract build --package token
```

Run the unit tests (requires the `wasm32v1-none` target):

```bash
cargo test
```

Format:

```bash
cargo fmt --all
```

The resulting WASM is written to `target/wasm32v1-none/release/`.

## Testnet Deployment

The `token` and `payment` contracts can both be deployed to Stellar Testnet.
Deployment uses the Stellar CLI only; no credentials live in this repository.

One-time identity setup (stored in the CLI config directory, outside this
repo):

```bash
stellar keys generate deployer --fund --network testnet
```

### token

Deploy (builds, then creates a new token contract instance with decimals 7,
name "Forge Token", symbol "FORGE", admin = deployer):

```bash
make -C contracts/contracts/token deploy-testnet
```

The command prints the new contract id (`C...`). Register it in
`src/lib/transactions/deployments.ts` under `testnet` / `token` (the registry
validates contract ids before they are used). Re-running the target deploys a
fresh instance with a new id.

### payment

Payment's constructor takes no arguments, so deployment is a single step:

```bash
make -C contracts/contracts/payment deploy-testnet
```

The command prints the new contract id (`C...`). Register it in
`src/lib/transactions/deployments.ts` under `testnet` / `payment`.

At invocation time, `pay` needs a SEP-41 `asset` contract. Reuse the existing
deployed `token` contract (the address already registered under `testnet` /
`token`) as the `asset` argument — there is no need to deploy a second asset
contract. Any other SEP-41-compatible contract address works equally well.

Re-running the target deploys a fresh instance with a new id.
