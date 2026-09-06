# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Stellar-Forge, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub's private vulnerability reporting](https://github.com/StellarForgeDev/stellar-forge/security/advisories/new) to submit a report. This ensures the issue can be triaged and addressed before public disclosure.

## What to Include

When reporting a vulnerability, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- The component or area affected (e.g., Playground API, transaction submission, sandbox execution)
- Any suggested fixes if you have them

**Do not include private keys, secret keys, or credentials in your report.**

## Project Scope

Stellar-Forge is a developer tool for exploring and experimenting with Stellar/Soroban building blocks. Important scope limitations:

- **Testnet only** -- the controlled deployment path operates against Stellar Testnet, not Mainnet
- **Not production-ready** -- this project has not been security audited and should not be used for production deployments
- **No server-side persistence** -- the Vercel deployment does not store user data or secrets durably
- **Sandbox isolation** -- the local sandbox executes contract WASM in an isolated environment; the Playground API rejects secret keys

## What We Can Address

We can address:

- Vulnerabilities in the web application (XSS, injection, authentication issues)
- Issues in the transaction submission flow
- Sandbox escape or isolation bypass
- Information disclosure beyond what is publicly documented
- API rate limiting or denial-of-service vectors

## What Is Out of Scope

The following are out of scope for this security policy:

- Vulnerabilities in the Stellar network itself
- Issues in third-party dependencies (report these upstream)
- Theoretical attacks on smart contract logic (the contracts are educational examples, not production deployments)
- Social engineering attacks

## Limitations

This project is maintained by a small team. There is no formal security response SLA or bug bounty program. We will acknowledge receipt of valid reports and work to address confirmed vulnerabilities, but response times may vary.

## Disclosure

We request that you give us reasonable time to address vulnerabilities before public disclosure. We will credit reporters in the fix announcement unless they prefer to remain anonymous.
