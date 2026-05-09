#!/usr/bin/env bash
# Mizan Kiosk Provisioning Script for Ubuntu
# This does NOT format the disk.
# It prepares Ubuntu to run only the Mizan kiosk app.
#
# Usage:
#   sudo KIOSK_USER=mizan PROJECT_DIR=/home/mizan/Mizan ./setup-mizan-kiosk.sh
#
# Notes:
# - This script is Ubuntu-oriented (apt, systemd, gdm3).
# - It expects your repo already exists at $PROJECT_DIR (clone it first).

set -euo pipefail

# ── Customize these ───────────────────────────────────────────────────────────

KIOSK_USER="${KIOSK_USER:-mizan}"
PROJECT_DIR="${PROJECT_DIR:-/home/$KIOSK_USER/Mizan}"

FRONTEND_PORT="${FRONTEND_PORT:-43997}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"

NODE_MAJOR="${NODE_MAJOR:-20}"

# If true, removes common Ubuntu desktop apps that are not needed for kiosk use.
MINIMAL_DESKTOP="${MINIMAL_DESKTOP:-true}"

# Disable common background services that are unnecessary on a dedicated kiosk.
DISABLE_EXTRA_SERVICES="${DISABLE_EXTRA_SERVICES:-true}"

# If true, purges PostgreSQL packages and data dirs (if installed).
REMOVE_POSTGRES="${REMOVE_POSTGRES:-false}"

# ── Colors ───────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[mizan]${NC} $*"; }
warn()  { echo -e "${YELLOW}[mizan]${NC} $*"; }
error() { echo -e "${RED}[mizan]${NC} $*" >&2; }

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    error "Run this script with sudo."
    exit 1
  fi
}

confirm() {
  echo ""
  warn "This will configure this Ubuntu machine as a dedicated Mizan kiosk."
  warn "It may remove common desktop apps if MINIMAL_DESKTOP=true."
  warn "It will NOT format the disk."
  echo ""
  read -r -p "Type MIZAN to continue: " answer

  if [ "$answer" != "MIZAN" ]; then
    error "Cancelled."
    exit 1
  fi
}

run_as_kiosk_user() {
  sudo -u "$KIOSK_USER" -H bash -lc "$*"
}

# ── Main ──────────────────────────────────────────────────────────────────────

require_root
confirm

# ── Disable old MyHomeAtahn autostart ─────────────────────────────────────────

info "Disabling old MyHomeAtahn app if present..."

# System services
while read -r unit; do
  [ -z "$unit" ] && continue
  info "Disabling system service: $unit"
  systemctl stop "$unit" 2>/dev/null || true
  systemctl disable "$unit" 2>/dev/null || true
  systemctl mask "$unit" 2>/dev/null || true
done < <(
  systemctl list-unit-files --type=service --no-legend 2>/dev/null \
    | awk '{print $1}' \
    | grep -Ei 'myhome|athan|atahn' || true
)

# User services for kiosk user
if id "$KIOSK_USER" >/dev/null 2>&1; then
  while read -r unit; do
    [ -z "$unit" ] && continue
    info "Disabling user service for $KIOSK_USER: $unit"
    sudo -u "$KIOSK_USER" -H systemctl --user stop "$unit" 2>/dev/null || true
    sudo -u "$KIOSK_USER" -H systemctl --user disable "$unit" 2>/dev/null || true
    sudo -u "$KIOSK_USER" -H systemctl --user mask "$unit" 2>/dev/null || true
  done < <(
    sudo -u "$KIOSK_USER" -H systemctl --user list-unit-files --type=service --no-legend 2>/dev/null \
      | awk '{print $1}' \
      | grep -Ei 'myhome|athan|atahn' || true
  )
fi

# PM2 cleanup
if command -v pm2 >/dev/null 2>&1; then
  info "Checking PM2 for old MyHomeAtahn processes..."
  pm2 delete MyHomeAtahn 2>/dev/null || true
  pm2 delete myhomeatahn 2>/dev/null || true
  pm2 delete myhomeathan 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi

# Autostart desktop entries
rm -f "$HOME/.config/autostart/"*MyHomeAtahn*.desktop 2>/dev/null || true
rm -f "$HOME/.config/autostart/"*myhome*.desktop 2>/dev/null || true
rm -f "$HOME/.config/autostart/"*athan*.desktop 2>/dev/null || true
rm -f "/home/$KIOSK_USER/.config/autostart/"*MyHomeAtahn*.desktop 2>/dev/null || true
rm -f "/home/$KIOSK_USER/.config/autostart/"*myhome*.desktop 2>/dev/null || true
rm -f "/home/$KIOSK_USER/.config/autostart/"*athan*.desktop 2>/dev/null || true

