#!/usr/bin/env bash
# =============================================================================
# WorkMemory AI — Desktop Launcher Installer
# Run once to create a double-clickable desktop icon for your OS.
#
#   bash scripts/install-launcher.sh
#
# Supported:
#   Linux  → ~/Desktop/WorkMemory.desktop
#   macOS  → ~/Desktop/WorkMemory.command
#   Windows (WSL) → /mnt/c/Users/<user>/Desktop/WorkMemory.bat
# =============================================================================
set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS="$(uname -s)"

G='\033[0;32m'; Y='\033[0;33m'; R='\033[0;31m'; N='\033[0m'
ok()   { echo -e "${G}✓${N} $*"; }
warn() { echo -e "${Y}!${N} $*"; }
err()  { echo -e "${R}✗${N} $*"; exit 1; }

# ---------------------------------------------------------------------------
# Linux
# ---------------------------------------------------------------------------
install_linux() {
    local desktop_dir="$HOME/Desktop"
    mkdir -p "$desktop_dir"

    local icon_path=""
    [ -f "$ROOT/web/public/icon.png" ] && icon_path="$ROOT/web/public/icon.png"

    cat > "$desktop_dir/WorkMemory.desktop" <<EOF
[Desktop Entry]
Name=WorkMemory AI
Comment=Start your AI memory assistant — Ask, Library, Capture
Exec=bash -c 'cd "$ROOT" && ./wm.sh start && sleep 4 && xdg-open http://localhost:5173'
Icon=${icon_path}
Terminal=true
Type=Application
Categories=Utility;Office;
StartupNotify=true
EOF

    chmod +x "$desktop_dir/WorkMemory.desktop"

    # Some desktops require marking it trusted
    if command -v gio &>/dev/null; then
        gio set "$desktop_dir/WorkMemory.desktop" metadata::trusted true 2>/dev/null || true
    fi

    ok "Linux launcher created: $desktop_dir/WorkMemory.desktop"
    echo "   Double-click it from your Files/Desktop to start WorkMemory."
}

# ---------------------------------------------------------------------------
# macOS
# ---------------------------------------------------------------------------
install_macos() {
    local desktop_dir="$HOME/Desktop"
    mkdir -p "$desktop_dir"

    cat > "$desktop_dir/WorkMemory.command" <<EOF
#!/usr/bin/env bash
# WorkMemory AI launcher — double-click in Finder to start
cd "$ROOT"
echo "Starting WorkMemory AI..."
./wm.sh start
echo ""
echo "Opening browser..."
sleep 4
open http://localhost:5173
EOF

    chmod +x "$desktop_dir/WorkMemory.command"
    ok "macOS launcher created: $desktop_dir/WorkMemory.command"
    echo "   Double-click it in Finder. macOS may ask to allow it — click Open."
}

# ---------------------------------------------------------------------------
# Windows via WSL
# ---------------------------------------------------------------------------
install_windows_wsl() {
    # Detect Windows username from WSL environment
    local win_user
    win_user="${USERPROFILE##*\\}" 2>/dev/null || win_user="$(cmd.exe /c echo %USERNAME% 2>/dev/null | tr -d '\r')" || win_user=""

    local win_desktop="/mnt/c/Users/${win_user}/Desktop"

    if [ -z "$win_user" ] || [ ! -d "$win_desktop" ]; then
        # Try common fallback paths
        for candidate in /mnt/c/Users/*/Desktop; do
            [ -d "$candidate" ] && win_desktop="$candidate" && break
        done
    fi

    if [ ! -d "$win_desktop" ]; then
        warn "Could not locate Windows Desktop. Creating launcher in current directory."
        win_desktop="$ROOT"
    fi

    # Convert WSL path to Windows path for the bat file
    local win_root
    win_root="$(wslpath -w "$ROOT" 2>/dev/null || echo "\\\\wsl$\\Ubuntu$ROOT")"

    cat > "$win_desktop/WorkMemory.bat" <<BATEOF
@echo off
title WorkMemory AI
echo Starting WorkMemory AI...
wsl bash -c "cd '$ROOT' && ./wm.sh start"
echo.
echo Opening browser...
timeout /t 4 /nobreak >nul
start http://localhost:5173
BATEOF

    # Also create a VBS wrapper so it can run without a visible cmd flash (optional shortcut)
    cat > "$win_desktop/WorkMemory-silent.vbs" <<VBSEOF
Set oShell = CreateObject("WScript.Shell")
oShell.Run "cmd /c ""${win_desktop}\WorkMemory.bat""", 1, False
VBSEOF

    ok "Windows launcher created: ${win_desktop}\\WorkMemory.bat"
    echo "   Double-click WorkMemory.bat from your Desktop to start WorkMemory."
    echo "   WSL must be installed and configured (wsl --install)."
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
echo "WorkMemory AI — Desktop Launcher Installer"
echo "App root: $ROOT"
echo ""

case "$OS" in
    Linux*)
        # Check if running under WSL
        if grep -qi microsoft /proc/version 2>/dev/null; then
            install_windows_wsl
        else
            install_linux
        fi
        ;;
    Darwin*)
        install_macos
        ;;
    MINGW*|MSYS*|CYGWIN*)
        warn "Run this script from WSL (Windows Subsystem for Linux), not Git Bash."
        err "Please open WSL and run: bash scripts/install-launcher.sh"
        ;;
    *)
        warn "Unrecognised OS: $OS"
        warn "Creating a generic shell launcher in $ROOT/WorkMemory.sh"
        cat > "$ROOT/WorkMemory.sh" <<EOF
#!/usr/bin/env bash
cd "$ROOT"
./wm.sh start
EOF
        chmod +x "$ROOT/WorkMemory.sh"
        ok "Generic launcher: $ROOT/WorkMemory.sh"
        ;;
esac

echo ""
echo "Tip: to stop WorkMemory later, run:  cd $ROOT && ./wm.sh stop"
