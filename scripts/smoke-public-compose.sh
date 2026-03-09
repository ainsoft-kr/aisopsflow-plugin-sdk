#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"
ENV_TEMPLATE="$DEPLOY_DIR/.env.public.example"
TMP_ENV="$(mktemp)"

cleanup() {
  docker compose --env-file "$TMP_ENV" -f "$DEPLOY_DIR/docker-compose.public.yml" down -v >/dev/null 2>&1 || true
  rm -f "$TMP_ENV"
}
trap cleanup EXIT

cp "$ENV_TEMPLATE" "$TMP_ENV"

if [[ -n "${AISOPSFLOW_CORE_IMAGE:-}" ]]; then
  awk -v value="$AISOPSFLOW_CORE_IMAGE" '
    /^AISOPSFLOW_CORE_IMAGE=/ { print "AISOPSFLOW_CORE_IMAGE=" value; next }
    { print }
  ' "$TMP_ENV" > "$TMP_ENV.tmp"
  mv "$TMP_ENV.tmp" "$TMP_ENV"
fi

if [[ -n "${AISOPSFLOW_RUNNER_IMAGE:-}" ]]; then
  awk -v value="$AISOPSFLOW_RUNNER_IMAGE" '
    /^AISOPSFLOW_RUNNER_IMAGE=/ { print "AISOPSFLOW_RUNNER_IMAGE=" value; next }
    { print }
  ' "$TMP_ENV" > "$TMP_ENV.tmp"
  mv "$TMP_ENV.tmp" "$TMP_ENV"
fi

docker compose --env-file "$TMP_ENV" -f "$DEPLOY_DIR/docker-compose.public.yml" up -d --build

for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl -fsS http://localhost:8080/healthz >/dev/null

login_body="$(printf '{"email":"admin@local","password":"%s"}' "$(awk -F= '/^AISOPSFLOW_BOOTSTRAP_ADMIN_PASSWORD=/{print $2}' "$TMP_ENV")")"
login_response="$(curl -fsS -X POST http://localhost:8080/api/login -H 'Content-Type: application/json' -d "$login_body")"
printf '%s' "$login_response" | grep -q '"token"' || {
  echo "login response did not contain token" >&2
  exit 1
}

echo "public compose smoke test passed"
