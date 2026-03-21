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
- `plugins/official/channel/`
- `plugins/official/provider/`
- `examples/node/`
- `packages/js/internal-auth/`
- `tests/conformance/`

## Official Plugins

- `channel/slack/`
- `channel/email/`
- `channel/telegram/`
- `channel/kakao/`
- `provider/gmail/`
- `provider/microsoft-email/`
- `provider/db-query/`
- `provider/microsoft-office/` local Excel, Word, and PowerPoint generation
- `provider/microsoft-office-graph/` Microsoft Graph drive adapter

These are the plugin packages targeted by:

- `Makefile`
- catalog entries
- OCI image publishing
- conformance validation

## Official Release Flow

1. Implement or update the plugin under the matching category path such as `plugins/official/channel/<plugin-name>/` or `plugins/official/provider/<plugin-name>/`
2. Run local validation:
   - `bash scripts/validate-sdk.sh`
3. Build OCI images:
   - `make build-all`
   - or `make build-<plugin-name>`
   - or `make plugin TARGET=<plugin-name> CATEGORY=<channel|provider> CMD=build`
4. Authenticate to GHCR using release env settings:
   - `make ghcr-login`
5. Push official images:
   - `make push-all`
   - or `make push-<plugin-name>`
   - or `make plugin TARGET=<plugin-name> CATEGORY=<channel|provider> CMD=push`
6. Delete published GHCR packages when cleanup is needed:
   - `make delete-all`
   - or `make delete-<plugin-name> VERSION=<tag>`
   - or `make plugin TARGET=<plugin-name> CATEGORY=<channel|provider> CMD=delete VERSION=<tag>`
   - use `VERSION=all` to delete the whole package instead of a tagged version
   - requires `gh` CLI and `GHCR_TOKEN` with package delete permission
7. Update catalog entries to the published image reference
8. Update Runner runtime config to reference the published plugin image

Published image paths are category-scoped:

- `$(REGISTRY)/$(IMAGE_NAMESPACE)/channel/<plugin>:latest`
- `$(REGISTRY)/$(IMAGE_NAMESPACE)/provider/<plugin>:latest`

`deploy/.env.release` is intentionally ignored and should only contain local release credentials.

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
