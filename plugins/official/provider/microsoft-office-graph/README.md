# Microsoft Office Graph Plugin

This plugin is a Microsoft Graph drive item adapter for Word, Excel, and PowerPoint files
stored in OneDrive or SharePoint document libraries.

Supported endpoints:

- `POST /probe`
- `GET /healthz`
- `POST /office/files/get`
- `POST /office/files/create`
- `POST /office/files/update`
- `POST /office/files/delete`

Environment variables:

- `PORT`
- `AISOPSFLOW_INTERNAL_AUTH_TOKEN` or `INTERNAL_AUTH_TOKEN`
- `MICROSOFT_GRAPH_ACCESS_TOKEN`
- `MICROSOFT_GRAPH_BASE_URL` optional, defaults to `https://graph.microsoft.com/v1.0`

This example expects a pre-issued Graph access token. Approval and policy around create/update/delete
should be enforced by Core before dispatch.
