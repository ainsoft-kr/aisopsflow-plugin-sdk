#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "README.md"
  "docs/plugin-api-v1.md"
  "docs/publishing.md"
  "docs/security-signing.md"
  "packages/js/internal-auth/internal-auth.js"
  "tests/conformance/README.md"
)

for path in "${required_files[@]}"; do
  [[ -f "$path" ]] || {
    echo "missing required file: $path" >&2
    exit 1
  }
done

example_entries=(
  "examples/node/email/src/index.js"
  "examples/node/kakao-provider-mock/src/index.js"
  "examples/node/kakao-webhook-simulator/src/index.js"
  "examples/node/slack/src/index.js"
  "examples/node/telegram/src/index.js"
)

for path in "${example_entries[@]}"; do
  node --check "$path"
done
