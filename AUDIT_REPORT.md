# Stellar-Forge audit and readiness report

Date: 2026-10-18

Scope: `StellarForgeDev/stellar-forge`, its `stellar-forge-contracts` submodule,
and the nested `stellar-forge-sandbox` repository. This was a read-only
repository, Git, documentation, CI, dependency, artifact-evidence, and release-
readiness audit with a small safe documentation/verification fix. No GitHub
settings, pull requests, releases, tags, deployments, wallets, keys, or
blockchain state were changed.

## Executive verdict

`SAFE AFTER REQUIRED FIXES`

The local application repository is synchronized with its recorded `origin/main`
commit and the protected deployment boundaries remain intact. The audit found
two important correctness issues: the README had stale dependency/roadmap
claims, and the application had no machine-readable boundary separating catalog
registration from independent Testnet evidence. Both are corrected on this
isolated audit branch. The application checks pass locally after restoring
pnpm/Corepack access; native Windows Rust linking remains environment-blocked.

## Repositories and synchronization

| Repository | Local branch/HEAD | Recorded remote state | Working tree |
| --- | --- | --- | --- |
| `stellar-forge` | `main` / `5d97b15` | `origin/main` at `5d97b15` | clean before isolated audit worktree |
| `stellar-forge-contracts` | `main` / `7aa0750` | `origin/main` at `7aa0750` | clean |
| `stellar-forge-sandbox` | `main` / `182e401` | `origin/main` at `182e401` | clean |

The parent repository references contracts through its submodule and contracts
references the sandbox as a nested submodule. GitHub authentication is now
restored and the remote was refreshed successfully. Current open Dependabot
state is: #23–#27 have successful CI/Vercel checks after rerunning #23; and #21
(Stellar SDK 17) remains failed and deferred for migration/security review. No
dependency PR was merged by this audit pass.

The isolated audit worktree is:

`C:\Users\user\Projects\stellar-forge-public\stellar-forge\.audit-worktrees\stellar-forge-readiness-20261018`

Branch: `audit/readiness-20261018`, based on the locally recorded `origin/main`.

## Product and architecture assessment

The repository is a Testnet-focused Soroban developer platform with a catalog,
component documentation, generic metadata-driven Playground, native sandbox,
transaction preparation/simulation/signing/submission flows, Freighter support,
integration generation, and controlled deployment verification. The architecture
keeps current candidate authorization separate from historical evidence and does
not make client-provided hashes or WASM authoritative.

The public claim is now intentionally narrower: three components (`token`,
`payment`, and `access-control`) are the initial documented local-sandbox and
Testnet-preparation scope. The catalog may contain 15 implemented components,
but registration is not independent behavior verification.

## Findings

### P1 — stale README release and roadmap claims — fixed

Evidence: `package.json` declares Next.js 16.4.0 and TypeScript 6, while the
README reported Next.js 16.3.0 and TypeScript 5. It also described Phase 34 as
active even though `ROADMAP.md` records Phase 34 and Phase 35 complete.

Fix: updated the README to the actual versions, the completed phase status, and
the link to the evidence manifest.

### P1 — registration and verification evidence were not machine-readable as
separate concepts — fixed

Evidence: `src/lib/transactions/deployments.ts` contains 15 Testnet registry
entries, while the current repository evidence independently identifies a much
narrower set of behavior/parity facts. Token and Payment hash mismatches are
recorded; the historical Access Control record is not current candidate authority.

Fix: added `verification/component-verification-manifest.json`, a validator, and
documentation. The validator requires all catalog slugs to be represented,
requires candidate authorization to remain separate, limits the public scope to
3–5 components, and rejects an unavailable Mainnet or blockchain-mutation claim.

The manifest now classifies Token and Payment as historical deployments from
before the current prebuilt-artifact alignment. Their deployed hashes remain
historical evidence; they are not current repository parity or authorization.

### P1 — GitHub verification was temporarily blocked; restored

Evidence: initial `gh auth status` reported an invalid token and remote access
failed. After browser device authentication, `gh auth status` succeeds for
`Marvelg256`, `git fetch --prune` succeeds, and the live PR list is available.

No credential value was printed. The remaining publication decision is gated by
the local build/Rust environment and independent review of this branch.

### Token/Payment mismatch assessment

The September evidence records source/prebuilt hashes from an older provenance
state and different deployed hashes for both Token and Payment. The current
contracts repository later introduced Linux-build/prebuilt alignment; its current
metadata records the current source/build toolchain and current prebuilt hashes.
The recorded evidence also shows the current repository commit differed from the
metadata commit. The supported conclusion is historical deployment before the
current prebuilt alignment, not incorrect current checksums. No artifact or
historical evidence was overwritten.

### P2 — public presentation and social-preview work — completed as reported

The audit branch now includes a “Start here” README, a documentation map, a
three-repository explanation, and the architecture SVG. Social Preview images
are GitHub repository settings. The maintainer confirmed that the preview images
have already been uploaded for all three repositories, so no further action is
required here.

