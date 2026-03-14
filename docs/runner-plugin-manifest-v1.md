# Runner Plugin Manifest v1

This document defines a draft manifest format for plugins that are started by Runner on demand.

The goal is to support:

- capability-based plugin resolution
- local process execution
- explicit runtime packaging
- secret and permission declaration
- predictable lifecycle management

## Status

This is a draft proposal, not a final compatibility promise.

Reference example:

- `docs/runner-plugin-manifest-v1.example.yaml`

## Top-level structure

```yaml
api_version: runner-plugin/v1
kind: RunnerPlugin
metadata: {}
runtime: {}
install: {}
capabilities: {}
execution: {}
env: {}
permissions: {}
security: {}
compatibility: {}
observability: {}
examples: {}
```

## Field reference

### `api_version`

- fixed value for this draft: `runner-plugin/v1`

### `kind`

- fixed value: `RunnerPlugin`

### `metadata`

Required identification fields for registry and audit views.

Recommended fields:

- `name`
- `display_name`
- `plugin_version`
- `publisher`
- `description`
- `homepage`

### `runtime`

Describes how Runner starts the plugin.

Required fields:

- `type`
- `entrypoint`
- `protocol`

Recommended `type` values:

- `node`
- `python`
- `binary`

Recommended `protocol` values:

- `stdio-json`
- future option: `local-http`

### `install`

Describes local layout assumptions after installation.

Recommended fields:

- `layout`
- `root`

For the first version, `unpacked-directory` is a good default.

### `capabilities`

Describes what this plugin provides.

Required fields:

- `provides`

Example:

```yaml
capabilities:
  provides:
    - gmail.read
    - gmail.send
```

### `execution`

Defines lifecycle and scheduling limits.

Recommended fields:

- `startup_timeout_seconds`
- `request_timeout_seconds`
- `idle_ttl_seconds`
- `max_concurrency`
- `restart_policy`

Recommended `restart_policy` values:

- `never`
- `on-failure`

### `env`

Declares environment variables that Runner may inject.

Split fields:

- `required`
- `optional`

Each item should declare:

- `name`
- `secret`
- `description`
- optionally `default`

This gives Runner a safe allowlist for env injection.

### `permissions`

Declares requested runtime permissions.

Recommended sections:

- `network.outbound`
- `filesystem.read`
- `filesystem.write`

This is a declaration layer. Runner policy still decides what is actually granted.

### `security`

Declares security expectations.

Recommended fields:

- `verification.internal_auth`
- `verification.signed_manifest`
- `data_handling.log_secrets`
- `data_handling.redact_fields`

### `compatibility`

Declares version compatibility.

Recommended sections:

- `runner_api`
- `product`

Example:

```yaml
compatibility:
  runner_api:
    min: v1
    max: v1
  product:
    min: 0.1.0
    max: 0.x
```

### `observability`

Declares how Runner should interpret health and logs.

Recommended fields:

- `health_check.type`
- `health_check.success_pattern`
- `logs.format`

### `examples`

Optional examples for documentation and validation tooling.

## Recommended validation rules

Runner should reject manifests when:

- `api_version` is unknown
- `kind` is invalid
- `runtime.entrypoint` is missing
- no capabilities are declared
- required env entries have duplicate names
- execution timeouts are invalid
- requested permissions exceed local policy

## Design intent

This manifest is meant to support the architecture where:

- Core selects a workflow or planned job
- Core references plugin capabilities
- Runner resolves capability to a local plugin package
- Runner starts the plugin only when needed

That keeps:

- `skill` in Core for reasoning
- `plugin` in Runner for execution

while reducing the need for many always-on plugin sidecars.
