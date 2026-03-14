# AisOpsFlow Plugin SDK

Public SDK/examples repository for building AisOpsFlow plugins.

## Includes

- plugin HTTP/JSON contract docs
- internal auth signing docs
- first-party Node examples
- JS internal auth helper
- executable conformance self-test harness

This repository does not publish official product images.
Public and commercial product images are built from the private enterprise repository.

## Layout

- `docs/`
- `deploy/`
- `examples/node/`
- `packages/js/internal-auth/`
- `tests/conformance/`

## Current examples

- `slack/`
- `email/`
- `telegram/`
- `gmail/`
- `microsoft-email/`
- `microsoft-office/`
- `db-query-mock/`
- `kakao-provider-mock/`
- `kakao-webhook-simulator/`

The Dockerfiles inside `examples/node/` are example packaging assets for plugin authors.
They are not an official image release pipeline.

## Conformance

Run the built-in self-test harness with:

- `scripts/run-conformance.sh`
- `node tests/conformance/run.mjs --self-test`

To test a running plugin instance:

- `node tests/conformance/run.mjs --url http://127.0.0.1:9000 --token your-internal-token`

## Public stack

For a real local stack that uses the public compiled Core/Runner images, see:

- `docs/public-quickstart.md`
- `deploy/docker-compose.public.yml`

The smoke test entrypoint is:

- `scripts/smoke-public-compose.sh`

## License direction

Recommended public license:
- SDK/docs/helpers: Apache-2.0
- examples/templates: MIT
