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
//   node scripts/verify-prebuilt.mjs                         build fresh wasm, then compare and verify sidecars
//   node scripts/verify-prebuilt.mjs --no-build              only compare (assume built) and verify sidecars
//   node scripts/verify-prebuilt.mjs --offline               pass --offline to cargo
//   node scripts/verify-prebuilt.mjs --from-package <dir>    checksum-only verification of an external artifact directory (no Cargo)
//   node scripts/verify-prebuilt.mjs --generate              generate metadata/checksums from existing prebuilt WASM (no Cargo)
//
// The wasm target build is invoked via a detached cargo process (so it works
// uniformly in CI and in interactive shells that block on inherited stdio).

import { spawn, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
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
const GENERATE = args.includes("--generate");
const OFFLINE = args.includes("--offline") || !!process.env.CARGO_NET_OFFLINE;

// --from-package <dir> or --from-package=<dir> : checksum-only verification of an external artifact directory
function parseFromPackageArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from-package" && i + 1 < argv.length) {
      return argv[i + 1];
    }
    if (arg.startsWith("--from-package=")) {
      return arg.slice("--from-package=".length);
    }
  }
  return null;
}
const FROM_PACKAGE_DIR = parseFromPackageArg(args);

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


// Soroban contract metadata embeds the source path. Normalize only those
// source-path separators so artifacts generated on Windows and Linux have the
// same canonical bytes without rewriting arbitrary contract data.
function canonicalizeWasm(data) {
  const normalized = data
    .toString("latin1")
    .replace(/(?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+\.rs/g, (sourcePath) => sourcePath.replaceAll("\\", "/"));
  return Buffer.from(normalized, "latin1");
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
  const a = canonicalizeWasm(readFileSync(fresh));
  const b = canonicalizeWasm(readFileSync(prebuilt));
  if (a.length !== b.length || !a.equals(b)) {
    return {
      packageName,
      status: "mismatch",
      detail: `${a.length} bytes fresh vs ${b.length} bytes prebuilt`,
    };
  }
  return { packageName, status: "ok", detail: `${a.length} bytes` };
}

function computeSha256(filePath) {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getGitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function getSdkVersion() {
  try {
    const content = readFileSync(path.join(CONTRACTS, "Cargo.toml"), "utf8");
    const match = content.match(/soroban-sdk\s*=\s*"?(\d+)"?/);
    if (match) return match[1];
  } catch {}
  return "unknown";
}

function getToolchain() {
  try {
    const content = readFileSync(path.join(ROOT, "rust-toolchain.toml"), "utf8");
    const match = content.match(/channel\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {}
  return "unknown";
}

function generateMetadataAndChecksums(packages) {
  const version = getPackageVersion();
  const gitCommit = getGitCommit();
  const sdkVersion = getSdkVersion();
  const toolchain = getToolchain();
  const target = "wasm32v1-none";

  const contracts = {};
  const checksums = [];

  for (const pkg of packages) {
    const file = `${pkg}.wasm`;
    const filePath = path.join(PREBUILT, file);
    if (!existsSync(filePath)) {
      console.error(`[verify-prebuilt] missing prebuilt for metadata: ${filePath}`);
      process.exit(1);
    }
    const sha256 = computeSha256(filePath);
    const crate = pkg.replace(/-/g, "_");
    contracts[pkg] = {
      package: pkg,
      crate,
      file,
      sha256,
    };
    checksums.push({ file, sha256 });
  }

  // Deterministic: contracts sorted by key (packages already sorted), checksums sorted by file
  const metadata = {
    version,
    gitCommit,
    sdkVersion,
    target,
    toolchain,
    contracts,
  };

  const metadataPath = path.join(PREBUILT, "metadata.json");
  const checksumsPath = path.join(PREBUILT, "checksums.txt");

  // Write metadata deterministically (2-space indent, sorted keys already)
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
  console.log(`[verify-prebuilt] wrote ${path.relative(ROOT, metadataPath)}`);

  // checksums.txt: "<sha256>  <filename>\n" sorted by filename (packages sorted)
  const checksumsContent = checksums
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((c) => `${c.sha256}  ${c.file}`)
    .join("\n") + "\n";
  writeFileSync(checksumsPath, checksumsContent, "utf8");
  console.log(`[verify-prebuilt] wrote ${path.relative(ROOT, checksumsPath)}`);
}

function verifyFromPackage(dir) {
  const absDir = path.isAbsolute(dir) ? dir : path.resolve(ROOT, dir);
  console.log(`[verify-prebuilt] checksum-only verification from ${absDir}`);

  const metadataPath = path.join(absDir, "metadata.json");
  const checksumsPath = path.join(absDir, "checksums.txt");

  if (!existsSync(metadataPath)) {
    console.error(`[verify-prebuilt] missing metadata.json in ${absDir}`);
    process.exit(1);
  }
  if (!existsSync(checksumsPath)) {
    console.error(`[verify-prebuilt] missing checksums.txt in ${absDir}`);
    process.exit(1);
  }

  const metadata = readJsonIfExists(metadataPath);
  const checksumsRaw = readFileSync(checksumsPath, "utf8");

  const wasmFilesOnDisk = readdirSync(absDir)
    .filter(f => f.endsWith(".wasm"))
    .map(file => ({
      file,
      hash: computeSha256(path.join(absDir, file))
    }));

  const result = verifyArtifactIntegrity({
    metadata,
    checksumsRaw,
    wasmFilesOnDisk
  });

  if (!result.success) {
    for (const err of result.errors) {
      console.error(`[verify-prebuilt] ${err}`);
    }
    console.error(`[verify-prebuilt] ${result.errors.length} artifact(s) failed checksum verification`);
    process.exit(1);
  }
  console.log("[verify-prebuilt] all checksums verified OK (checksum-only mode)");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeArtifactSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isSafeWasmBasename(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.wasm$/.test(value) && !path.isAbsolute(value);
}

function safeArtifactPath(dir, file) {
  if (!isSafeWasmBasename(file)) return null;
  const root = path.resolve(dir);
  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

async function main() {
  // Checksum-only mode for external artifact directories (no Cargo required)
  if (FROM_PACKAGE_DIR) {
    verifyFromPackage(FROM_PACKAGE_DIR);
    return;
  }

  const packages = discoverPackages();
  if (packages.length === 0) {
    console.error("[verify-prebuilt] no contract packages discovered");
    process.exit(1);
  }
  if (GENERATE) {
    generateMetadataAndChecksums(packages);
    return;
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
  verifyFromPackage(PREBUILT);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[verify-prebuilt] unexpected error:", err);
    process.exit(1);
  });
}


export function verifyArtifactIntegrity({
  metadata,
  checksumsRaw,
  wasmFilesOnDisk
}) {
  const errors = [];

  if (!metadata || typeof metadata !== "object") {
    errors.push("invalid metadata.json");
    return { success: false, errors };
  }

  for (const field of ["version", "gitCommit", "sdkVersion", "target", "toolchain"]) {
    if (typeof metadata[field] !== "string" || metadata[field].trim().length === 0) {
      errors.push(`metadata.json ${field} must be a non-empty string`);
    }
  }

  if (metadata.gitCommit !== "unknown" && !/^[a-f0-9]{40}$/.test(metadata.gitCommit)) {
    errors.push("metadata.json gitCommit must be a 40-character hexadecimal commit or unknown");
  }

  if (!Object.prototype.hasOwnProperty.call(metadata, "contracts")) {
    errors.push("metadata.json missing field: contracts");
    return { success: false, errors };
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  if (!isPlainObject(metadata.contracts)) {
    errors.push("metadata.contracts must be a plain object");
    return { success: false, errors };
  }

  const metadataContracts = Object.keys(metadata.contracts).sort();
  if (metadataContracts.length === 0) {
    errors.push("metadata.contracts is empty");
    return { success: false, errors };
  }

  if (typeof checksumsRaw !== "string") {
    errors.push("invalid checksums.txt");
    return { success: false, errors };
  }

  const lines = checksumsRaw.split("\n").filter((l) => l.trim().length > 0);
  const checksumsMap = new Map();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+(\S+)$/);
    if (!match) {
      errors.push(`invalid checksums.txt line: ${line}`);
      continue;
    }
    const [, hash, file] = match;
    if (checksumsMap.has(file)) {
      errors.push(`duplicate checksums.txt entry: ${file}`);
    }
    checksumsMap.set(file, hash);
  }

  if (checksumsMap.size !== metadataContracts.length) {
    errors.push(`metadata and checksums artifact count mismatch: ${metadataContracts.length} vs ${checksumsMap.size}`);
  }

  const onDiskMap = new Map();
  for (const { file, hash } of wasmFilesOnDisk) {
    onDiskMap.set(file, hash);
  }

  for (const slug of metadataContracts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.push(`unsafe metadata contract key: ${slug}`);
      continue;
    }
    const entry = metadata.contracts[slug];
    if (!isPlainObject(entry)) {
      errors.push(`metadata missing entry for ${slug}`);
      continue;
    }
    const { package: pkg, crate, file, sha256 } = entry;
    if (typeof pkg !== "string" || typeof crate !== "string" || typeof file !== "string" || typeof sha256 !== "string") {
      errors.push(`metadata entry for ${slug} has invalid fields`);
      continue;
    }
    if (pkg !== slug) {
      errors.push(`metadata ${slug} package mismatch: ${pkg}`);
    }
    if (crate !== pkg.replace(/-/g, "_")) {
      errors.push(`metadata ${slug} crate mismatch: ${crate}`);
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.wasm$/.test(file)) {
      errors.push(`metadata ${slug} file is unsafe: ${file}`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      errors.push(`metadata ${slug} has invalid sha256: ${sha256}`);
      continue;
    }
    const expectedFile = `${pkg}.wasm`;
    if (file !== expectedFile) {
      errors.push(`metadata ${slug} file mismatch: expected ${expectedFile}, got ${file}`);
      continue;
    }

    if (!onDiskMap.has(file)) {
      errors.push(`missing WASM for ${slug}: ${file}`);
      continue;
    }

    const actualHash = onDiskMap.get(file);
    if (actualHash !== sha256) {
      errors.push(`hash mismatch for ${file}: expected ${sha256}, got ${actualHash}`);
    }

    const checksumsHash = checksumsMap.get(file);
    if (!checksumsHash) {
      errors.push(`checksums.txt missing entry for ${file}`);
    } else if (checksumsHash !== sha256) {
      errors.push(`metadata vs checksums mismatch for ${file}: ${sha256} vs ${checksumsHash}`);
    } else if (checksumsHash !== actualHash) {
      errors.push(`checksums.txt hash mismatch for ${file}`);
    }
  }

  for (const file of checksumsMap.keys()) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.wasm$/.test(file)) {
      if (!errors.some(e => e.includes(`checksums.txt filename is unsafe: ${file}`))) {
        errors.push(`checksums.txt filename is unsafe: ${file}`);
      }
      continue;
    }
    const slug = file.replace(/\.wasm$/, "");
    if (!metadataContracts.includes(slug)) {
      errors.push(`checksums.txt has extra entry not in metadata: ${file}`);
    }
  }

  for (const file of onDiskMap.keys()) {
    const slug = file.replace(/\.wasm$/, "");
    if (!metadataContracts.includes(slug)) {
      errors.push(`unexpected extra WASM file on disk: ${file}`);
    }
  }

  return { success: errors.length === 0, errors };
}
