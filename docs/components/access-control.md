# Access Control Component Specification

> Status: **Implemented (v1), sandbox-ready; NOT deployed to Stellar Testnet.**
> The Access Control contract lives in `contracts/contracts/access-control`, builds
> for `wasm32v1-none`, is registered in the catalog as
> `implemented: true, sandbox: true, testnet: false`, runs in the local Playground
> sandbox (with no dependencies), and ships with a passing Rust test suite plus a
> sandbox execution proof.
>
> Access Control is the **fourth** component built on the Component Standard
> (after `token`, `payment`, and `escrow`) and the first to use a `Symbol`
> argument type (`role`) end-to-end through the generic pipeline. It was added to
> confirm that the platform is generic: the work required was a catalog record,
> contract code, and a WASM artifact — **no** Access-Control-specific branching
> anywhere in `src` or the sandbox-runner.
>
> `testnet` stays `false` because no real Testnet deployment exists; Access
> Control is correctly excluded from Testnet transactions until a deployment
> address is registered in `src/lib/transactions/deployments.ts`.

## Purpose

Give developers a small, reusable Soroban component that centralizes
authorization behind a single admin identity. The admin grants and revokes
`(role, account)` pairs and can transfer administration to a new address. Any
caller can read whether an account holds a role. Access Control is a
stress-test of the Component Standard's `Symbol` argument type and its `admin`
authorization model: it must work through the existing catalog → Playground →
sandbox → integration pipeline **without** any component-specific code.

## Problem

Stellar-Forge could deploy/mint/transfer a token (`token`), move an asset
(`payment`), and hold an asset between parties (`escrow`), but it had no
*authorization primitive*: "let the admin decide which addresses may call
operation X." That pattern underlies gated contracts, admin-only controls, and
role-based access. Access Control closes that gap while proving the platform
supports a `Symbol`-typed argument and the existing `admin` authorization kind.

## Scope

Access Control v1 covers exactly:

- A single **admin** who controls the contract.
- **Roles** expressed as Soroban `Symbol` values.
- **grant_role** — admin adds an account to a role.
- **revoke_role** — admin removes an account from a role.
- **has_role** — read-only query of role membership.
- **transfer_admin** — admin transfers administration to a new address.

## Non-goals

Access Control v1 does **not** include:

- Role hierarchies or role inheritance.
- Multiple distinct administrators (a single admin only).
- Timelocks, delays, or voting.
- Multisig or quorum approvals.
- Access-control *dependencies* (it has no dependency).
- A custom `addressParam` authorization kind.
- Mainnet support (Testnet eventually).

These belong to future extensions (see *Future Extensions*).

## Interface

Access Control is a **stateful** contract. It stores the admin and a set of
`(role, account)` grants in instance storage.

| Method           | Parameters                          | Returns | Purpose                                          |
| ---------------- | ----------------------------------- | ------- | ------------------------------------------------ |
| `__constructor`  | `admin: Address`                    | `()`    | Store the initial admin.                         |
| `grant_role`     | `role: Symbol`, `account: Address`  | `()`    | Add `account` to `role`. Admin-only.            |
| `revoke_role`    | `role: Symbol`, `account: Address`  | `()`    | Remove `account` from `role`. Admin-only.       |
| `has_role`       | `role: Symbol`, `account: Address`  | `bool`  | Whether `account` currently holds `role`.       |
| `transfer_admin` | `new_admin: Address`                | `()`    | Move administration to `new_admin`. Admin-only. |

