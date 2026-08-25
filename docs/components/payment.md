# Payment Component Specification

> Status: **Implemented (v1), sandbox-ready, Testnet-not-yet-deployed.**
> The Payment contract lives in `contracts/contracts/payment`, builds for
> `wasm32v1-none`, is registered in the catalog as
> `implemented: true, sandbox: true, testnet: false`, runs in the local
> Playground sandbox (with its token dependency provisioned generically), and
> ships with a passing Rust test suite.
>
> The generic transaction machinery is already Testnet-ready for Payment: once a
> real deployment address is registered in `src/lib/transactions/deployments.ts`
> and `capabilities.testnet` is flipped to `true`, the existing
> builder/validate/prepare/submit flow discovers `pay` automatically with **no**
> component-specific code. The actual deployment is a manual step (Stellar CLI +
> a funded `deployer` identity) that has **not** been performed in this
> environment, so `testnet` remains `false` and Payment is correctly excluded
> from Testnet transactions until the address exists.

## Purpose

Give developers a small, reusable Soroban component that performs the single
most common Stellar action: **move a Stellar asset from one account to another**.
Payment is the first component added after `token` and is intentionally a
stress-test of the Component Standard — it must work through the existing
catalog → Playground → transaction → integration pipeline **without** any
Token-specific code.

## Problem

Today Stellar-Forge can deploy, mint, and transfer a *token it owns*, but it has
no general "send an asset to someone" primitive. A developer who already holds
an asset (any SEP-41 token, including native XLM via its Stellar Asset Contract)
cannot express "pay Alice 10 USDC" as a first-class, testable, integrable
building block. Payment closes that gap.

## Scope

Payment v1 covers exactly:

- `from` — the sender (authorizing account)
- `to` — the recipient
- `asset` — the token/asset contract being moved
- `amount` — the quantity to move

It executes a transfer of the named asset and reports success/failure.

## Non-goals

Payment v1 does **not** include:

- Recurring payments, subscriptions, or schedules
- Payment requests / invoices / pull payments
- Escrow or multi-party release conditions
- Fee skimming or intermediary routing
- On-ledger memos, metadata, or receipts beyond the transfer event
- A built-in asset registry or price oracle
- Mainnet support (Testnet-only, eventually)

These belong to future extensions (see *Future Extensions*).

## Interface

Payment is a thin, **stateless** orchestration contract. It delegates the actual
balance movement to the asset's own SEP-41 token contract.

| Method        | Parameters                                       | Returns | Purpose                                                        |
| ------------- | ------------------------------------------------ | ------- | -------------------------------------------------------------- |
| `__constructor` | —                                              | —       | Stateless init; takes no arguments.                            |
| `pay`         | `from: Address`, `to: Address`, `asset: Address`, `amount: i128` | `()` | Transfer `amount` of `asset` from `from` to `to`, authorized by `from`. |

**Parameter ordering note (important):** `from` is placed *before* `asset` so
that the existing generic authorization heuristic in
`src/lib/transactions/builder.ts` (`authorizationInfo`) — which treats the
*first* `Address`/`MuxedAddress` parameter as the signing address — correctly
identifies `from` as the required signer. This keeps Payment compatible with the
Component Standard without modifying transaction logic.

## Data Types

| Field   | Type      | Meaning                                                                 |
| ------- | --------- | ----------------------------------------------------------------------- |
| `from`  | `Address` | Sender. Must authorize the call. May be a normal `G…` account address.  |
| `to`    | `Address` | Recipient. Any Stellar `Address` (account or contract).                 |
| `asset` | `Address` | Contract address of a SEP-41 token (the asset being transferred).      |
| `amount`| `i128`    | Non-negative integer quantity, in the asset's smallest unit.           |

Return type `()` (void). The transfer result is observable via the asset
contract's own `Transfer` event and the recipient's resulting balance.

## Authorization

- `pay` calls `from.require_auth()` **before** invoking the asset, then delegates
  to `asset.transfer(from, to, amount)`.
