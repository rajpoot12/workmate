#!/usr/bin/env bash
# Start/stop the user-space PostgreSQL 14 cluster (no Docker / root needed).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN=/usr/lib/postgresql/14/bin
PGDATA="$ROOT/.pgdata"

case "${1:-start}" in
  start)
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p 5433 -k /tmp -c listen_addresses=127.0.0.1" -l "$PGDATA/server.log" start
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop
    ;;
  status)
    "$PGBIN/pg_ctl" -D "$PGDATA" status
    ;;
  psql)
    shift
    "$PGBIN/psql" -h 127.0.0.1 -p 5433 -U workmemory -d workmemory "$@"
    ;;
  *)
    echo "usage: db.sh [start|stop|status|psql]" ; exit 1 ;;
esac
