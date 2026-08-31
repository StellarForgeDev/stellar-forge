# Prebuilt Sandbox Artifacts

Files in this directory are build outputs committed to the repository so the
Playground works on Vercel without a Rust toolchain during deployment.

## What is committed here

| File | Purpose | Platform |
| --- | --- | --- |
| `token.wasm` | Soroban contract WASM executed inside the sandbox | platform-independent |
| `payment.wasm` | Soroban contract WASM executed inside the sandbox | platform-independent |
| `access-control.wasm` | Soroban contract WASM executed inside the sandbox | platform-independent |
| `escrow.wasm` | Soroban contract WASM executed inside the sandbox | platform-independent |
| `multi-signature.wasm` | Soroban contract WASM executed inside the sandbox | platform-independent |
| `subscription.wasm` | Soroban contract WASM executed inside the sandbox | platform-independent |
| `vesting.wasm` | Soroban contract WASM executed inside the sandbox | platform-independent |
| `staking.wasm` | Staking contract WASM executed inside the sandbox | platform-independent |
| `atomic-swap.wasm` | Atomic swap contract WASM executed inside the sandbox | platform-independent |
| `timelock.wasm` | Timelock contract WASM executed inside the sandbox | platform-independent |
| `merkle-airdrop.wasm` | Merkle airdrop contract WASM executed inside the sandbox | platform-independent |
| `oracle.wasm` | Oracle contract WASM executed inside the sandbox | platform-independent |
| `crowdfund.wasm` | Crowdfund contract WASM executed inside the sandbox | platform-independent |
| `allowance.wasm` | Allowance contract WASM executed inside the sandbox | platform-independent |
| `claimable-balance.wasm` | Claimable balance contract WASM executed inside the sandbox | platform-independent |

The directory also contains `metadata.json`, structured machine-readable
artifact metadata, and `checksums.txt`, a conventional checksum verification
interface. Both intentionally contain SHA-256 values and must agree with each
other and with the corresponding WASM bytes.

Contract WASM is compiled once from the Rust source in
`contracts/contracts/<package>` and is byte-identical on every OS, so the
committed copy is the deployment artifact. The Playground API uses an
explicitly supplied artifact directory first. With no explicit directory, it
prefers the locally built wasm (`contracts/target/wasm32v1-none/release/`),
then `PREBUILT_WASM_DIR`, then this directory. Runtime resolution checks paths
and existence only; checksum validation is an explicit CI/startup/deployment
verification operation, not a per-request operation.

The native `sandbox-runner` binary is **never** committed:

- **Local development** — build it with `pnpm sandbox:build` (compiles
  `contracts/target/debug/sandbox-runner`).
- **Vercel** — `scripts/vercel-sandbox-build.sh` compiles it from source on
  Vercel's Linux builder during `vercel-build`, so the binary always matches
  the function runtime (x86-64 Linux, correct glibc).

## Refreshing the prebuilt wasm

After changing a contract in the workspace:

```bash
pnpm sandbox:build --prebuilt
```

This rebuilds the WASM via Cargo for the `wasm32v1-none` target and copies it
here. Commit the updated file together with the contract source change.

## Why this works on Vercel

1. `contracts/prebuilt/token.wasm` is part of the git checkout Vercel builds.
2. `next.config.ts` (`outputFileTracingIncludes`) copies the wasm and the
   built runner into the Playground serverless function bundle — the API
   route references both through runtime-computed paths that static tracing
   cannot discover.
3. `vercel-build` compiles the Linux runner from source before `next build`.
4. The API route resolves the first existing artifact and returns a clear
   503 with build instructions when artifacts are missing.
