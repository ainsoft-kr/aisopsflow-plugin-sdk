# Public Quickstart

This quickstart is for users who want to run a real AisOpsFlow stack locally using the public compiled images.

## What this runs

- public Core image
- public Runner image
- local Kakao mock provider example
- local Kakao delivery simulator example

This is a real runnable stack, not a mock Core/Runner harness.

## Prerequisites

- Docker
- Docker Compose plugin

## Start

```bash
cd deploy
cp .env.public.example .env.public
docker compose --env-file .env.public -f docker-compose.public.yml up --build
```

## Images used

- `AISOPSFLOW_CORE_IMAGE`
- `AISOPSFLOW_RUNNER_IMAGE`

The example plugins are built locally from this public repository.

Default example values:

- `ghcr.io/aisopsflow/aisopsflow-core:latest`
- `ghcr.io/aisopsflow/aisopsflow-runner:latest`

## Smoke test

You can run the public compose smoke test with:

```bash
bash scripts/smoke-public-compose.sh
```

You may override the images for local verification:

```bash
AISOPSFLOW_CORE_IMAGE=aisopsflow-core:local \
AISOPSFLOW_RUNNER_IMAGE=aisopsflow-runner:local \
bash scripts/smoke-public-compose.sh
```

## Default endpoints

- Core API: `http://localhost:8080`
- Core gRPC: `localhost:50051`

## Default bootstrap login

- email: `admin@local`
- password: value of `AISOPSFLOW_BOOTSTRAP_ADMIN_PASSWORD` in `.env.public`

## Product tiers

- public image tier:
  - intended for general users, local trials, and plugin development
  - uses the public compiled `core` and `runner` images
- commercial tier:
  - distributed separately
  - adds commercial-only features and support terms

## Notes

- This quickstart is intended for public usage and development.
- Commercial deployments should use the commercial image channel and commercial deployment guidance.
- Slack/Email/Telegram examples remain available in this repository, but the default public compose avoids external credential dependencies.
