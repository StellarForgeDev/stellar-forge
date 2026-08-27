> ## Historical audit notice
>
> This document records the **Phase 7 full product audit** of Stellar-Forge. It
> is a **historical snapshot** of the project state at that point in time.
>
> Subsequent work (Phases 8–20, through the current release candidate) has
> addressed, changed, or superseded a number of the findings below — for
> example, the transaction system was completed, the `Token` and `Payment`
> contracts were deployed to Stellar Testnet, all eight catalog components are
> now implemented and sandbox-executable, a web test suite and CI were added, the
> Playground/Vercel build path was added, and several reported bugs were
> remediated.
>
> **Status as of Phase 20 (2026-08-27):** eight components are implemented
> (Token, Payment, Access Control, Escrow, Multi-signature, Subscription,
> Vesting, Staking); Token and Payment are deployed to Testnet; a web test
> suite (`pnpm test`) and CI exist. Sections below that describe "1 of N
> components", "no app tests", or "no CI" reflect the Phase 7 state and no
> longer apply. The original findings, bug IDs, and reasoning are retained
> below as historical context.
>
> **Do not treat this report as the current release status.** For the current
> project state, capabilities, and limitations, consult `README.md` and the
> repository itself. The original findings, bug IDs, and reasoning are retained
> below as historical context.

# Phase 7 — Full Product Audit Report

**Date:** 2026-08-20
**Scope:** Landing, Components, Docs, Playground, Transactions, Wallet, Simulation, Signing, Submission, Errors, Reset/Retry, Security, Vercel/production readiness.
**Method:** Full source review + live tests against the running dev server (localhost:3000) and real Stellar Testnet RPC. A throwaway friendbot-funded testnet account was used to reproduce the reported bug, run read-only and state-changing simulations, submit a real signed transaction (confirmed `SUCCESS`, hash `834107b9a5d271f75ccdee1ff633c175233a509685ee3d3ae8d58bd29af79e4a`), exercise every API route including adversarial inputs, build the production bundle, and run the Phase-6 generic sandbox runner against the Greeter contract.
**Constraints honored:** No files were modified by the audit; nothing was committed.

---

## 1. Critical blockers

### B1. The reported bug — newly connected Freighter accounts always fail with `source-account-not-found` — is caused by an artificial app-side gate, not the network.

`src/lib/transactions/rpc.ts:57-68` calls `server.getAccount(source)` before every simulation and treats a 404 as a hard failure. Verified against real testnet: **Soroban RPC simulation succeeds fine with a never-funded source** for both read-only calls (`name()` → returned `"Forge Token"`) and state-changing calls (`mint()` → returned a valid auth entry). A fresh Freighter account is just a locally generated keypair with no ledger entry until funded, so `getAccount` 404s and the user is blocked before doing anything — even a harmless read-only query.

Fix: build the simulation envelope with a placeholder account (`new Account(source, "0")` or the sequence from the RPC result) and skip `getAccount` entirely for simulation; only require a funded account at *submission*.

### B2. The Playground sandbox is not shippable beyond a Windows dev machine.

`src/app/api/playground/route.ts:22-29` resolves `contracts/target/debug/sandbox-runner.exe` (a **Windows debug binary**) via `process.cwd()`. That path is gitignored (`contracts/.gitignore` → `target`), so a fresh clone has no runner (route returns 503), and Vercel/Linux workers can never execute a `.exe` regardless. The flagship "real WASM execution" feature is effectively local-only.

Fix: Linux build of `sandbox-runner`, committed artifacts (or a build step + bundling into the serverless function), and a platform-agnostic path.

### B3. Out-of-range `i128` crashes the prepare route with an HTTP 500.

`src/lib/transactions/validate.ts:115-116` checks only the integer *pattern* (no i128 range), and `src/lib/transactions/args.ts:54-55` lets `nativeToScVal(BigInt(raw), {type:"i128"})` throw. Reproduced live: `amount = 1e40` → server log `RangeError: bigint value … for i128 out of range` → HTTP 500, and the client shows the misleading "The preparation service could not be reached" (`client.ts:117`).

Fix: add an i128 min/max range check in validation and/or wrap the conversion in `try/catch` returning `parameter-invalid-value`.

---

## 2. Important UX problems

