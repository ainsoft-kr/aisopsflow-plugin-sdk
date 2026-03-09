# AisOpsFlow Plugin SDK

Public SDK/examples repository for building AisOpsFlow plugins.

## Includes

- plugin HTTP/JSON contract docs
- internal auth signing docs
- first-party Node examples
- JS internal auth helper
- placeholder conformance test area

This repository does not publish any official AisOpsFlow product images.
The official product images are built only from the private enterprise repository.

## Layout

- `docs/`
- `examples/node/`
- `packages/js/internal-auth/`
- `tests/conformance/`

## Current examples

- `slack/`
- `email/`
- `telegram/`
- `kakao-provider-mock/`
- `kakao-webhook-simulator/`

The Dockerfiles inside `examples/node/` are example packaging assets for plugin authors.
They are not an official image release pipeline.

## License direction

Recommended public license:
- SDK/docs/helpers: Apache-2.0
- examples/templates: MIT