- The asset's `transfer` re-checks `from.require_auth()`; because Payment is
  reached via a single invocation tree, authorizing the top-level `pay` call
  satisfies the inner check. This is the standard Soroban cross-contract auth
  pattern already used by `transfer_from`.
- In the catalog `interface`, `pay` is declared `authorization: "first-address"`,
  which (given the parameter ordering above) maps to `from`. No admin role exists
  in Payment v1.

## Asset Model

A "Stellar asset" is represented generically as an **`Address`** pointing to a
contract that implements `soroban_sdk::token::TokenInterface` (SEP-41):

- A custom token (e.g. a Stellar-Forge `token` deployment) → its contract address.
- Native XLM → its Stellar Asset Contract (SAC) address.

Payment imposes no asset-specific logic; it only requires the target to expose
`transfer`. This deliberately composes with the existing `token` component rather
than duplicating token behavior.

### Which asset on Testnet

On Testnet there is no automatic dependency provisioning (that is a sandbox-only
feature). The `asset` argument is supplied at invocation time by the caller. The
simplest legitimate choice is to **reuse the existing deployed `token` contract**
(already registered in `deployments.ts` under `testnet` / `token`) as the
`asset` — there is no need to deploy a second asset contract. Any other
SEP-41-compatible contract address works equally well. This is a per-transaction
input, not a hardcoded linkage, so it stays generic.

## Errors

Payment v1 surfaces errors mostly through the delegated token call, plus a
minimal local guard:

- `negative amount is not allowed` — Payment (and the token) panic on `amount < 0`.
- `insufficient balance` — propagated from `asset.transfer` when `from` lacks funds.
- `auth failed` — when `from` does not authorize (including the on-chain reject
  during simulation/submission).
- `invalid asset` — when `asset` does not implement `TokenInterface` (the
  `TokenClient` call fails).

Payment does not invent its own error enumeration; it relies on Soroban/SDK
panics and the asset contract's errors so behavior stays consistent.

## State

**None.** Payment is stateless:

- No instance storage (no `DataKey`, no `Balance`, no `Admin`).
- No constructor arguments.
- No TTL/bump logic of its own.

This is the smallest possible contract that still satisfies the requirement and
keeps Payment reusable across any asset. State lives in the asset contract,
where it belongs. (If a future variant pins a default asset via constructor,
that would introduce storage — explicitly out of scope for v1.)

## Component Standard Mapping

In `src/data/components.ts`, Payment is added as a `StellarComponent` record:

- `implemented: true` — a real contract lives in `contracts/contracts/payment`.
- `sandbox: true` — its WASM runs in the local sandbox-runner.
- `testnet: false` for the first landing, then `true` **only after** a deployment
  address is registered in `src/lib/transactions/deployments.ts`.

`componentMaturity()` will report `Implemented` (since `implemented: true`).
The rollback to `testnet: false` until a real deployment exists is intentional:
the platform must not advertise Testnet availability it cannot honor.

## Playground Integration

The Playground discovers Payment purely from its catalog record:

- `config` (e.g. a `network` select, mirrored from `token`) renders the config
  form. Payment has no constructor, so `buildConstructorRequest` returns `{}`.
- `interface` exposes `pay`, so the call builder shows `from`, `to`, `asset`,
  `amount` fields. `parameterPlaceholder` already supplies `G…` for `Address` and
  `1000000` for `i128`.
- `execution.ts` (`defaultArgValue`, `signerFor`, `callRequestFor`) work
  generically: `from` is the `first-address` signer; `defaultArgValue` seeds it
  with the `admin` identity in the sandbox, and seeds `asset` with its dependency
  alias when one matches by name.