- **U1. Testnet funding is not discoverable anywhere.** The exact failure users hit ("Source account … was not found on Stellar Testnet. Fund it before preparing a transaction.") ends with no path forward: no Friendbot link/button, no faucet mention, no docs. Fix: on `source-account-not-found`, render a testnet-only "Fund with Friendbot" action (`POST https://friendbot.stellar.org?addr=G…` returns 200, verified) and document the faucet in the Docs hub. Freighter itself can also fund accounts.
- **U2. The UI does not adequately explain simulation vs signing vs submission.** The page intro is purely mechanical; the only semantic text is a preview footer paragraph. No framing that simulation is free/changes nothing, signing authorizes the exact envelope on screen, and **submission is irreversible and consumes fees / changes ledger state**. No confirmation dialog before Submit. Fix: three-step explainer at the top, label the `isReadCall` "Yes/No" row as "Read-only / State-changing", and require an explicit "Submit — this executes on-chain" confirmation.
- **U3. Authorization is never surfaced, so `mint`/`set_admin` are a trap.** The catalog marks these `authorization: "admin"` (`src/data/components.ts:229-241`) but the UI never shows it. Any visitor can simulate `mint` (it succeeds, embedding an admin auth entry), sign with their own wallet, submit, and only then hit an opaque on-chain auth failure. The deployed token's admin is the CLI `deployer` key stored *outside* the repo (`contracts/README.md:88-97`); no visitor can ever act as admin. Fix: display authorization per method and warn before sign/submit when the connected wallet is not the contract admin.
- **U4. The 30-second envelope window makes submit brittle.** `TX_TIMEOUT_SECONDS = 30` (`rpc.ts:26`). `sign()` auto-re-prepares on expiry (`TransactionBuilder.tsx:224-245`), but `submit()` does **not** (`TransactionBuilder.tsx:268-290`) — a user who takes >30s between signing and submitting gets `envelope.expired` with no re-sign path. Fix: auto re-prepare + re-sign on submit expiry, or raise the timeout for submissions.
- **U5. No Transactions documentation.** The Docs sidebar has a "Transaction Builder" item but zero content on funding, signing, simulation, or submission.
- **U6. No quick-fill for addresses.** After connecting Freighter, users must hand-paste their own address into every `from`/`to` field. Fix: a "Use connected address" affordance per address field.

---

## 3. Functional bugs

- **F1 (B3):** `i128` overflow → HTTP 500 on `/api/transactions/prepare` (reproduced live).
- **F2:** Generated integration code does not compile for `MuxedAddress` params. `placeholderArg` (`src/lib/integration/generators.ts:220-232`) returns `&bob` (an `Address`) for token's `transfer` `to_muxed`, but the generated Soroban client expects `&MuxedAddress` (confirmed by analysis). The generated snippet is the primary copy-paste deliverable, so this matters.
- **F3:** Freighter disconnect-from-extension isn't handled. `freighter.ts:198-227` `subscribe()` returns early on `params.error`, so revoking access in the extension leaves the app stuck on "connected" until reload (signing then fails confusingly).
- **F4:** After a `PENDING` submission (poll window exhausted, `submit.ts:304-313`), the Submit button is permanently disabled ("Submitted") with no retry path.
- **F5:** `contracts/README.md:42` documents `transfer(from, to, amount)` but the contract is `transfer(from, to_muxed, amount)` — stale doc.
- **F6:** Submission rejection detail is opaque: `transactionResultDetail` (`submit.ts:316-344`) yields `txFailed: invokeHostFunction` for the auth-failure case instead of "you are not the admin".

---

## 4. Security audit

### Good (do not regress)

- **Submit route** rejects any payload containing secret-key field names (`submit/route.ts:9-17,63-65`), allows only `{network, signedXdr}`, caps body (64 KB) and XDR length, validates base64 + parses against the network passphrase, **requires a valid source-account signature** (`submit.ts:164-211`), and caps envelope expiry at 24 h.
- **Playground route** rejects `wasmPath` from the browser (`route.ts:169-171`), validates every param server-side (types, i128/u32 ranges, identity allowlist, call/identity counts, string lengths), spawns the runner via `execFile` with a fixed path (no shell injection), pipes input only via stdin, and enforces a 10 s kill timeout + 1 MB output cap.
- **Prepare route** strictly bounds the body, parameter count, and field lengths, and validates network/component/method against the catalog — it cannot be abused to invoke arbitrary contracts (contract address comes from the deployment registry, never the client).
- No secrets in the repo; RPC URLs come from server-side env with safe defaults (`rpc.ts:183-188`); the deployment address registry does its own base32/CRC16 validation (`deployments.ts:42-86`).

### Issues

- **No rate limiting / auth on any public route** — `/api/playground` can be hammered to spawn subprocesses, and `/api/transactions/*` to amplify calls against the public Soroban RPC. Low risk for an MVP, but note for production.
- **No security headers** (CSP, X-Frame-Options, etc.) — `next.config.ts` is empty; add `headers()`.
- RPC env overrides (`STELLAR_RPC_*_URL`) are trusted and undocumented — fine, but add `.env.example`.
- The `i128` 500 (B3) is also a robustness/security failure (unhandled exception path).

---

## 5. MVP gaps

> **Phase 20 update:** This section describes the Phase 7 state. As of Phase 20,
> all eight catalog components are implemented and sandbox-executable, web tests
> and CI exist, and Token + Payment are deployed to Testnet. See the historical
> notice at the top of this file.

