<!--
Thank you for contributing to Stellar-Forge.
Keep this PR focused on a single capability or fix.
-->

## Summary

What changed and why? Reference the relevant `ROADMAP.md` milestone when applicable.

## Issue and scope

- Problem / issue being solved:
- In-scope layer: [ ] application [ ] contracts [ ] sandbox [ ] docs/CI
- Files or modules touched:
- Out of scope:

Changes outside the issue scope require explicit justification.

## Scope

- [ ] Catalog / documentation only
- [ ] Web application (UI / lib)
- [ ] Contract (Rust / Soroban)
- [ ] Build / CI / config

## Component / catalog impact

- Affected component(s):
- Does this add or change a catalog component? If so, does it follow the
  data-driven pipeline (single `StellarComponent` record) **without**
  component-specific branching?

## Verification performed

Confirm you ran these before opening the PR:

- [ ] `pnpm lint`
- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm build`
- [ ] `pnpm test` (Vitest) — if domain logic changed
- [ ] `pnpm sandbox:build` + Playground check — if contract / sandbox changed
- [ ] `cargo test` (in `contracts/`) — if contract changed

## Cross-repository and safety checks

- [ ] Sandbox artifact-backed tests/build ran when contracts or sandbox changed
- [ ] Cross-repository impact and pinned submodule commits reviewed
- [ ] No change to wallet, signing, submission, DeploymentSession, or evidence boundaries
- [ ] Any sensitive-area change and required maintainer review are explained below

## Breaking changes

- [ ] This PR introduces a breaking change.
      If yes, describe the impact and migration path below.

## Notes for reviewers

Anything reviewers should pay special attention to.
