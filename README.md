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
3. Choose one publishing path.

### GHCR Path

1. Build OCI images:
   - `make build-all`
   - `make build-all-ghcr`
   - or `make build-<plugin-name>`
2. Authenticate to GHCR using release env settings:
   - `make ghcr-login`
3. Push official images:
   - `make push-all`
   - `make push-all-ghcr`
   - or `make push-<plugin-name>`
4. Delete published GHCR packages when cleanup is needed:
   - `make delete-all`
   - `make delete-all-ghcr`
   - or `make delete-<plugin-name> VERSION=<tag>`
   - use `VERSION=all` to delete the whole package instead of a tagged version
   - requires `gh` CLI and `GHCR_TOKEN` with package delete permission

### Catalog Server Path

1. Build plugin bundles:
   - `make build-all-catalog`
   - or `make build-catalog-<plugin-name>`
2. Publish bundles to the Yesod catalog server:
   - `make push-all-catalog CATALOG_TOKEN=<publish-token>`
   - or `make push-catalog-<plugin-name> CATALOG_TOKEN=<publish-token>`
3. The catalog publish path now performs:
   - bundle archive build into `.dist/catalog/`
   - `POST /api/publish` to the catalog server
   - catalog manifest export back into `../aisopsflow-plugin-catalog/plugins/official/`
   - channel promote using `CATALOG_CHANNEL` which defaults to `stable`
4. Catalog publish targets check `$(CATALOG_BASE_URL)/healthz` first and fail with a clear message if the catalog server is down
5. Set `CATALOG_REPO`, `CATALOG_BASE_URL`, `CATALOG_TOKEN`, `CATALOG_PLATFORM`, and `CATALOG_CHANNEL` as needed
6. You can store catalog publish settings in `deploy/.env.catalog`
   - start from `deploy/.env.catalog.example`
   - `Makefile` loads `deploy/.env.catalog` automatically when it exists

For the catalog server path, Runner runtime config should use catalog-backed resolution instead of GHCR image refs.

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
