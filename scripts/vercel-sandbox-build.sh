#!/usr/bin/env bash
# Builds the native sandbox-runner for the Playground API route on Vercel's
# Linux build environment.
#
# The runner is compiled from source on the deployment platform, so the
# binary always matches the function runtime (x86-64 Linux with the correct
# glibc). Contract WASM artifacts are platform-independent and ship prebuilt
# in contracts/prebuilt/ — they are not rebuilt here.
#
# Runs as the `vercel-build` script (Vercel invokes it instead of `build`).
set -euo pipefail

cd "$(dirname "$0")/../contracts"

if ! command -v cargo >/dev/null 2>&1; then
  if command -v rustup >/dev/null 2>&1; then
    echo "[sandbox] installing stable Rust toolchain via rustup" >&2
    rustup toolchain install stable --profile minimal
  else
    echo "[sandbox] installing rustup" >&2
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  fi
fi

echo "[sandbox] building sandbox-runner (release) into contracts/target/release/" >&2
# The workspace release profile is tuned for the contract wasm (LTO, panic=abort).
# For the native runner build on Vercel we relax those settings: LTO off keeps
# build time reasonable, and panic=unwind keeps the runner's catch_unwind
# safety net functional in release builds.
CARGO_PROFILE_RELEASE_LTO=false \
CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 \
CARGO_PROFILE_RELEASE_PANIC=unwind \
cargo build --release -p sandbox-runner

# Ensure the binary is executable. Next.js output tracing copies the runner
# into the serverless bundle; reinforcing the mode here guards against a lost
# executable bit (which would make execFile fail at runtime on Vercel).
chmod +x "target/release/sandbox-runner" 2>/dev/null || true

echo "[sandbox] sandbox-runner ready" >&2