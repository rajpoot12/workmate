#!/usr/bin/env bash
# WorkMemory AI — macOS double-clickable launcher
# Place this file on your Desktop (or keep it in the project root).
# In Finder: double-click → Terminal opens → app starts → browser opens.
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
echo "Starting WorkMemory AI..."
./wm.sh start
echo ""
echo "Opening browser at http://localhost:5173 ..."
sleep 4
open http://localhost:5173
