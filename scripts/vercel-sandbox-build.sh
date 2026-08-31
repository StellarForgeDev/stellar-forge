#!/usr/bin/env bash
# Compatibility wrapper for callers that still invoke the historical Vercel
# build helper directly. The canonical package build invokes the same
# platform-independent Node script.
set -euo pipefail

node "$(dirname "$0")/build-sandbox-runner.mjs"