The presentation branches contain broader uncommitted changes and were not
merged wholesale because one copy contained stale dependency/phase claims. The
safe navigation and architecture asset were ported with current facts preserved.

### Contributor backlog — locally prepared

`docs/contributor-backlog.md` contains five bounded candidate tasks with
acceptance criteria, including the toolchain fix, Token/Payment provenance,
evidence documentation, Phase 36, and presentation. No external GitHub issues
were created; the backlog remains local and reviewable on this branch.

## Supply chain and CI

The inspected workflow uses immutable action commit SHAs for checkout, pnpm,
Node, Rust toolchain setup, and Rust cache. Checkout sets
`persist-credentials: false`; workflow permissions are explicitly limited.
The Stellar SDK 17 upgrade remains deferred by the roadmap because it requires a
transaction/RPC/ScVal/signature migration review. No dependency upgrade was
introduced by this audit.

## Protected files and blockchain safety

The audit branch did not modify contracts, the contracts submodule pointer, the
sandbox source or pointer, candidate manifests, current candidate WASM, metadata,
checksums, or historical deployment evidence. No signing, submission, funding,
deployment, Mainnet activity, or other blockchain mutation occurred.

The evidence model preserves these distinctions:

1. Historical deployment evidence describes past artifacts.
2. Current candidate authorization applies only to a new controlled Testnet
   deployment and is server-side.
3. Post-deployment verification requires fresh RPC retrieval and separate
   behavior checks.

## Tests and validation

Passed:

- `pnpm install --frozen-lockfile` — completed with pnpm 11.21.0.
- `pnpm exec tsc --noEmit` — passed.
- `pnpm lint` — 0 errors; 14 existing warnings remain.
- `pnpm test` — 90 test files, 987 tests passed.
- `pnpm verify:manifest` — 15 catalog entries and 3 public-scope components
  validated.
- `cargo fmt --all -- --check` — passed independently in contracts and sandbox.
- `git diff --check` — passed.

Blocked by the Windows toolchain:

- `pnpm build` reached native sandbox-runner compilation but failed because the
  installed MSVC `link.exe` returned `Access is denied`.
- `pnpm verify:prebuilt` reached the 15-package deterministic Cargo build but
  could not complete after the same Windows compiler/linker failure.
- Contracts `cargo test --workspace` and `cargo clippy --workspace -- -D
  warnings` reached compilation but were blocked by `link.exe: Access is
  denied`. Sandbox `cargo test --workspace` encountered the same linker issue.

The initial missing-submodule failures were resolved in the isolated worktree by
initializing the contracts and nested sandbox at the recorded gitlinks. No
submodule pointer was changed.

## Funding readiness

Drips Wave is the strongest immediate fit because it is designed for maintainers
to onboard GitHub organizations/repos and present bounded issues to contributors;
participation is described as free for maintainers in the official maintainer
documentation: <https://docs.drips.network/wave/maintainers/participating-in-a-wave/>.
The project now has valid GitHub access, a narrow local issue backlog, contributor
guidance, and a documented public support matrix; those materials still need
independent review before applying. Drips' official docs
also describe identity verification and related withdrawal requirements for
contributors: <https://docs.drips.network/wave/contributors/solving-issues-and-earning-rewards/>.

Stellar-specific funding eligibility, GrantFox availability, dates, and selection
criteria were not verified in this pass, and no application is authorized. Do not
submit an application until
the maintainer identity, repository presentation, measurable milestones, and
program-specific eligibility are confirmed from the current official program page.

## Owner actions required

1. Resolve the Token/Payment artifact mismatches in a dedicated evidence task;
   do not overwrite historical evidence or use it as current authorization.
2. Repair or replace the local Windows MSVC/Rust linker environment, then rerun
   `pnpm build`, `pnpm verify:prebuilt`, and the contracts/sandbox Rust tests.
3. Independently review this branch and the manifest before merging to `main`.
4. Continue with Phase 36 only after this audit branch is reviewed and the
   roadmap's Phase 36 entry is still the next approved phase.

## Change and publishing status

Changed only on `audit/readiness-20261018`:

- `CONTRIBUTING.md` — linked the bounded local contributor backlog.
- `README.md` — corrected versions, phase status, and evidence-scope language.
- `package.json` — added `verify:manifest` script.
- `verification/component-verification-manifest.json` — added explicit evidence
  classification for all 15 components.
- `scripts/validate-component-verification-manifest.mjs` — added deterministic
  validation against the catalog.
- `docs/README.md` — added a repository documentation map.
- `docs/assets/stellar-forge-architecture.svg` — added the repository
  architecture graphic.
- `docs/contributor-backlog.md` — added five bounded contributor tasks with
  acceptance criteria.
- `docs/verification-manifest.md` — documented the authority boundary.
- `AUDIT_REPORT.md` — this report.

No commit, push, merge, release, tag, GitHub setting change, deployment, or
blockchain mutation was performed.
