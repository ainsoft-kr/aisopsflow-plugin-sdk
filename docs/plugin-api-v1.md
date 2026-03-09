# Plugin API v1

A plugin is an HTTP service that runs beside the Runner.

## Transport

- protocol: HTTP/1.1 or HTTP/2
- content type: `application/json`
- auth headers:
  - `X-Internal-Auth`
  - `X-Internal-Timestamp`
  - `X-Internal-Signature`

## Channel plugin endpoints

### `POST /send`

Used by channel-style plugins such as Slack, Email, Telegram.

Example request:

```json
{
  "target": "slack.#ops",
  "text": "deployment failed",
  "blocks": []
}
```

Example response:

```json
{
  "ok": true,
  "status": 200,
  "body": "accepted"
}
```

## Provider plugin endpoints

### `POST /kakao/alimtalk/send`

Example request:

```json
{
  "tenant_id": "t_default",
  "template_id": "ops_alert_v1",
  "to": ["01012345678"],
  "vars": {"host": "web-1"},
  "trace_id": "tr_123"
}
```

## Verification requirements

A v1 plugin must:

- return JSON responses
- verify signed internal headers
- avoid logging secrets
- handle malformed JSON with 4xx responses
- keep endpoint behavior stable across patch releases
