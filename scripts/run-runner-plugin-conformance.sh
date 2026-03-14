#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node --experimental-strip-types "$ROOT/tests/conformance/runner-runtime/run.mjs" "$@"
