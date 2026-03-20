# Runner Plugin Runtime v1

This document describes a draft runtime contract for plugins that are started by Runner on demand.

It complements:

- `docs/runner-plugin-manifest-v1.md`
- `docs/runner-plugin-manifest-v1.example.yaml`

## Goal

Runner should be able to:

- locate a plugin from a local manifest
- start its declared entrypoint
- exchange structured requests and responses
- stop or reuse the plugin process

without depending on a long-lived HTTP sidecar.

## Recommended transport

For v1, the recommended transport is:

- `stdio-json`

Meaning:

- Runner writes one JSON message per line to plugin stdin
- plugin writes one JSON message per line to stdout
- stderr is reserved for diagnostics

This keeps the runtime simple and language-neutral.

## Lifecycle

1. Runner resolves capability to a local plugin package
2. Runner reads `runner-plugin.yaml`
3. Runner starts the process from `runtime.entrypoint`
4. Runner waits for readiness
5. Runner sends `probe` or `invoke` messages
6. plugin returns a correlated response
7. Runner keeps the process warm or stops it based on policy

## Message format

### Probe request

```json
{
  "id": "req-1",
  "type": "probe"
}
```

### Probe response

```json
{
  "id": "req-1",
  "ok": true,
  "result": {
    "name": "db-query",
    "version": "0.1.0",
    "capabilities": ["db.read", "db.explain"]
  }
}
```

### Invoke request

```json
{
  "id": "req-2",
  "type": "invoke",
  "capability": "db.read",
  "input": {
    "datasource": "orders-prod-ro",
    "driver": "postgres",
    "statement": "select id from orders limit 10",
    "max_rows": 10
  }
}
```

### Invoke response

```json
{
  "id": "req-2",
  "ok": true,
  "result": {
    "columns": ["id"],
    "rows": [[1], [2]],
    "row_count": 2
  }
}
```

### Error response

```json
{
  "id": "req-2",
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "statement is required"
  }
}
```

## Required behavior

A v1 runtime plugin should:

- read newline-delimited JSON from stdin
- return exactly one response per request id
- keep stdout machine-readable
- write diagnostics only to stderr
- reject malformed JSON with a structured error when possible
- return stable capability names

## Suggested Runner behavior

Runner should:

- validate manifest before startup
- pass only allowlisted env vars
- enforce startup timeout
- enforce per-request timeout
- kill the process on protocol violation
- capture stderr for observability

## Example files

Reference files in this repository:

- `packages/js/runner-plugin-runtime/index.ts`
- `examples/node/db-query/runner-plugin.yaml`
- `examples/node/db-query/src/runner-entrypoint.ts`
- `examples/node/gmail/runner-plugin.yaml`
- `examples/node/gmail/src/runner-entrypoint.ts`