- Only **1 of 6** catalog components is implemented (Token); Payment, Access Control, Escrow, Subscription, Multi-signature are concepts with no interface — the MVP goal of "5–10 reusable components" is unmet.
- **No app tests** (no test runner/script in `package.json`; only Rust unit tests) and **no CI**.
- **No contribution guide** (README defers it).
- **Visitors cannot exercise the deployed token's `mint`/`set_admin`** (admin-only, key held outside the repo) — the sandbox is the only place a visitor can experience state changes.
- No `.env.example`, and no run/deploy docs for the playground (Rust toolchain + build step required, undocumented in the top-level README).
- README roadmap is stale: milestones stop at M3 and Phases 4–7 are unchecked despite being largely complete.

---

## 6. Polish opportunities

- Remove unused starter SVGs in `public/` (`next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, `file.svg`); replace the default favicon.
- Add `robots.txt`, `sitemap`, OG image, `theme-color`/manifest.
- Add `generateMetadata` to component catalog pages (only docs pages have unique titles today).
- Link **Transactions** from the homepage — the flagship feature is currently reachable only via navbar.
- Copy-to-clipboard for wallet address, XDR, and transaction hash.
- The local sandbox's "deployed contract" address is deterministic and shared across all components (deployer identity + fixed salt, `sandbox-runner/src/main.rs:18,126`) — can confuse; consider a per-run salt.
- Docs sidebar "Integration" item is always `active={false}`.

---

## 7. Exact recommended changes (priority order)

1. **rpc.ts:57-68** — Remove the `server.getAccount` gate for simulation; build the envelope with `new Account(source, "0")` (or use the sequence from the RPC result). Keep the check only at submission time. *(Fixes B1/U1 root cause.)*
2. **TransactionBuilder.tsx / TransactionPreview.tsx** — On `source-account-not-found`, render a testnet-only **"Fund with Friendbot"** button (POST `https://friendbot.stellar.org?addr=<source>`) plus a link to Freighter's funding flow; show it in `WalletConnection` too.
3. **validate.ts:115-116 + args.ts:54-55** — Add i128 min/max range validation and a `try/catch` in `toScVal` returning `parameter-invalid-value`. *(Fixes B3/F1.)*
4. **playground route.ts:22-29 + docs** — Build `sandbox-runner` for Linux, commit the binary/wasm artifacts (or add a `postinstall`/build step + bundle into the serverless function), make the path platform-aware, and document the local Rust requirement. *(Fixes B2.)*
5. **Transactions page + preview** — Add the 3-phase explainer (simulate / sign / submit), rename "Read call" to "Read-only / State-changing" with a definition, surface `authorization` per method, warn when the connected wallet isn't the admin, and add a submit confirmation step. *(Fixes U2/U3.)*
6. **TransactionBuilder.tsx submit()** — Mirror the sign-flow auto re-prepare/re-sign on expiry; if the poll window expires, allow retrying submission. *(Fixes U4/F4.)*
7. **generators.ts:220-232** — Emit `MuxedAddress::from_str(env, "...")` / `&MuxedAddress` for muxed params; test generated output compiles. *(Fixes F2.)*
8. **freighter.ts:198-227** — On `params.error`, emit a `disconnected` change (or fall back to a `getConnection()` re-check). *(Fixes F3.)*
9. **/docs** — Add a Transactions section covering funding, simulation, signing, submission, and admin-only methods. *(Fixes U5.)*
10. **next.config.ts** — Add security headers; add `.env.example`; delete starter `public/*.svg`; add OG/sitemap/robots.
11. **README.md / roadmap** — Mark Phases 4–7 complete, add M4/M5 milestone notes, correct the token `transfer` signature in `contracts/README.md`, add a contribution guide stub.
12. **UI niceties** — Address quick-fill from connected wallet; copy buttons for address/XDR/hash; homepage link to Transactions.

---

## 8. What is already good — do NOT change

- **The data-driven component model + generic sandbox runner.** Verified end-to-end against Greeter (init → `greet` → `increment` → `count` → admin-authed `set_greeting` → `tag`): all six typed calls returned correct results. This is the right extensibility architecture.
- **Defense-in-depth validation** on the playground API (TS validation *and* Rust re-validation, ranges, allowlists, size caps, fixed-path `execFile`, timeout+kill). The wasmPath injection attempt, unknown function, overflow i128, unknown identity, and oversized body were all cleanly rejected.
- **Submission-time signature verification** — requiring a valid source signature before relaying to the network is a genuinely strong security decision.
- **The typed phase state machine** (`draft→built→preparing→prepared→signed→submitted` with granular error codes) — clean and debuggable.
- **Auto-re-prepare on sign expiry** and the **wallet network-mismatch guard** — both correct.
- **Read-only call detection + resource cost display** — good developer education.
- **Accessibility discipline** — `aria-live`, `aria-invalid`, labels, focus-visible rings throughout.
- **Strict TS, clean lint, clean build**, no TODOs/debug leftovers, no secrets, no `dangerouslySetInnerHTML`, and a sensible dependency footprint (React/Next/TS/Tailwind + stellar-sdk + freighter-api only).
- **Honest, deterministic sandbox replay semantics** — documented, not faked.