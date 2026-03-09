# Security Signing

All internal plugin requests must verify three headers:

- `X-Internal-Auth`
- `X-Internal-Timestamp`
- `X-Internal-Signature`

## Canonical input

Signature input should be derived from:

- timestamp
- HTTP method
- request path or full URL as defined by the helper
- raw request body bytes

## Validation rules

- reject missing headers
- reject stale timestamps
- use constant-time compare for auth token and signature
- compute signature from raw body, not reparsed JSON

## Reference helper

JS helper:
- `packages/js/internal-auth/internal-auth.js`