# Stop loose running processes
pkill -f 'MyHomeAtahn' 2>/dev/null || true
pkill -f 'myhomeatahn' 2>/dev/null || true
pkill -f 'myhomeathan' 2>/dev/null || true

info "Old MyHomeAtahn autostart cleanup complete."

info "Updating apt..."
apt-get update

info "Installing base packages..."
apt-get install -y \
  curl \
  ca-certificates \
  gnupg \
  git \
  python3 \
  python3-venv \
  python3-pip \
  build-essential \
  chromium-browser \
  unclutter \
  xdotool

# ── Optional cleanup ──────────────────────────────────────────────────────────

if [ "$MINIMAL_DESKTOP" = "true" ]; then
  info "Removing common non-kiosk desktop apps..."

  apt-get purge -y \
    libreoffice* \
    thunderbird* \
    rhythmbox* \
    shotwell* \
    transmission* \
    cheese* \
    simple-scan* \
    gnome-mahjongg* \
    gnome-mines* \
    gnome-sudoku* \
    aisleriot* \
    remmina* \
    totem* \
    yelp* \
    || true

  apt-get autoremove -y
  apt-get autoclean -y
fi

# ── Remove PostgreSQL if installed ────────────────────────────────────────────

if [ "$REMOVE_POSTGRES" = "true" ]; then
  info "Removing PostgreSQL services and packages..."

  # Stop/disable known PostgreSQL units if they exist.
  systemctl stop postgresql 2>/dev/null || true
  systemctl disable postgresql 2>/dev/null || true

  # Stop/disable versioned clusters like postgresql@17-main.service.
  while read -r unit; do
    [ -z "$unit" ] && continue
    info "Stopping PostgreSQL unit: $unit"
    systemctl stop "$unit" 2>/dev/null || true
    systemctl disable "$unit" 2>/dev/null || true
  done < <(systemctl list-unit-files 'postgresql@*.service' --no-legend 2>/dev/null | awk '{print $1}')

  # Purge packages.
  apt-get purge -y \
    'postgresql*' \
    'postgresql-client*' \
    'postgresql-common' \
    || true

  apt-get autoremove -y
  apt-get autoclean -y

  # Optional: remove leftover PostgreSQL data/config/log dirs.
  # This deletes local PostgreSQL databases.
  rm -rf /var/lib/postgresql /etc/postgresql /var/log/postgresql

  info "PostgreSQL removed."
fi

# ── Create kiosk user ─────────────────────────────────────────────────────────

if ! id "$KIOSK_USER" >/dev/null 2>&1; then
  info "Creating kiosk user: $KIOSK_USER"
  adduser --disabled-password --gecos "" "$KIOSK_USER"
else
  info "User $KIOSK_USER already exists."
fi

usermod -aG audio,video,input,plugdev "$KIOSK_USER" || true

# ── Install Node.js ───────────────────────────────────────────────────────────

if ! command -v node >/dev/null 2>&1; then
  info "Installing Node.js $NODE_MAJOR..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  info "Node.js already installed: $(node --version)"
fi

# ── Install Ollama ────────────────────────────────────────────────────────────

if ! command -v ollama >/dev/null 2>&1; then
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  info "Ollama already installed."
fi

systemctl enable ollama || true
systemctl start ollama || true

info "Waiting for Ollama to be ready..."
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
for i in $(seq 1 30); do
  if curl -sf "$OLLAMA_BASE_URL/api/version" >/dev/null 2>&1; then
    info "Ollama is healthy ✓"
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "Ollama did not respond after 30s. Try: sudo systemctl status ollama"
    exit 1
  fi
  sleep 1
done

yaml_value() {
  local key="$1"
  local file="$2"

  sed -nE "s/^[[:space:]]*${key}:[[:space:]]*[\"']?([^\"'#]+)[\"']?.*/\\1/p" "$file" \
    | head -n 1 \
    | xargs
}

pull_model_if_missing() {
  local model="$1"
  local base="${model%%:*}"

  if [ -z "$model" ]; then
    return 0
  fi

  if ollama list | awk 'NR > 1 {print $1}' | grep -Eq "^(${model}|${base}:latest)$"; then
    info "Ollama model already installed: $model"
    return 0
  fi

  info "Pulling Ollama model: $model"
  ollama pull "$model" || warn "Failed to pull $model (continuing)"
}

# Pull models from backend config so the assistant works immediately.
CONFIG_FILE="$PROJECT_DIR/backend/data/config.yaml"

