# AisOpsFlow Plugin SDK

Public SDK repository for building AisOpsFlow plugins.

## Includes

- plugin HTTP/JSON contract docs
- runner-managed plugin manifest draft
- runner-managed `stdio-json` runtime draft
- internal auth signing docs
- official Node plugin implementations
- runnable example fixtures
- JS internal auth helper
- executable conformance self-test harness

This repository contains both:

- `plugins/official/`: official plugin implementations that are built and published
- `examples/`: learning fixtures, simulators, and minimal examples

## Layout

- `docs/`
- `deploy/`
- `plugins/official/`
- `examples/node/`
- `packages/js/internal-auth/`
- `tests/conformance/`

## Official Plugins

- `channel-slack/`
- `channel-email/`
- `channel-telegram/`
- `kakao-provider/`
- `db-query/`
- `gmail/`
- `microsoft-email/`
- `microsoft-office/`

These are the plugin packages targeted by:

- `Makefile`
- catalog entries
- OCI image publishing
- conformance validation

## Examples And Fixtures

- `kakao-webhook-simulator/`

`examples/node/` is reserved for non-official samples and fixtures.
If code is intended for catalog registration and GHCR publishing, it belongs under `plugins/official/`.

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
