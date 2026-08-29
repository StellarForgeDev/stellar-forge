// Verifies that every committed prebuilt WASM artifact in contracts/prebuilt/
// is byte-identical to a fresh build of the corresponding contract crate.
//
// Design rules (Phase 4.1 T5):
//   * Generic: the set of contract packages is DERIVED from the workspace
//     (contracts/contracts/* minus non-contract crates). No hardcoded list.
//   * Fails loudly: missing prebuilt, missing fresh build, or any byte
//     difference aborts with a non-zero exit and a clear report. It never
//     silently copies or "fixes" anything.
//   * Suitable for CI as a dedicated command.
//
// Usage:
//   node scripts/verify-prebuilt.mjs            build fresh wasm, then compare
//   node scripts/verify-prebuilt.mjs --no-build only compare (assume built)
//   node scripts/verify-prebuilt.mjs --offline  pass --offline to cargo
//
// The wasm target build is invoked via a detached cargo process (so it works
// uniformly in CI and in interactive shells that block on inherited stdio).

import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = path.join(ROOT, "contracts");
const WASM_TARGET = path.join(CONTRACTS, "target", "wasm32v1-none", "release");
const PREBUILT = path.join(CONTRACTS, "prebuilt");

// Crates under contracts/contracts that are not Soroban contracts and therefore
// never produce a deployable wasm artifact. Mirrors scripts/sandbox-build.mjs.
const NON_CONTRACT_PACKAGES = new Set(["sandbox-runner", "greeter", "test-asset"]);

const args = process.argv.slice(2);
const NO_BUILD = args.includes("--no-build");
const OFFLINE = args.includes("--offline") || !!process.env.CARGO_NET_OFFLINE;

function discoverPackages() {
  return readdirSync(path.join(CONTRACTS, "contracts"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !NON_CONTRACT_PACKAGES.has(name))
    .sort();
}

function wasmBaseName(packageName) {
  return `${packageName.replace(/-/g, "_")}.wasm`;
}

function runCargoBuild(packages) {
  return new Promise((resolve, reject) => {
    const logPath = path.join(os.tmpdir(), `verify-prebuilt-cargo-${Date.now()}.log`);
    const fd = openSync(logPath, "a");
    const cargoArgs = [
      "build",
      "--target",
      "wasm32v1-none",
      "--release",
      ...packages.flatMap((p) => ["-p", p]),
    ];
    if (OFFLINE) cargoArgs.push("--offline");
    console.log(`[verify-prebuilt] $ cargo ${cargoArgs.join(" ")}`);
    console.log(`[verify-prebuilt] cargo log: ${logPath}`);
    const child = spawn("cargo", cargoArgs, {
      cwd: CONTRACTS,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: process.env,
    });
    child.unref();
    child.on("error", reject);
    child.on("exit", (code) => {
      closeSync(fd);
      resolve({ code: code ?? 1, logPath });
    });
  });
}

function compare(packageName) {
  const fresh = path.join(WASM_TARGET, wasmBaseName(packageName));
  const prebuilt = path.join(PREBUILT, `${packageName}.wasm`);
  if (!existsSync(fresh)) {
    return { packageName, status: "missing-fresh", detail: fresh };
  }
  if (!existsSync(prebuilt)) {
    return { packageName, status: "missing-prebuilt", detail: prebuilt };
  }
  const a = readFileSync(fresh);
  const b = readFileSync(prebuilt);
  if (a.length !== b.length || !a.equals(b)) {
    return {
      packageName,
      status: "mismatch",
      detail: `${a.length} bytes fresh vs ${b.length} bytes prebuilt`,
    };
  }
  return { packageName, status: "ok", detail: `${a.length} bytes` };
}

async function main() {
  const packages = discoverPackages();
  if (packages.length === 0) {
    console.error("[verify-prebuilt] no contract packages discovered");
    process.exit(1);
  }
  console.log(`[verify-prebuilt] discovered ${packages.length} contract packages`);

  if (!NO_BUILD) {
    const { code, logPath } = await runCargoBuild(packages);
    if (code !== 0) {
      console.error(`[verify-prebuilt] cargo build failed (exit ${code}) — see ${logPath}`);
      process.exit(1);
    }
  }

  mkdirSync(PREBUILT, { recursive: true });
  const results = packages.map(compare);
  let failed = 0;
  for (const r of results) {
    if (r.status === "ok") {
      console.log(`[verify-prebuilt] OK   ${r.packageName} (${r.detail})`);
    } else {
      failed += 1;
      console.error(`[verify-prebuilt] FAIL ${r.packageName}: ${r.status} (${r.detail})`);
    }
  }

  if (failed > 0) {
    console.error(`[verify-prebuilt] ${failed} artifact(s) failed integrity verification`);
    process.exit(1);
  }
  console.log("[verify-prebuilt] all prebuilt WASM artifacts verified OK");
}

main().catch((err) => {
  console.error("[verify-prebuilt] unexpected error:", err);
  process.exit(1);
});
