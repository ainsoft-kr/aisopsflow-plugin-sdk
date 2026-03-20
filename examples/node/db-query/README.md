# DB Query Plugin

Read-only database query plugin for Runner-managed execution examples.

It supports:

- `db.read`
- `db.explain`
- PostgreSQL
- MySQL

Available endpoints:

- `POST /probe`
- `GET /healthz`
- `POST /query/read`
- `POST /query/explain`

Environment variables:

- `PORT`
- `AISOPSFLOW_INTERNAL_AUTH_TOKEN` or `INTERNAL_AUTH_TOKEN`
- `DB_QUERY_DATASOURCES_JSON`
- `DB_QUERY_MAX_ROWS`
- `DB_QUERY_DEFAULT_TIMEOUT_SECONDS`

Example datasource mapping:

```json
{
  "orders-prod-ro": {
    "driver": "postgres",
    "url": "postgres://user:pass@db.example.com:5432/orders"
  },
  "billing-ro": {
    "driver": "mysql",
    "url": "mysql://user:pass@db.example.com:3306/billing"
  }
}
```
