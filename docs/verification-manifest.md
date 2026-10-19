# Component verification manifest

[`verification/component-verification-manifest.json`](../verification/component-verification-manifest.json)
is the machine-readable evidence boundary for the catalog.

It deliberately separates:

- catalog declaration;
- local sandbox coverage;
- Testnet address registration;
- fresh Testnet behavior evidence;
- artifact-byte parity; and
- current candidate authorization for a new controlled Testnet deployment.

An address in `src/lib/transactions/deployments.ts` is a registry declaration,
not proof that the deployed instance has the expected WASM, behavior, or current
authorization. Historical deployment records are evidence about the past and do
not authorize a new deployment. Client-provided hashes, WASM bytes, and candidate
values are never authoritative.

The current public scope is intentionally narrow: `token`, `payment`, and
`access-control` are documented for local sandbox use and Testnet transaction
preparation. The manifest does not claim current on-chain artifact parity or
independent behavioral verification for those components. Mainnet remains
unavailable, and this audit performed no blockchain mutation.

The Token and Payment mismatches are classified as historical deployments from
before the current prebuilt-artifact alignment. Their deployed hashes remain
evidence about those deployed instances, but they are not treated as current
repository parity or authorization. The historical evidence is preserved.
