// Build the native sandbox-runner for the current deployment/runtime
// platform. This script is intentionally Node-based so the canonical
// `build` script works both on Vercel/Linux and on local Windows development.

import { chmodSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = path.join(root, "contracts");
const executable = path.join(
  contracts,
  "target",
  "release",
  process.platform === "win32" ? "sandbox-runner.exe" : "sandbox-runner",
);

function commandAvailable(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function cargoEnvironment() {
  const cargoBin = path.join(
    process.platform === "win32"
      ? process.env.USERPROFILE ?? ""
      : process.env.HOME ?? "",
    ".cargo",
    "bin",
  );
  const separator = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: [cargoBin, process.env.PATH].filter(Boolean).join(separator),
  };
}

let buildEnvironment = cargoEnvironment();
if (!commandAvailable("cargo")) {
  if (commandAvailable("rustup")) {
    const install = spawnSync(
      "rustup",
      ["toolchain", "install", "stable", "--profile", "minimal"],
      { cwd: contracts, stdio: "inherit", env: buildEnvironment },
    );
    if (install.status !== 0) process.exit(install.status ?? 1);
  } else if (process.platform !== "win32" && commandAvailable("curl")) {
    const install = spawnSync(
      "sh",
      ["-c", "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal"],
      { cwd: contracts, stdio: "inherit", env: buildEnvironment },
    );
    if (install.status !== 0) process.exit(install.status ?? 1);
  } else {
    console.error("[sandbox] cargo is required to build sandbox-runner");
    process.exit(1);
  }
  buildEnvironment = cargoEnvironment();
}

const result = spawnSync(
  "cargo",
  ["build", "--release", "-p", "sandbox-runner"],
  {
    cwd: contracts,
    stdio: "inherit",
    env: {
      ...buildEnvironment,
      CARGO_PROFILE_RELEASE_LTO: "false",
      CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "16",
      CARGO_PROFILE_RELEASE_PANIC: "unwind",
    },
  },
);

if (result.error) {
  console.error(`[sandbox] could not run cargo: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[sandbox] cargo build failed (exit ${result.status})`);
  process.exit(result.status ?? 1);
}

if (!existsSync(executable)) {
  console.error(`[sandbox] runner was not produced at ${executable}`);
  process.exit(1);
}

if (process.platform !== "win32") {
  chmodSync(executable, 0o755);
}

console.log(`[sandbox] sandbox-runner ready: ${executable}`);