if [ -f "$CONFIG_FILE" ]; then
  info "Pulling Ollama models from backend config..."

  CHAT_MODEL="$(yaml_value "chat_model" "$CONFIG_FILE")"
  CHAT_MODEL_FAST="$(yaml_value "chat_model_fast" "$CONFIG_FILE")"
  EMBED_MODEL="$(yaml_value "embed_model" "$CONFIG_FILE")"

  pull_model_if_missing "$CHAT_MODEL"
  pull_model_if_missing "$CHAT_MODEL_FAST"
  pull_model_if_missing "$EMBED_MODEL"
else
  warn "Backend config not found at $CONFIG_FILE; skipping model pulls."
fi

# ── Power / screen settings ───────────────────────────────────────────────────

info "Disabling sleep, suspend, and hibernate..."
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target || true

info "Disabling screen blanking for graphical sessions..."
mkdir -p "/home/$KIOSK_USER/.config/autostart"

cat > "/home/$KIOSK_USER/.config/autostart/mizan-display.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Mizan Display Settings
Exec=sh -c "xset s off; xset -dpms; xset s noblank; unclutter -idle 1 -root"
X-GNOME-Autostart-enabled=true
EOF

chown -R "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/.config"

# ── Disable unnecessary services for kiosk mode ───────────────────────────────

disable_service_if_exists() {
  local svc="$1"

  if systemctl list-unit-files "$svc" >/dev/null 2>&1; then
    info "Disabling $svc..."
    systemctl disable --now "$svc" 2>/dev/null || true
  fi
}

mask_service_if_exists() {
  local svc="$1"

  if systemctl list-unit-files "$svc" >/dev/null 2>&1; then
    info "Masking $svc..."
    systemctl mask "$svc" 2>/dev/null || true
  fi
}

if [ "$DISABLE_EXTRA_SERVICES" = "true" ]; then
  info "Disabling unnecessary background services for kiosk mode..."

  # Printing / scanning
  disable_service_if_exists cups.service
  disable_service_if_exists cups-browsed.service
  disable_service_if_exists saned.service

  # Bluetooth, if not using Bluetooth keyboard/mouse/audio
  disable_service_if_exists bluetooth.service

  # Modem/mobile broadband
  disable_service_if_exists ModemManager.service

  # Avahi/mDNS discovery
  disable_service_if_exists avahi-daemon.service
  disable_service_if_exists avahi-daemon.socket

  # Crash/reporting/telemetry-like services
  disable_service_if_exists apport.service
  disable_service_if_exists whoopsie.service

  # Package auto updates can interrupt kiosk performance.
  # Disable only if you plan to update manually.
  disable_service_if_exists unattended-upgrades.service
  disable_service_if_exists apt-daily.service
  disable_service_if_exists apt-daily.timer
  disable_service_if_exists apt-daily-upgrade.service
  disable_service_if_exists apt-daily-upgrade.timer

  # Remote desktop / sharing, if installed
  disable_service_if_exists gnome-remote-desktop.service

  # Speech dispatcher, usually unnecessary on kiosk
  disable_service_if_exists speech-dispatcher.service

  # Tracker file indexing. Names vary by Ubuntu version.
  disable_service_if_exists tracker-miner-fs-3.service
  disable_service_if_exists tracker-extract-3.service
  disable_service_if_exists tracker-miner-fs.service
  disable_service_if_exists tracker-extract.service

  # Sleep/suspend targets should never trigger on kiosk
  mask_service_if_exists sleep.target
  mask_service_if_exists suspend.target
  mask_service_if_exists hibernate.target
  mask_service_if_exists hybrid-sleep.target

  info "Kiosk service cleanup complete."
fi

# ── Project setup ─────────────────────────────────────────────────────────────

if [ ! -d "$PROJECT_DIR" ]; then
  warn "Project directory does not exist: $PROJECT_DIR"
  warn "Create it or clone your repo there before starting services."
else
  info "Project found at $PROJECT_DIR"

  if [ -f "$PROJECT_DIR/package.json" ]; then
    info "Installing frontend dependencies..."
    run_as_kiosk_user "cd '$PROJECT_DIR' && npm ci --silent --no-audit"

    info "Building frontend..."
    run_as_kiosk_user "cd '$PROJECT_DIR' && VITE_ASSISTANT_URL='http://$BACKEND_HOST:$BACKEND_PORT' npm run build"
  fi

  if [ -f "$PROJECT_DIR/backend/requirements.txt" ]; then
    info "Setting up backend venv..."
    run_as_kiosk_user "cd '$PROJECT_DIR/backend' && python3 -m venv .venv"
    run_as_kiosk_user \"cd '$PROJECT_DIR/backend' && . .venv/bin/activate && python3 -m pip install --upgrade pip && python3 -m pip install -r requirements.txt\"
  fi
fi

# ── systemd backend service ───────────────────────────────────────────────────

