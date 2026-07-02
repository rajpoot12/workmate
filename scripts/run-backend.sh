#!/usr/bin/env bash
# Compile + (re)start the backend. Logs to /tmp/wm-backend.log
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/.tools/env.sh"

fuser -k 8080/tcp 2>/dev/null || true
sleep 1

cd "$ROOT/backend"
mvn -B -q -DskipTests compile
nohup mvn -B -q -DskipTests spring-boot:run > /tmp/wm-backend.log 2>&1 &
echo "backend starting (pid $!), logs: /tmp/wm-backend.log"
