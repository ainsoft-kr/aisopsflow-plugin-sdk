# Gmail Plugin

This example plugin provides a thin wrapper around the Gmail REST API.

Supported endpoints:

- `POST /probe`
- `GET /healthz`
- `POST /gmail/messages/list`
- `POST /gmail/messages/get`
- `POST /gmail/messages/send`

Environment variables:

- `PORT`
- `AISOPSFLOW_INTERNAL_AUTH_TOKEN` or `INTERNAL_AUTH_TOKEN`
- `GMAIL_ACCESS_TOKEN`
- `GMAIL_API_BASE_URL` optional, defaults to `https://gmail.googleapis.com/gmail/v1`

This example expects a pre-issued OAuth access token. Token refresh and consent flows
are intentionally left outside the example scope.
