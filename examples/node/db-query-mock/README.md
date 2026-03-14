# DB Query Mock Plugin

This is a minimal Node example plugin for database-style read queries.

It is intended to demonstrate:

- internal auth verification
- read-only request validation
- normalized JSON result shapes
- a safe mock target for Core and Runner integration tests

Available endpoints:

- `POST /probe`
- `GET /healthz`
- `POST /query/read`
- `POST /query/explain`

Environment variables:

- `PORT`
- `AISOPSFLOW_INTERNAL_AUTH_TOKEN` or `INTERNAL_AUTH_TOKEN`
- `DB_QUERY_MOCK_MAX_ROWS`

This example does not connect to a real database. It returns deterministic mock rows
based on the request payload.
