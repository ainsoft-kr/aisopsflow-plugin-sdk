# Microsoft Email Plugin

This example plugin wraps Microsoft Graph mail APIs for Outlook / Microsoft 365 mailboxes.

Supported endpoints:

- `POST /probe`
- `GET /healthz`
- `POST /mail/messages/list`
- `POST /mail/messages/get`
- `POST /mail/messages/send`

Environment variables:

- `PORT`
- `AISOPSFLOW_INTERNAL_AUTH_TOKEN` or `INTERNAL_AUTH_TOKEN`
- `MICROSOFT_GRAPH_ACCESS_TOKEN`
- `MICROSOFT_GRAPH_BASE_URL` optional, defaults to `https://graph.microsoft.com/v1.0`

This example expects a pre-issued Graph access token. OAuth consent and refresh are not handled here.
