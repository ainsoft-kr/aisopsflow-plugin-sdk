# Conformance Tests

The SDK now includes an executable self-test harness:

```bash
node tests/conformance/run.mjs --self-test
```

or:

```bash
scripts/run-conformance.sh
```

Current coverage:

- `POST /probe` JSON contract
- `POST /send` success contract
- internal auth enforcement
- malformed JSON handling
- invalid request body handling
- timeout handling
- missing internal auth configuration handling

The default run mode starts an in-process fixture plugin with the public JS
internal-auth helper and verifies the HTTP contract end-to-end without any
external services.

You can also point the suite at a running plugin:

```bash
node tests/conformance/run.mjs --url http://127.0.0.1:9000 --token your-internal-token
```
