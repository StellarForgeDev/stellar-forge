# Repository release audit

Updated: 2026-10-20

Stellar-Forge is released as one product across three repositories. The
application, contracts, and sandbox must be reviewed together because the
application consumes the contracts as a submodule and the contracts workspace
consumes the sandbox runner as a nested submodule.

## Public product scope

The public catalog is intentionally limited to three components:

| Component | Catalogued | Sandbox-runnable | Testnet-verified | Production-ready |
| --- | --- | --- | --- | --- |
| Token | Yes | Yes | No — partial historical behavior only; current deployed hash mismatch | No |
| Payment | Yes | Yes | No — current deployed hash mismatch | No |
| Access Control | Yes | Yes | No — current artifact/behavior evidence is not complete | No |

The other contract crates remain in the contracts repository and remain
available to the generic build and sandbox pipeline. They are not presented as
independently verified public product components.

These terms are intentionally separate:

- **Catalogued** — documented and exposed in the focused application catalog.
- **Sandbox-runnable** — the real WASM can be exercised through the local
  Soroban sandbox path.
- **Testnet-verified** — fresh artifact and behavior evidence exists for the
  specific current deployment; a registry entry is insufficient.
- **Production-ready** — the component has passed a separately approved release
  gate. None currently has this status.

## Repository inventory

| Repository | Role | Audited revision | Relationship |
| --- | --- | --- | --- |
| `StellarForgeDev/stellar-forge` | Application, catalog, UI, APIs | `0c85460` base; this audit branch adds the focused catalog and evidence wording | Parent repository |
| `StellarForgeDev/stellar-forge-contracts` | Soroban workspace, prebuilt artifacts, evidence | `7aa0750` | Git submodule of the application |
| `StellarForgeDev/stellar-forge-sandbox` | Native deterministic sandbox runner | `182e401` | Nested submodule of contracts |

The checked-out submodules were inspected without changing their pointers.
The contracts and sandbox working trees were clean before this audit. The
application's protected candidate manifest, current candidate WASM, metadata,
checksums, historical evidence, contracts pointer, and sandbox pointer remain
untouched.

## Validation

- Application focused verification tests: passed.
- Application full test suite: passed, 989 tests.
- TypeScript and lint: passed; lint has existing warnings only.
- Component verification manifest: passed.
- Prebuilt checksum-only verification: passed.
- Contracts and sandbox formatting checks: passed in the initialized audit
  worktree.
- Full native build and Rust tests: require the known Windows MSVC linker fix;
  `link.exe` currently returns `Access is denied`.

No signing, submission, deployment, funding, release, or blockchain mutation
was performed. This document is an audit/release boundary, not an authorization
to publish or deploy.
