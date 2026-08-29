// Builds the artifacts the Playground API needs for local development:
//   1. the native sandbox-runner executable (cargo build),
//   2. the contract wasm artifacts (cargo build --target wasm32v1-none).
//
// Usage:
//   node scripts/sandbox-build.mjs            build for local development
//   node scripts/sandbox-build.mjs --prebuilt also refresh contracts/prebuilt/*.wasm
//
// The prebuilt wasm files are committed and used on Vercel, where the Rust +
// wasm32v1-none toolchain is unavailable. They are produced by plain
// `cargo build` (no Stellar CLI), which is the SAME method used by
// scripts/verify-prebuilt.mjs so the committed artifacts stay byte-for-byte
// reproducible. The runner is never committed: locally it is built here, and
// on Vercel it is compiled by scripts/vercel-sandbox-build.sh.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = path.join(ROOT, "contracts");
const PREBUILT = path.join(CONTRACTS, "prebuilt");
const WASM_TARGET = path.join(CONTRACTS, "target", "wasm32v1-none", "release");

const updatePrebuilt = process.argv.includes("--prebuilt");

function run(command, args, cwd) {
  console.log(`[sandbox] $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[sandbox] ${command} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

run("cargo", ["build", "-p", "sandbox-runner"], CONTRACTS);

// Directories under contracts/contracts that are not Soroban contracts
// (and therefore never produce a wasm artifact).
// `test-asset` is a fixture used only by Payment's Rust tests; it is not a
// catalog component and must not be treated as a deployable wasm artifact.
const NON_CONTRACT_PACKAGES = new Set(["sandbox-runner", "greeter", "test-asset"]);

const implementedPackages = readdirSync(path.join(CONTRACTS, "contracts"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !NON_CONTRACT_PACKAGES.has(name))
  .sort();

// Cargo crate names replace hyphens with underscores, so the compiled wasm
// artifact uses the crate name (e.g. package "access-control" -> "access_control.wasm")
// rather than the package directory name. Prebuilt files are stored under the
// package name (resolveWasm falls back to `${package}.wasm`), so only the
// build-target lookup needs the crate-derived name.
function wasmBaseName(packageName) {
  return `${packageName.replace(/-/g, "_")}.wasm`;
}

for (const packageName of implementedPackages) {
  const wasm = path.join(WASM_TARGET, wasmBaseName(packageName));
  if (!existsSync(wasm)) {
    run(
      "cargo",
      ["build", "--target", "wasm32v1-none", "--release", "-p", packageName],
      CONTRACTS,
    );
  }
}

const available = implementedPackages.filter((packageName) =>
  existsSync(path.join(WASM_TARGET, wasmBaseName(packageName))),
);

if (available.length === 0) {
  console.error(
    "[sandbox] no wasm artifacts found — run `stellar contract build` from contracts/ first",
  );
  process.exit(1);
}

console.log(`[sandbox] wasm artifacts available: ${available.join(", ")}`);

if (updatePrebuilt) {
  mkdirSync(PREBUILT, { recursive: true });
  for (const packageName of available) {
    const source = path.join(WASM_TARGET, wasmBaseName(packageName));
    const destination = path.join(PREBUILT, `${packageName}.wasm`);
    copyFileSync(source, destination);
    console.log(`[sandbox] refreshed ${path.relative(ROOT, destination)}`);
  }
  console.log(
    "[sandbox] remember to commit the refreshed prebuilt wasm files",
  );
}

console.log("[sandbox] done");