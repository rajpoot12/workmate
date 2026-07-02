#!/usr/bin/env bash
# Wipe all CONTENT (memories, chunks, files, tags, access log) but keep the
# identity rows (users + team) the app needs to run. Safe to re-run.
set -euo pipefail
PGBIN=/usr/lib/postgresql/14/bin
"$PGBIN/psql" -h 127.0.0.1 -p 5433 -U workmemory -d workmemory -c \
  "TRUNCATE access_log, file_index, memory_tag, memory_chunk, memory, tag RESTART IDENTITY CASCADE;"
echo "WorkMemory content wiped. Identity (users/team) kept."