**Parameter note (important for authorization):** `role` is a `Symbol`. The
catalog declares it `type: "Symbol"`, which the Playground API validates as a
bounded string (≤ 32 characters) and the sandbox-runner converts to a Soroban
`Symbol` via `Symbol::new`. The generic `admin` authorization model resolves the
correct signer: `grant_role`/`revoke_role`/`transfer_admin` are declared
`authorization: "admin"` (the contract administrator's identity), and `has_role`
is declared `authorization: "none"` (read-only). **No `addressParam` / custom
auth kind was added** — the existing `admin` model already expresses "the
contract admin must sign," which is exactly the semantics Access Control needs.

## Data Types

| Field     | Type      | Meaning                                          |
| --------- | --------- | ------------------------------------------------ |
| `admin`   | `Address` | The current administrator.                       |
| `role`    | `Symbol`  | A role identifier (e.g. `"minter"`, `"burner"`). |
| `account` | `Address` | An address being granted/queried for a role.     |

State is stored as `Map<(Symbol, Address), bool>` keyed by `(role, account)`,
plus a single `admin` `Address`. `has_role` returns `false` for any missing
grant. The storage is internal to the contract; the platform remains unaware of it.

## Authorization

- `__constructor` stores the admin; no auth is required at deploy time (the
  deployer is irrelevant to the trust model, and the runner mocks constructor
  auth like every other component).
- `grant_role` / `revoke_role` / `transfer_admin` call
  `Self::admin(e).require_auth()` **before** mutating state.
- `has_role` performs no authorization check — anyone may query.
- In the catalog `interface`, each of `grant_role`/`revoke_role`/`transfer_admin`
  is declared `authorization: "admin"`, which maps to the contract
  administrator's identity. **No `addressParam` / custom auth kind was added** —
  the existing `admin` model already expresses "the contract admin must sign,"
  which is exactly the semantics Access Control needs. The audit's S6 proposal
  (`addressParam`) is therefore **deferred**: Access Control proves it is
  unnecessary.

## Asset Model

Access Control has no asset and no dependency. It operates purely on addresses
and `Symbol` roles, so the generic dependency-provisioning machinery is simply
not exercised (and needs no change). This is the simplest possible component
shape after a stateless one like `payment`.

## Errors

Access Control surfaces errors through `require_auth` (auth failure) and the
host. It does not invent its own error enumeration; it relies on Soroban/SDK
panics for the auth gate and benign storage semantics for grants/revokes.

## State

Access Control is **stateful**. It stores, in instance storage:

| Key       | Type      | Meaning                       |
| --------- | --------- | ----------------------------- |
| `admin`   | `Address` | Configured administrator.     |
| `roles`   | `Map<(Symbol, Address), bool>` | Role grants. |

There is no TTL/bump logic of its own (instance storage TTL is managed by the SDK
defaults). This is the minimum storage needed to be a correct, reusable access
control contract and stays contained in the contract — the platform is unaware of
it.

## Component Standard Mapping

In `src/data/components.ts`, Access Control is added as a `StellarComponent`
record:

- `implemented: true` — a real contract lives in `contracts/contracts/access-control`.
- `sandbox: true` — its WASM runs in the local sandbox-runner.
- `testnet: false` — no deployment address is registered in
  `src/lib/transactions/deployments.ts`, so Access Control is excluded from
  Testnet transactions.
- `constructorArgs` — catalog-driven defaults for the primary constructor:
  `{ admin: "admin" }`. The value references the `admin` identity name, which
  resolves to a sandbox address. This keeps constructor defaults **data-driven**
  so the generic execution layer never assumes a Token-shaped `"admin"` default.
- No `dependencies` — Access Control needs none.

`componentMaturity()` reports `Implemented` (since `implemented: true`). The
platform must not advertise Testnet availability it cannot honor — Access
Control's `testnet` flag stays `false` until a real deployment is registered.

## Platform changes required (none)

Access Control required **zero** generic platform enhancements. The `Symbol`
argument type, the `admin` authorization kind, the catalog-driven
`constructorArgs`, the config system (`text` name + `network` select), the
dependency system (unused), the sandbox/API path, and the integration generator
were all already generic and sufficient. No change was needed to
`validate.ts`, `builder.ts`, `args.ts`, `route.ts`, `execution.ts`,
`generators.ts`, `rpc.ts`, `submit.ts`, `freighter.ts`, the Playground UI, or
the sandbox-runner execution engine — they are already generic over
`interface`, `config`, `constructorArgs`, and `capabilities`.

## Playground Integration

The Playground discovers Access Control purely from its catalog record:

- `config` renders the config form (`name` text + `network` select). Access
  Control has no Token-shaped `symbol`/`decimals` config, so `buildConstructorRequest`
  returns only `name`/`network` from config.
- `__constructor` is exposed via `interface`, so `buildConstructorRequest` seeds
  `admin` from the `constructorArgs` identity name `admin`. `execution.ts`
  (`defaultArgValue`, `signerFor`, `callRequestFor`, `authorizationSummary`) then
  work generically for `grant_role`/`revoke_role`/`transfer_admin` (admin signer)
  and `has_role` (no signer).
- The sandbox-runner deploys the Access Control WASM (with the constructor args)
  and invokes the methods. Because the execution path is generic, the runner
  needs no Access Control branch. The `role` `Symbol` argument is converted by
  the existing `"Symbol"` type handler in both the API route and the runner.

## Transaction Integration

Access Control reuses the existing Testnet flow — *when enabled*. Because
`testnet` is `false`, `validateTransactionRequest` already excludes it from
`/api/transactions/prepare`. The moment a deployment address is registered in
`deployments.ts` and `testnet` is flipped to `true`, the same builder → prepare →
sign → submit pipeline will work for `grant_role`/`revoke_role`/`has_role`/
`transfer_admin` with **no** code change (the signer for the admin-only methods
is the `admin` identity per the catalog `authorization` field).

## Developer Integration

`generateRustIntegration` reads Access Control's `interface` and emits a
compilable example: deploy the WASM with the `admin` constructor argument, then
call `access_control_client.grant_role(&role, &account)`, etc. Because the
generator is driven entirely by `interface`/`config`/`constructorArgs`, it needs
no Access Control-specific code. The generated `Symbol` import and
`Symbol::new(env, "value")` argument appear automatically because the `role`
parameter's catalog type is `"Symbol"`.

## Testing Strategy

- **Rust contract tests** (`contracts/contracts/access-control/src/test.rs`): 12
  tests covering constructor storage, admin grant, role membership, admin
  revoke, non-admin rejection (grant/revoke/transfer), admin transfer, new-admin
  actions after transfer, old-admin loss of privileges after transfer, and
  multiple accounts/roles.
- **Sandbox execution proof** (`contracts/contracts/sandbox-runner/src/main.rs`,
  `access_control_executes_generically`): deploys Access Control with the `admin`
  identity, grants a role, asserts `has_role == true`, revokes it, asserts
  `has_role == false`, transfers admin, and asserts the new admin can still grant.
  This is the end-to-end execution proof that the generic runner serves a
  `Symbol`-typed, admin-authorized, dependency-free component with no branching.
- **Catalog tests** (`tests/data/components.test.ts`): `implemented/sandbox/
  testnet` flags match the declared progression; `componentMaturity` =
  `Implemented`; `constructorArgs` and the interface are asserted; Access Control
  is removed from `CONCEPT_SLUGS` (it is no longer a *concept*); the
  `componentWasmPath` concept case moved to `subscription`.
- **Playground tests** (`tests/playground/access-control.test.ts`):
  `buildConstructorRequest` resolves the `admin` identity; `signerFor`/
  `callRequestFor` behave per method (admin signer for writes, none for
  `has_role`).
- **Integration tests** (`tests/integration/access-control.generators.test.ts`):
  `generateRustIntegration` for Access Control yields output containing
  `AccessControlClient`, derives the client from the package name, and handles
  the `Symbol` role parameter generically.
- **Transaction-readiness tests** (`tests/transactions/access-control-readiness.test.ts`):
  confirms Access Control is `implemented` + `sandbox` but excluded from the
  Testnet transaction component list (`testnet: false`).
- **Sandbox-runner tests** (`cargo test -p sandbox-runner`): the access control
  execution proof above, plus the existing token/payment/escrow proofs.

## Future Extensions

Possible later capabilities, **explicitly excluded from v1**:

- Role hierarchies / inheritance
- Multiple administrators
- Timelocks, delays, or voting
- Multisig / quorum approvals
- Access-control dependencies
- A custom `addressParam` authorization kind (deferred; not required by v1)
- Testnet deployment (gated on registering an address in `deployments.ts`)

## Architecture Review

### Files added / changed

- `contracts/contracts/access-control/` — `Cargo.toml`, `src/lib.rs`,
  `src/test.rs`, `Makefile` (mirrors `payment`/`escrow`; builds for
  `wasm32v1-none`).
- `contracts/prebuilt/access-control.wasm` — committed artifact (the build
  script auto-discovers `access-control` via the workspace members glob; no
  script or workspace edit required). Note: Cargo emits the local artifact as
  `access_control.wasm` (hyphen → underscore), which `componentWasmPath` already
  resolves; the committed prebuilt copy is named `access-control.wasm` to match
  the package name used by `resolveWasm`'s prebuilt fallback.
- `src/data/components.ts` — replaced the Access Control *concept* block with an
  *implemented* record (`implementation`, `interface`, `constructorArgs`,
  `config`, `capabilities`).
- `contracts/contracts/sandbox-runner/src/main.rs` — added
  `access_control_executes_generically`.
- `tests/...` — catalog, playground, integration, and transaction-readiness
  tests for Access Control.

### Token / Payment / Escrow / Access-Control-specific assumptions discovered

**None in logic.** A full-tree search for `access-control`, `escrow`, `payment`,
and `token` across `src/app` and `src/lib` found *no* behavioral references —
only the catalog records (data). No `if component === "access-control"`, no
special-casing in the builder, validator, argument converter, integration
generator, playground helpers, or API routes. Access Control's `Symbol` role,
admin authorization, and dependency-free shape are all expressed through the
existing Component Standard and executed by the generic runner.

### Architectural changes introduced

1. **None.** Access Control required no generic platform change. The `Symbol`
   argument type, `admin` authorization kind, `constructorArgs` field,
   config system, dependency system, sandbox/API path, and integration generator
   were all already generic and sufficient. Audit item **S6** (`addressParam`) is
   therefore *deferred* — it would be speculative and is not needed.
2. **No new config field types.** Access Control needs only `text` (`name`) and
   the existing `network` select. Audit item **S1** (`address`/`boolean`
   `ConfigFieldType`) is *deferred* — not required by Access Control.

### Can Access Control be implemented using the existing Component Standard unchanged?

**Yes — with no generic enhancements at all.** Adding the `StellarComponent`
record (with `capabilities`, `implementation`, `interface`, `constructorArgs`,
and `config`) makes Access Control flow through catalog, Playground, sandbox
execution, transaction builder (when Testnet-enabled), prepare/submit, and
integration generation with **no** modifications to the platform's behavioral
code. This further validates the Component Ecosystem v1 thesis: the platform is
generic, and a fourth, differently-shaped component (stateful, `Symbol`-typed,
admin-authorized, dependency-free) required no component-specific branching.

### Risks / unanswered questions

- **Testnet deployment:** `testnet` must remain `false` until a real deployment
  is registered in `deployments.ts`; the CI/process should not flip it
  speculatively. The local sandbox proof already covers execution correctness.
- **Symbol length:** `role` is a Soroban `Symbol` (≤ 32 characters). The API
  route enforces this bound (`MAX_SYMBOL_LENGTH = 32`); callers must supply
  role names within that limit.
