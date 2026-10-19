# Contributor backlog

This is a small, reviewable backlog for future GitHub issues or Drips Wave
tasks. It is intentionally local until GitHub authentication is restored and
each task has an owner, acceptance criteria, and a current repository link.

## Ready candidates

### 1. Repair the Windows Rust validation environment

Scope: document and reproduce the MSVC `link.exe: Access is denied` failure, then
make the supported local validation path pass without changing contract or WASM
source.

Acceptance: contracts and sandbox `cargo test`, `cargo clippy --workspace
-- -D warnings`, application build, and prebuilt verification pass on a clean
recursive checkout.

### 2. Reconcile Token and Payment deployment provenance

Scope: trace the historical deployments to their exact source commit, SDK,
toolchain, release profile, and deployment metadata. Do not overwrite existing
evidence.

Acceptance: each component is either matched to a reproducible artifact and
fresh evidence, or explicitly marked historical/unverified with the deployed
hash and provenance retained.

### 3. Add evidence-driven component support pages

Scope: expose the verification manifest in contributor-facing documentation and
keep registry, sandbox, behavior, parity, and candidate-authority labels distinct.

Acceptance: documentation links to the manifest, the validator runs in CI, and
no page describes registry presence as independent behavior verification.

### 4. Harden deployment lifecycle transitions (Phase 36)

Scope: model explicit state transitions and invalidate stale state for artifact,
candidate, account, admin, and readiness drift.

Acceptance: focused adversarial tests cover every invalidation path and no stale
session can be signed or submitted.

### 5. Improve repository presentation and onboarding

Scope: review the architecture graphic, three-repository navigation, social
preview assets, and contributor setup instructions.

Acceptance: all links resolve, current versions/statuses are accurate, and each
repository has a concise “start here” path.

## Safety constraints

These tasks do not authorize Mainnet activity, real-wallet use, blockchain
mutation, deployment, releases, tags, or weakening of fail-closed checks.
