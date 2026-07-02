#!/usr/bin/env bash
# ============================================================================
# WorkMemory AI :: single control script
#
#   ./wm.sh start      start everything (db -> backend -> web)
#   ./wm.sh stop       stop everything
#   ./wm.sh restart    stop then start everything
#   ./wm.sh status     show what is running
#   ./wm.sh logs       tail backend + web logs
#   ./wm.sh reset      wipe all memories/files (keeps users), then restart backend
#   ./wm.sh seed       load the demo sample data, then restart backend
#
# You can also target one piece:  ./wm.sh start backend   |   ./wm.sh restart web
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Load local secrets/config (AI provider, OpenAI key, etc.) if present.
[ -f "$ROOT/.env" ] && source "$ROOT/.env"
PGBIN=/usr/lib/postgresql/14/bin
PGDATA="$ROOT/.pgdata"
BE_LOG=/tmp/wm-backend.log
WEB_LOG=/tmp/wm-web.log
DB_PORT=5433
BE_PORT=8080
WEB_PORT=5173

# colors
G='\033[0;32m'; Y='\033[0;33m'; R='\033[0;31m'; D='\033[0;90m'; N='\033[0m'
ok()   { echo -e "${G}✓${N} $*"; }
info() { echo -e "${D}·${N} $*"; }
warn() { echo -e "${Y}!${N} $*"; }
err()  { echo -e "${R}✗${N} $*"; }

port_up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1; }

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------
db_start() {
  if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    ok "database already running (:$DB_PORT)"; return
  fi
  info "starting database…"
  "$PGBIN/pg_ctl" -D "$PGDATA" \
    -o "-p $DB_PORT -k /tmp -c listen_addresses=127.0.0.1" \
    -l "$PGDATA/server.log" start >/dev/null 2>&1
  sleep 2
  port_up "$DB_PORT" && ok "database up (:$DB_PORT)" || err "database failed (see $PGDATA/server.log)"
}

db_stop() {
  if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null 2>&1
    ok "database stopped"
  else
    info "database not running"
  fi
}

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------
backend_start() {
  if port_up "$BE_PORT"; then ok "backend already running (:$BE_PORT)"; return; fi
  db_start
  source "$ROOT/.tools/env.sh"
  info "compiling backend…"
  ( cd "$ROOT/backend" && mvn -B -q -DskipTests compile ) || { err "compile failed"; return 1; }
  info "starting backend…"
  ( cd "$ROOT/backend" && nohup mvn -B -q -DskipTests spring-boot:run > "$BE_LOG" 2>&1 & )
  printf "${D}· waiting for backend"
  for _ in $(seq 1 40); do
    if curl -sf "http://localhost:$BE_PORT/api/health" >/dev/null 2>&1; then
      echo -e "${N}"; ok "backend up (:$BE_PORT)  logs: $BE_LOG"; return
    fi
    printf "."; sleep 1
  done
  echo -e "${N}"; err "backend did not become healthy (see $BE_LOG)"
}

backend_stop() {
  if port_up "$BE_PORT"; then fuser -k "$BE_PORT/tcp" >/dev/null 2>&1; sleep 1; ok "backend stopped"
  else info "backend not running"; fi
}

# ---------------------------------------------------------------------------
# Web
# ---------------------------------------------------------------------------
web_start() {
  if port_up "$WEB_PORT"; then ok "web already running (:$WEB_PORT)"; return; fi
  if [ ! -d "$ROOT/web/node_modules" ]; then
    info "installing web dependencies (first run)…"
    ( cd "$ROOT/web" && npm install >/dev/null 2>&1 ) || { err "npm install failed"; return 1; }
  fi
  info "starting web app…"
  ( cd "$ROOT/web" && nohup npm run dev > "$WEB_LOG" 2>&1 & )
  sleep 3
  port_up "$WEB_PORT" && ok "web up  ->  http://localhost:$WEB_PORT" || err "web failed (see $WEB_LOG)"
}

web_stop() {
  if port_up "$WEB_PORT"; then fuser -k "$WEB_PORT/tcp" >/dev/null 2>&1; sleep 1; ok "web stopped"
  else info "web not running"; fi
}

# ---------------------------------------------------------------------------
# Aggregate actions
# ---------------------------------------------------------------------------
start_all()   { db_start; backend_start; web_start; echo; ok "open  ->  http://localhost:$WEB_PORT"; }
stop_all()    { web_stop; backend_stop; db_stop; }
restart_all() { stop_all; echo; start_all; }

status() {
  echo "WorkMemory status:"
  port_up "$DB_PORT"  && ok "personal db  :$DB_PORT"  || err "personal db  :$DB_PORT (down)"
  port_up "$BE_PORT"  && ok "backend      :$BE_PORT"  || err "backend      :$BE_PORT (down)"
  port_up "$WEB_PORT" && ok "web          :$WEB_PORT  -> http://localhost:$WEB_PORT" \
                       || err "web          :$WEB_PORT (down)"
  if port_up "$BE_PORT"; then
    local health; health=$(curl -sf "http://localhost:$BE_PORT/api/health" 2>/dev/null || true)
    [ -n "$health" ] && {
      local prov;    prov=$(echo "$health"    | grep -o '"aiProvider":"[^"]*"' | cut -d'"' -f4)
      local team_en; team_en=$(echo "$health" | grep -o '"teamEnabled":[a-z]*' | cut -d: -f2)
      local team_st; team_st=$(echo "$health" | grep -o '"team":"[^"]*"'       | cut -d'"' -f4)
      [ -n "$prov" ]    && info "ai provider: $prov"
      if [ "$team_en" = "true" ]; then
        [ "$team_st" = "up" ] && ok "team db connected (${WM_TEAM_NAME:-?})" \
                               || warn "team db offline (check WM_TEAM_DB_* in .env)"
      else
        info "team db: disabled (set WM_TEAM_ENABLED=true in .env to enable)"
      fi
    }
  fi
}

reset_data() {
  db_start
  "$PGBIN/psql" -h 127.0.0.1 -p "$DB_PORT" -U workmemory -d workmemory -c \
    "TRUNCATE access_log, file_index, memory_tag, memory_chunk, memory, tag CASCADE;" \
    && ok "all personal memories/files wiped"
  backend_stop; backend_start
}

seed_data() {
  db_start; backend_stop
  source "$ROOT/.tools/env.sh"
  info "starting backend with demo data…"
  ( cd "$ROOT/backend" && mvn -B -q -DskipTests compile )
  ( cd "$ROOT/backend" && WM_SEED=true nohup mvn -B -q -DskipTests spring-boot:run > "$BE_LOG" 2>&1 & )
  for _ in $(seq 1 40); do curl -sf "http://localhost:$BE_PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
  ok "backend up with demo data"
}

logs() { tail -n 40 -f "$BE_LOG" "$WEB_LOG"; }

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
ACTION="${1:-start}"
TARGET="${2:-all}"

case "$ACTION" in
  start)   case "$TARGET" in db) db_start;; backend) backend_start;; web) web_start;; *) start_all;; esac ;;
  stop)    case "$TARGET" in db) db_stop;;  backend) backend_stop;; web) web_stop;;  *) stop_all;;  esac ;;
  restart) case "$TARGET" in db) db_stop; db_start;; backend) backend_stop; backend_start;; web) web_stop; web_start;; *) restart_all;; esac ;;
  status)  status ;;
  logs)    logs ;;
  reset)   reset_data ;;
  seed)    seed_data ;;
  *) echo "usage: ./wm.sh [start|stop|restart|status|logs|reset|seed] [all|db|backend|web]" ;;
esac
