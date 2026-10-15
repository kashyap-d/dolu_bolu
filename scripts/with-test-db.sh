#!/usr/bin/env bash
# Runs a command with TEST_DATABASE_URL pointing at a Postgres server.
# If TEST_DATABASE_URL is already set (CI), it is used as-is. Otherwise a
# throwaway cluster is created in a temp directory and removed afterwards.
set -euo pipefail

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  exec "$@"
fi

for tool in initdb pg_ctl; do
  command -v "$tool" >/dev/null || { echo "$tool not found: install PostgreSQL 15+ or set TEST_DATABASE_URL." >&2; exit 1; }
done

# macOS Postgres refuses to start without a valid locale in the environment.
export LC_ALL="${LC_ALL:-C}"

dir="$(mktemp -d)"
port="${TEST_DATABASE_PORT:-54329}"
cleanup() {
  pg_ctl -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT

initdb -D "$dir/data" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_ctl -D "$dir/data" -o "-p $port -k $dir -c listen_addresses=localhost" -l "$dir/log" -w start >/dev/null

export TEST_DATABASE_URL="postgres://postgres@localhost:$port/postgres"
"$@"