- The sandbox-runner deploys the Payment WASM and invokes `pay`. Payment declares
  a **generic dependency** (`dependencies: [{ alias: "asset", package: "token",
  setup: [{ fn: "mint", args: ["admin","1000000"], signer: "admin" }] }]`) in its
  catalog record. The Playground API resolves that into a runner `dependencies`
  entry; the runner deploys the token, records `asset → <address>` in its identity
  map, seeds the balance via the setup call, and resolves `pay`'s `asset` argument
  to the deployed token. **No Token-specific branch exists** — the runner treats
  every dependency identically, driven entirely by request data. See
  *Architecture Review*.

## Transaction Integration

Payment reuses the existing Testnet flow unchanged:

1. Builder → `pay(from, to, asset, amount)` (same `TransactionBuilder` UI).
2. `POST /api/transactions/prepare` validates via `validateTransactionRequest`
   (checks `capabilities.testnet`, method exists in `interface`, param types),
   looks up Payment's address in `deployments.ts`, converts args via
   `buildInvocationArgs`, and simulates against Testnet RPC.
3. Freighter signs; the signer must be `from` (first-address).
4. `POST /api/transactions/submit` relays the signed XDR.

No change to `validate.ts`, `builder.ts`, `args.ts`, `rpc.ts`, `submit.ts`, or
`freighter.ts` is required — they are already generic over `interface` and
`capabilities`.

## Developer Integration

`generateRustIntegration` reads Payment's `interface` and emits a compilable
example: deploy the Payment WASM, then call
`payment_client.pay(&from, &to, &asset, &amount_i128)`. Because the generator is
driven entirely by `interface`/`config`, it needs no Payment-specific code. (A
minor cosmetic improvement: its placeholder heuristic maps any non-`to`/`spender`
`Address` param to `&alice`; for `asset` that is syntactically valid but
semantically "an address" — acceptable for a starting-point example.)

## Testing Strategy

- **Rust contract tests** (`contracts/contracts/payment/src/test.rs`):
  - `pay` moves the correct amount from `from` to `to` (verify recipient balance).
  - `pay` with `amount < 0` panics.
  - `pay` without `from` auth fails (`mock_auths` / missing auth).
  - `pay` with an underfunded `from` surfaces the token's balance error.
  - Integration-style test deploying a token + Payment in one `Env` and calling
    `pay` (doubles as the local-execution contract test).
- **Component Standard tests** (`tests/data`): `implemented/sandbox/testnet`
  flags match the declared progression; `componentMaturity` = `Implemented`;
  `transactionComponents` includes Payment only once `testnet: true`.
- **Sandbox tests** (`cargo test` on `sandbox-runner` + a Playground request
  fixture): a `pay` request against a deployed token executes and returns the
  transfer result deterministically.
- **Integration tests** (`tests/integration`): `generateRustIntegration` for
  Payment yields output containing `pay` and a `PaymentClient` call; the snippet
  compiles against the Payment interface.
- **Eventual Testnet smoke test** (manual / gated — not yet performed): the
  concrete procedure, requiring a funded `deployer` identity (never stored in
  this repo):

  1. `make -C contracts/contracts/payment deploy-testnet` → prints `C...`.
  2. Add `{ network: "testnet", componentSlug: "payment", address: "C..." }` to
     `DEPLOYMENTS` in `src/lib/transactions/deployments.ts`.
  3. Set `capabilities.testnet: true` on the Payment catalog record.
  4. In the Transaction Builder, pick Payment → `pay`, use the deployed `token`
     address as `asset`, fund `from`/`to` accounts (Friendbot), sign with
     `from`, submit, and confirm the asset balance moved.

  Steps 1–2 are the only ones requiring credentials/signing; steps 3–4 reuse the
  existing generic flow. Until a real address from step 1 exists, `testnet`
  stays `false` and the smoke test is intentionally not run.

## Future Extensions

Possible later capabilities, **explicitly excluded from v1**:

- Recurring / scheduled payments
- Payment requests / pull (allowance-based) payments
- Escrow and conditional multi-party release
- Subscriptions
- Fee / intermediary routing
- Memo / metadata / off-chain receipt attachment
- Muxed `to` destination (v1 uses `Address`; `MuxedAddress` is supported by the
  platform and can be adopted later)

