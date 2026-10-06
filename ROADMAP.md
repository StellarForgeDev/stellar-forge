# Stellar-Forge Roadmap

This is the active execution tracker for Stellar-Forge. Completed work is
listed only when supported by the repository. The current release scope ends
at Phase 64. Mainnet deployment is not part of this roadmap.

## Current status

- **Baseline through Phase 33:** complete capability and security work is
  present in the repository, including the catalog, sandbox, Testnet flows,
  verification, deployment-session controls, provenance, and immutable CI
  action pins.
- **Phase 34:** complete — dependency and supply-chain hardening verified on
  current `main`.
- **Phases 35–64:** planned; none are complete until their implementation,
  tests, documentation, and security impact are verified.

Current platform facts:

- 15 catalog components are implemented and sandbox-executable.
- All 15 have Testnet registry entries; registry presence is not proof of
  exact on-chain WASM parity or independent behavioral verification.
- Testnet is operational and Mainnet is deliberately unavailable.
- Historical evidence is not current candidate authorization.
- Client-provided hashes, WASM, and candidate values are never authoritative.

## Phase 34 — Dependency & Supply-Chain Hardening (COMPLETE)

Review each Dependabot upgrade independently. Do not combine upgrades blindly.
GitHub Actions must remain pinned to immutable commit SHAs.

### Dependabot review ledger — 2026-10-06

