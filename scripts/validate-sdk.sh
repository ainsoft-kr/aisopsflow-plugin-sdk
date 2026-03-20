#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "README.md"
  "deploy/.env.public.example"
  "deploy/docker-compose.public.yml"
  "docs/public-quickstart.md"
  "docs/plugin-api-v1.md"
  "docs/publishing.md"
  "docs/security-signing.md"
  "docs/runner-plugin-manifest-v1.md"
  "docs/runner-plugin-manifest-v1.example.yaml"
  "docs/runner-plugin-runtime-v1.md"
  "packages/js/internal-auth/internal-auth.ts"
  "packages/js/runner-plugin-runtime/index.ts"
  "packages/js/runner-plugin-runtime/manifest.ts"
  "packages/js/runner-plugin-runtime/host.ts"
  "scripts/run-conformance.sh"
  "scripts/run-runner-plugin-conformance.sh"
  "scripts/smoke-public-compose.sh"
  "tests/conformance/README.md"
  "tests/conformance/run.mjs"
  "tests/conformance/fixtures/channel-fixture.mjs"
  "tests/conformance/runner-runtime/run.mjs"
  "tsconfig.json"
)

for path in "${required_files[@]}"; do
  [[ -f "$path" ]] || {
    echo "missing required file: $path" >&2
    exit 1
  }
done

example_entries=(
  "plugins/official/channel-email/src/index.ts"
  "plugins/official/kakao-provider/src/index.ts"
  "examples/node/kakao-webhook-simulator/src/index.ts"
  "plugins/official/channel-slack/src/index.ts"
  "plugins/official/channel-telegram/src/index.ts"
  "plugins/official/db-query/src/runner-entrypoint.ts"
  "plugins/official/gmail/src/runner-entrypoint.ts"
)

for path in "${example_entries[@]}"; do
  node --check "$path"
done

node --experimental-strip-types tests/conformance/run.mjs --self-test
node --experimental-strip-types tests/conformance/runner-runtime/run.mjs

if command -v docker >/dev/null 2>&1; then
  docker compose --env-file deploy/.env.public.example -f deploy/docker-compose.public.yml config >/dev/null
fi