## Architecture Review

### Files inspected

- `ARCHITECTURE.md`, `ROADMAP.md`, `CONTRIBUTING.md`
- `src/data/components.ts` (catalog + capability model)
- `src/lib/transactions/{validate,builder,args,deployments}.ts`
- `src/lib/integration/generators.ts`
- `src/lib/playground/{execution,artifacts}.ts`
- `src/app/api/transactions/{prepare,submit}` and `src/app/api/playground`
- `contracts/contracts/token/src/{contract,storage_types,test}.rs` (reference
  contract + test conventions)
- `contracts/contracts/sandbox-runner` (execution engine)
- Existing Vitest suites under `tests/`

### Token-specific assumptions discovered

**None in logic.** A full-tree search for `token` across `src/app` and
`src/lib` found only:

- `src/data/components.ts` — the `token` catalog record (data, expected).
- `src/lib/transactions/deployments.ts` — a `{network, slug} → address` registry
  entry for `token` (data, and *exactly* the mechanism Payment will extend with
  its own entry when Testnet-ready).

No `if component === "token"`, no special-casing in the builder, validator,
argument converter, integration generator, playground helpers, or API routes.
The integration generator derives client names from `implementation.package`
(`token` → `TokenClient`), so Payment (`payment`) naturally yields
`PaymentClient`. The architectural principle "Avoid Token-specific abstractions"
(ARCHITECTURE.md §10) is already honored.

### Architectural changes recommended before implementation

1. **None required for the component itself or the web/transaction/integration
   layers.** Payment is expressible entirely through the existing Component
   Standard (`capabilities` + `interface` + `implementation`).
2. **Parameter ordering (`from` before `asset`)** is a deliberate,
   zero-code-change decision so the generic `first-address` authorization
   heuristic resolves to the correct signer. If a future designer reorders
   params, they should revisit `authorizationInfo`.
3. **Sandbox-runner auxiliary contract support (recommended, generic):** to run
   `pay` locally, the runner must be able to deploy an asset contract into the
   same `Env` that backs `asset`. This is a general runner capability (deploy a
   named auxiliary contract by package/wasm) and benefits any component that
   composes with another — not a Payment/Tool-specific hack. This is the only
   substantive prerequisite for *local* Payment execution; the Testnet flow needs
   no such change.
4. **Optional polish (non-blocking):** the integration generator's `placeholderArg`
   heuristic could special-case an `asset`/`token` param name, but its current
   `&alice` fallback is valid and sufficient for a copy-paste example.

### Can Payment be implemented using the existing Component Standard unchanged?

**Yes.** Adding a `StellarComponent` record (with `capabilities`,
`implementation`, and an `interface` exposing `pay`) makes Payment flow through
catalog, Playground, transaction builder, prepare/submit, and integration
generation with **no modifications** to the platform code. The only additions are
a contract in `contracts/`, the catalog record, (later) a `deployments.ts` entry,
and per-component tests — exactly the pipeline Component Standard v1 was designed
to support.

### Risks / unanswered questions

- **Local asset for sandbox `pay`:** how the Playground obtains a valid `asset`
  address during local runs (deploy a token in-sandbox vs. requiring the caller
  to supply one). Resolved by the generic runner enhancement above; the precise
  UX (auto-deploy a demo token vs. user-provided address) is a product decision
  for the implementation step, not a blocker.
- **`to` as `Address` vs `MuxedAddress`:** v1 keeps `Address` for simplicity;
  the platform already supports `MuxedAddress` if later alignment with `token`'s
  muxed destination is desired.
- **Native XLM via SAC:** confirmed possible (pass the SAC address as `asset`),
  but the local sandbox needs that contract deployed too — same auxiliary-contract
  concern as above.
- **`testnet: true` gating:** must remain `false` until a real deployment is
  registered; the CI/process should not flip it speculatively.
