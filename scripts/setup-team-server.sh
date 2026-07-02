#!/usr/bin/env bash
# =============================================================================
# WorkMemory AI — Team Server Setup
# Run this ONCE on the shared team server (10.2.179.63) as a sudo-capable user.
# Usage:
#   scp scripts/setup-team-server.sh fran@10.2.179.63:~/
#   ssh fran@10.2.179.63 "bash ~/setup-team-server.sh"
# =============================================================================
set -euo pipefail

DB_NAME="workmemory"
DB_USER="workmemory"
DB_PASS="wm_team_$(openssl rand -hex 8)"   # generated once; save it!
PG_HBA="/etc/postgresql/*/main/pg_hba.conf"
PG_CONF="/etc/postgresql/*/main/postgresql.conf"

echo "=== WorkMemory Team Server Setup ==="
echo "Server: $(hostname -I | awk '{print $1}')"

# ---------- Install PostgreSQL if missing ----------
if ! command -v psql &>/dev/null; then
    echo "[1/6] Installing PostgreSQL..."
    sudo apt-get update -qq
    sudo apt-get install -y postgresql postgresql-contrib
else
    echo "[1/6] PostgreSQL already installed: $(psql --version)"
fi

sudo systemctl enable postgresql
sudo systemctl start postgresql

# ---------- Create role and database ----------
echo "[2/6] Creating DB role and database..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || \
    sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || \
    echo "  Database already exists, skipping."
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON SCHEMA public TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO $DB_USER;"

# ---------- Enable pg_trgm extension ----------
echo "[3/6] Enabling pg_trgm extension..."
sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# ---------- Allow LAN connections ----------
echo "[4/6] Configuring PostgreSQL to accept LAN connections..."
# listen on all interfaces
sudo sed -i "s/^#*listen_addresses\s*=.*/listen_addresses = '*'/" $PG_CONF
# add LAN trust rule (adjust subnet if needed)
LAN="host    $DB_NAME    $DB_USER    10.2.0.0/16    md5"
if ! sudo grep -qF "$LAN" $PG_HBA; then
    echo "$LAN" | sudo tee -a $PG_HBA
fi

# ---------- Restart PostgreSQL ----------
echo "[5/6] Restarting PostgreSQL..."
sudo systemctl restart postgresql

# ---------- Open firewall port ----------
echo "[6/6] Opening port 5432..."
if command -v ufw &>/dev/null; then
    sudo ufw allow from 10.2.0.0/16 to any port 5432 comment "WorkMemory team DB"
    sudo ufw --force enable
else
    echo "  ufw not found; please open port 5432 manually for LAN."
fi

# ---------- Summary ----------
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "========================================================"
echo " WorkMemory Team Database is ready!"
echo "========================================================"
echo ""
echo " Host   : $SERVER_IP"
echo " Port   : 5432"
echo " DB     : $DB_NAME"
echo " User   : $DB_USER"
echo " Pass   : $DB_PASS   <-- SAVE THIS!"
echo ""
echo " Copy these lines into your .env file on each developer machine:"
echo ""
echo "   WM_TEAM_ENABLED=true"
echo "   WM_TEAM_DB_URL=jdbc:postgresql://$SERVER_IP:5432/$DB_NAME"
echo "   WM_TEAM_DB_USER=$DB_USER"
echo "   WM_TEAM_DB_PASSWORD=$DB_PASS"
echo "   WM_TEAM_NAME=your-team-name"
echo ""
echo " Then restart WorkMemory: ./wm.sh restart"
echo "========================================================"
