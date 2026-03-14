# Runner Plugin Runtime Helper

Small helper for building `stdio-json` Runner plugins in Node.js.

The helper:

- reads one JSON message per line from stdin
- dispatches `probe` and `invoke` requests
- writes one JSON response per line to stdout

This is a draft helper for the proposed Runner-managed on-demand plugin runtime.