info "Creating backend systemd service..."

cat > /etc/systemd/system/mizan-backend.service <<EOF
[Unit]
Description=Mizan Backend API
After=network-online.target ollama.service
Wants=network-online.target
Requires=ollama.service

[Service]
Type=simple
User=$KIOSK_USER
Group=$KIOSK_USER
WorkingDirectory=$PROJECT_DIR/backend

Environment=BACKEND_HOST=$BACKEND_HOST
Environment=BACKEND_PORT=$BACKEND_PORT
Environment=PYTHONUNBUFFERED=1

ExecStart=$PROJECT_DIR/backend/.venv/bin/uvicorn main:app --host $BACKEND_HOST --port $BACKEND_PORT

Restart=always
RestartSec=5

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ── systemd frontend service ──────────────────────────────────────────────────

info "Creating frontend systemd service..."

cat > /etc/systemd/system/mizan-frontend.service <<EOF
[Unit]
Description=Mizan Frontend
After=network-online.target mizan-backend.service
Wants=network-online.target
Requires=mizan-backend.service

[Service]
Type=simple
User=$KIOSK_USER
Group=$KIOSK_USER
WorkingDirectory=$PROJECT_DIR

Environment=SERVE_PORT=$FRONTEND_PORT

ExecStart=$PROJECT_DIR/node_modules/.bin/serve -s dist -l $FRONTEND_PORT --single

Restart=always
RestartSec=5

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ── User systemd kiosk browser service ────────────────────────────────────────

info "Creating Chromium kiosk service for user $KIOSK_USER..."

mkdir -p "/home/$KIOSK_USER/.config/systemd/user"

cat > "/home/$KIOSK_USER/.config/systemd/user/mizan-kiosk.service" <<EOF
[Unit]
Description=Mizan Chromium Kiosk
After=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/bin/chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-features=TranslateUI --overscroll-history-navigation=0 --start-maximized http://$BACKEND_HOST:$FRONTEND_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

chown -R "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/.config/systemd"

# ── Enable autologin for GDM if present ───────────────────────────────────────

if [ -f /etc/gdm3/custom.conf ]; then
  info "Configuring GDM autologin for $KIOSK_USER..."

  cp /etc/gdm3/custom.conf /etc/gdm3/custom.conf.bak.$(date +%Y%m%d%H%M%S)

  sed -i 's/^#\\?AutomaticLoginEnable.*/AutomaticLoginEnable = true/' /etc/gdm3/custom.conf || true
  sed -i "s/^#\\?AutomaticLogin.*/AutomaticLogin = $KIOSK_USER/" /etc/gdm3/custom.conf || true

  if ! grep -q '^AutomaticLoginEnable' /etc/gdm3/custom.conf; then
    sed -i '/^\\[daemon\\]/a AutomaticLoginEnable = true' /etc/gdm3/custom.conf
  fi

  if ! grep -q '^AutomaticLogin' /etc/gdm3/custom.conf; then
    sed -i \"/^\\[daemon\\]/a AutomaticLogin = $KIOSK_USER\" /etc/gdm3/custom.conf
  fi
else
  warn "GDM config not found. Autologin was not configured."
fi

# ── Enable services ───────────────────────────────────────────────────────────

info "Enabling services..."

systemctl daemon-reload
systemctl enable mizan-backend.service
systemctl enable mizan-frontend.service

loginctl enable-linger "$KIOSK_USER" || true

run_as_kiosk_user "systemctl --user daemon-reload"
run_as_kiosk_user "systemctl --user enable mizan-kiosk.service"

# ── Start services if project exists ──────────────────────────────────────────

if [ -d "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/backend/.venv/bin/uvicorn" ] && [ -f "$PROJECT_DIR/node_modules/.bin/serve" ]; then
  info "Starting Mizan services..."
  systemctl restart mizan-backend.service
  systemctl restart mizan-frontend.service
else
  warn "Services enabled but not started because project files/dependencies are missing."
fi

# ── Final ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}        Mizan Kiosk Provisioning Complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Project directory:"
echo "  $PROJECT_DIR"
echo ""
echo "Frontend:"
echo "  http://$BACKEND_HOST:$FRONTEND_PORT"
echo ""
echo "Backend:"
echo "  http://$BACKEND_HOST:$BACKEND_PORT"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status mizan-backend"
echo "  sudo systemctl status mizan-frontend"
echo "  journalctl -u mizan-backend -f"
echo "  journalctl -u mizan-frontend -f"
echo "  sudo -u $KIOSK_USER systemctl --user status mizan-kiosk"
echo ""
echo -e "${YELLOW}Reboot to test full kiosk autostart:${NC}"
echo "  sudo reboot"
echo ""
