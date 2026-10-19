# Stellar-Forge documentation

This folder contains repository-level documentation and verification guidance.
The live component documentation is served from `src/app/docs`.

## Choose a path

| Need | Read |
| --- | --- |
| First-time orientation | [Live documentation hub](https://stellar-forge-dev.vercel.app/docs) |
| Browse the component library | [Live catalog](https://stellar-forge-dev.vercel.app/components) |
| Understand system boundaries | [Architecture](../ARCHITECTURE.md) |
| Run the local Playground | [Live Playground](https://stellar-forge-dev.vercel.app/playground) |
| Use the transaction workflow | [Transactions guide](https://stellar-forge-dev.vercel.app/docs/transactions) |
| Review evidence levels | [Verification manifest](./verification-manifest.md) |
| Add a component or improve the repository | [Contributing guide](../CONTRIBUTING.md) |
| Report a security issue | [Security policy](../SECURITY.md) |

## How the product is organized

1. **Catalog** — discover a component and inspect its metadata.
2. **Documentation** — understand its purpose, interface, dependencies, and
   configuration.
3. **Playground** — execute prebuilt contract WASM in the native local sandbox.
4. **Integration** — generate a Rust or TypeScript starting point.
5. **Transactions** — simulate and, with explicit wallet confirmation, use the
   controlled Stellar Testnet workflow.

Historical deployment evidence, current candidate authorization, and fresh
post-deployment verification are separate concepts. A registry entry or a
successful local test is not proof of exact on-chain WASM parity.