| PR | Upgrade | Disposition |
| --- | --- | --- |
| [#2](https://github.com/StellarForgeDev/stellar-forge/pull/2) | `pnpm/action-setup` 6.1.0 | MERGED as `95e13a1`; SHA preserved |
| [#3](https://github.com/StellarForgeDev/stellar-forge/pull/3) | `actions/checkout` 7.0.1 | MERGED as `bb89d85`; SHA preserved |
| [#4](https://github.com/StellarForgeDev/stellar-forge/pull/4) | Rust toolchain action 2.0.0 | MERGED as `3889f4a`; SHA preserved |
| [#5](https://github.com/StellarForgeDev/stellar-forge/pull/5) | `actions/setup-node` 7.0.0 | MERGED as `902fb2b`; SHA preserved |
| [#6](https://github.com/StellarForgeDev/stellar-forge/pull/6) | Next 16.3.7 | MERGED as `1b75df7`; local validation passed |
| [#7](https://github.com/StellarForgeDev/stellar-forge/pull/7) | `eslint-config-next` 16.3.7 | MERGED as `3a607fc`; local validation passed |
| [#8](https://github.com/StellarForgeDev/stellar-forge/pull/8) | TypeScript 6.0.3 | MERGED as `a802dd3`; local validation passed |
| [#9](https://github.com/StellarForgeDev/stellar-forge/pull/9) | `@stellar/stellar-sdk` 17.2.1 | CLOSED: application type failures require migration/security review before reopening |
| [#10](https://github.com/StellarForgeDev/stellar-forge/pull/10) | `@types/node` 26.6.4 | MERGED as `64cb5e5`; CI and Vercel passed |

Phase 34 completion requires:

- a disposition for every open Dependabot PR;
- focused and full validation for every accepted upgrade;
- no mutable action tags;
- reasons recorded for deferred or rejected upgrades;
- no unrelated contract, WASM, checksum, metadata, evidence, or sandbox
  changes.

SDK 17 is the current decision boundary. It must not be merged until its
changes to transaction envelopes, RPC resources, ScVal decoding, signatures,
and transaction results are migrated and reviewed against the fail-closed
deployment and submission security model.

### Phase 34 completion record — 2026-10-06

- All Dependabot PRs were reviewed individually; PRs #2–#8 and #10 were
  accepted and merged, and PR #9 was closed with the SDK 17 migration/security
  review explicitly deferred.
- Current CI action references are full immutable commit SHAs; no mutable
  action tags remain.
- Current `main` validation passed: TypeScript, lint with 0 errors, 90 test
  files with 984 tests, production build, and `git diff --check`.
- The accepted dependency upgrades remain limited to their intended manifests,
  lockfile, and workflow changes. Contracts, WASM, checksums, deployment
  metadata, historical evidence, and sandbox sources were not changed by this
  phase.
- No blockchain signing, submission, deployment, funding, or other network
  mutation was performed.

## Phase 35 — Verification Coverage & Evidence Contracts

Add route-level and adversarial coverage for `/submit`, `/verify`, `/record`,
`/deploy/prepare`, reconcile, and restore, including candidate drift,
candidate unavailability, stale XDR, stale sessions, and restored-session drift.

## Phase 36 — Deployment Lifecycle State-Machine Hardening

Make every deployment-session transition explicit. Artifact, candidate,
account, admin, and readiness drift must invalidate stale state.

## Phase 37 — Network & Failure-Semantics Hardening

Ensure transport failure never becomes authorization. Distinguish unavailable,
timeout, malformed response, missing contract, verification mismatch, and
candidate mismatch.

## Phase 38 — Testnet Registry Truthfulness

Keep registry declaration, historical provenance, fresh RPC retrieval, behavior
verification, and current candidate authorization separate.

## Phase 39 — Component Conformance Standard v2

Define one deterministic standard for metadata, WASM, tests, sandbox,
documentation, dependencies, constructors, read-only behavior, and Testnet
readiness.

## Phase 40 — Developer Onboarding & Documentation

Improve setup, architecture, security, Testnet, sandbox, transaction, and
contribution documentation using verified repository behavior.

## Phase 41 — Integration Generation & Project Scaffolding

Strengthen generated integrations and add scaffolding only where component
interfaces and security boundaries support it.

## Phase 42 — Transaction UX & Observability

Improve simulation, signing, submission, settlement, diagnostics, and
user-visible lifecycle observability without weakening confirmation boundaries.

## Phase 43 — Wallet, Signing Security & UX

Harden wallet identity, network selection, signing context, stale-state
handling, and explicit confirmation.

## Phase 44 — Playground Isolation Assurance

Verify process isolation, fixed artifact resolution, resource limits, timeout
behavior, deterministic execution, and hostile-input handling.

## Phase 45 — Catalog & Metadata Architecture Cleanup

Consolidate catalog metadata and capability declarations without component-
specific branching in generic platform paths.

## Phase 46 — API Boundary Hardening

Harden route schemas, authorization boundaries, payload limits, error contracts,
and server-side authority decisions.

## Phase 47 — Rate Limiting, Security Headers & Threat Model

Add appropriate rate limits and security headers and maintain a threat model for
public routes, wallet flows, sandbox execution, and RPC use.

## Phase 48 — Audit Trails & Provenance Reporting

Make deployment, verification, candidate authorization, and historical evidence
auditable without treating historical evidence as current authorization.

## Phase 49 — Performance & Caching Safety

Improve performance while preserving candidate identity, network isolation,
artifact integrity, and freshness guarantees.

## Phase 50 — Reliability & Error-Handling Consolidation

Unify timeout, retry, recovery, malformed-response, and partial-failure
semantics across the application and deployment lifecycle.

## Phase 51 — CI & Release Engineering Maturity

Strengthen CI, release validation, artifact checks, environment promotion, and
reproducibility while preserving immutable action pins.

## Phase 52 — Dependency Governance v2

Establish dependency ownership, upgrade classification, security review,
lockfile policy, and compatibility testing.

## Phase 53 — Versioning & Release Process

Define versioning, changelog, release criteria, rollback, and compatibility
discipline for the v1 platform.

## Phase 54 — Contribution & Community Workflow

Improve contribution guidance, component proposals, review expectations,
security reporting, and community maintenance workflows.

## Phase 55 — Security Testing Expansion

Expand adversarial, property-based, integration, dependency, route, wallet,
sandbox, and artifact security testing.

## Phase 56 — Independent Security Review Readiness

Prepare scope, threat model, evidence, reproducible checks, and known-limitations
documentation for independent review.

## Phase 57 — Controlled Testnet Release Train

Define a controlled Testnet release train with candidate authorization,
verification, rollback, evidence, and explicit operator approvals.

## Phase 58 — Mainnet-Readiness Architecture Only

Document architecture constraints and readiness criteria only. **No Mainnet
deployment is permitted by this roadmap.**

## Phase 59 — Recovery, Backup & Disaster Procedures

Define recovery, backup, evidence preservation, deployment-session restoration,
and operator disaster procedures.

## Phase 60 — Compatibility & Migration Discipline

Define compatibility contracts, migration procedures, deprecation policy, and
upgrade rollback expectations.

## Phase 61 — Selective Ecosystem Expansion

Expand ecosystem integrations only when they support demonstrated platform needs
and preserve the existing security model.

## Phase 62 — SDK/Package Extraction Decision

Extract an SDK or package only if demonstrated reuse justifies it. No SDK is
currently claimed or promised.

## Phase 63 — Release-Candidate Stabilization

Resolve verified reliability, security, compatibility, and documentation gaps.
No speculative feature expansion.

## Phase 64 — v1 Release Gate & Long-Term Maintenance

Define and verify the v1 release gate. After Phase 64, development transitions
to maintenance, security response, compatibility, and a separately approved
v2 roadmap.

## Roadmap rules

- Completed claims require repository evidence.
- Proposed work is not current functionality.
- Work proceeds one phase or tightly bounded sub-phase at a time.
- Fail-closed security behavior must be preserved.
- No blockchain signing, submission, deployment, funding, or mutation occurs
  without explicit authorization.
