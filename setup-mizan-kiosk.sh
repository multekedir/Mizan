#!/usr/bin/env bash
# Mizan Kiosk Setup Script
# Assumes old apps/services have already been cleaned up.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

KIOSK_USER="${KIOSK_USER:-anuye}"
KIOSK_HOME="/home/$KIOSK_USER"
PROJECT_DIR="${PROJECT_DIR:-$KIOSK_HOME/Mizan}"

FRONTEND_PORT="${FRONTEND_PORT:-43997}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"

NODE_MAJOR="${NODE_MAJOR:-20}"

# ── Colors ────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[mizan]${NC} $*"; }
warn()  { echo -e "${YELLOW}[mizan]${NC} $*"; }
error() { echo -e "${RED}[mizan]${NC} $*" >&2; }

# ── Helpers ───────────────────────────────────────────────────────────────────

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    error "Run this script with sudo."
    exit 1
  fi
}

run_as_kiosk_user() {
  sudo -u "$KIOSK_USER" -H bash -lc "$*"
}

ensure_user() {
  if ! id "$KIOSK_USER" >/dev/null 2>&1; then
    info "Creating user $KIOSK_USER..."
    adduser --disabled-password --gecos "" "$KIOSK_USER"
  fi

  mkdir -p "$KIOSK_HOME"
  chown "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME"
}

wait_for_ollama() {
  info "Waiting for Ollama at $OLLAMA_BASE_URL..."

  for i in $(seq 1 30); do
    if curl -sf "$OLLAMA_BASE_URL/api/version" >/dev/null 2>&1; then
      info "Ollama is healthy ✓"
      return 0
    fi

    sleep 1
  done

  error "Ollama did not respond after 30s."
  error "Try: sudo systemctl status ollama"
  return 1
}

yaml_value() {
  local key="$1"
  local file="$2"

  sed -nE "s/^[[:space:]]*${key}:[[:space:]]*[\"']?([^\"'#]+)[\"']?.*/\1/p" "$file" \
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
  ollama pull "$model" || warn "Failed to pull $model; continuing."
}

# ── Start ─────────────────────────────────────────────────────────────────────

require_root

# ── Remove old mizan user if present ──────────────────────────────────────────

if id mizan >/dev/null 2>&1; then
  info "Removing old mizan user..."

  pkill -u mizan 2>/dev/null || true
  loginctl terminate-user mizan 2>/dev/null || true
  loginctl disable-linger mizan 2>/dev/null || true

  deluser --remove-home mizan 2>/dev/null || true

  rm -rf /var/lib/systemd/linger/mizan
  rm -rf /home/mizan

  systemctl daemon-reload
  systemctl reset-failed

  info "Old mizan user removed."
else
  info "Old mizan user does not exist."
fi

info "Setting up Mizan kiosk..."
info "User: $KIOSK_USER"
info "Project: $PROJECT_DIR"
info "Frontend: http://127.0.0.1:$FRONTEND_PORT"
info "Backend: http://$BACKEND_HOST:$BACKEND_PORT"

ensure_user

# ── Packages ──────────────────────────────────────────────────────────────────

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
  x11-xserver-utils

# ── Node.js ───────────────────────────────────────────────────────────────────

if ! command -v node >/dev/null 2>&1; then
  info "Installing Node.js $NODE_MAJOR..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  info "Node.js detected: $(node --version)"
fi

# ── Ollama ────────────────────────────────────────────────────────────────────

if ! command -v ollama >/dev/null 2>&1; then
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  info "Ollama detected."
fi

info "Locking Ollama to localhost..."
mkdir -p /etc/systemd/system/ollama.service.d

cat > /etc/systemd/system/ollama.service.d/override.conf <<'EOF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
EOF

systemctl daemon-reload
systemctl enable ollama || true
systemctl restart ollama || true

wait_for_ollama

# ── Project ownership ─────────────────────────────────────────────────────────

if [ ! -d "$PROJECT_DIR" ]; then
  error "Project directory does not exist: $PROJECT_DIR"
  error "Put your app at $PROJECT_DIR, then rerun this script."
  exit 1
fi

info "Fixing project ownership..."
chown -R "$KIOSK_USER:$KIOSK_USER" "$PROJECT_DIR"
chmod -R u+rwX "$PROJECT_DIR"

mkdir -p "$KIOSK_HOME/.local/bin"
mkdir -p "$KIOSK_HOME/.config/autostart"
mkdir -p "$KIOSK_HOME/.cache"
chown -R "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.local" "$KIOSK_HOME/.config" "$KIOSK_HOME/.cache"

# ── Backend setup ─────────────────────────────────────────────────────────────

if [ -f "$PROJECT_DIR/backend/requirements.txt" ]; then
  info "Setting up backend virtual environment as $KIOSK_USER..."

  run_as_kiosk_user "
    cd '$PROJECT_DIR/backend' &&
    [ -d .venv ] || python3 -m venv .venv
  "

  run_as_kiosk_user "
    cd '$PROJECT_DIR/backend' &&
    . .venv/bin/activate &&
    python -m pip install --upgrade pip &&
    python -m pip install -r requirements.txt
  "

  mkdir -p "$PROJECT_DIR/backend/data"
  chown -R "$KIOSK_USER:$KIOSK_USER" "$PROJECT_DIR/backend"
else
  error "Backend requirements file not found: $PROJECT_DIR/backend/requirements.txt"
  exit 1
fi

# ── Pull Ollama models from config ────────────────────────────────────────────

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

# ── Frontend setup ────────────────────────────────────────────────────────────

if [ -f "$PROJECT_DIR/package.json" ]; then
  info "Installing frontend dependencies as $KIOSK_USER..."

  run_as_kiosk_user "
    cd '$PROJECT_DIR' &&
    npm ci --no-audit
  "

  info "Ensuring serve is installed..."
  run_as_kiosk_user "
    cd '$PROJECT_DIR' &&
    npm install --no-audit --save-dev serve
  "

  info "Building frontend..."
  run_as_kiosk_user "
    cd '$PROJECT_DIR' &&
    VITE_ASSISTANT_URL='http://$BACKEND_HOST:$BACKEND_PORT' npm run build
  "

  chown -R "$KIOSK_USER:$KIOSK_USER" "$PROJECT_DIR"
else
  error "Frontend package.json not found: $PROJECT_DIR/package.json"
  exit 1
fi

# ── Backend systemd service ───────────────────────────────────────────────────

info "Creating backend service..."

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

# ── Frontend systemd service ──────────────────────────────────────────────────

info "Creating frontend service..."

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

ExecStart=$PROJECT_DIR/node_modules/.bin/serve -s dist -l tcp://127.0.0.1:$FRONTEND_PORT --single

Restart=always
RestartSec=5

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ── Chromium desktop autostart ────────────────────────────────────────────────

info "Creating desktop autostart kiosk launcher..."

cat > "$KIOSK_HOME/.local/bin/start-mizan-kiosk.sh" <<EOF
#!/usr/bin/env bash

set -u

URL="http://127.0.0.1:$FRONTEND_PORT"
LOG="$KIOSK_HOME/.mizan-kiosk.log"

echo "[mizan-kiosk] Starting at \$(date)" >> "\$LOG"
echo "[mizan-kiosk] Waiting for \$URL" >> "\$LOG"

for i in \$(seq 1 90); do
  if curl -sf "\$URL" >/dev/null 2>&1; then
    echo "[mizan-kiosk] Frontend ready" >> "\$LOG"
    break
  fi

  if [ "\$i" -eq 90 ]; then
    echo "[mizan-kiosk] Frontend did not respond after 90s" >> "\$LOG"
  fi

  sleep 1
done

xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true

pkill unclutter 2>/dev/null || true
unclutter -idle 1 -root 2>/dev/null &

if command -v chromium-browser >/dev/null 2>&1; then
  CHROME="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  CHROME="chromium"
elif command -v google-chrome >/dev/null 2>&1; then
  CHROME="google-chrome"
else
  echo "[mizan-kiosk] No Chromium/Chrome binary found" >> "\$LOG"
  exit 1
fi

echo "[mizan-kiosk] Launching \$CHROME \$URL" >> "\$LOG"

exec "\$CHROME" \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-session-crashed-bubble \\
  --disable-features=TranslateUI \\
  --overscroll-history-navigation=0 \\
  --start-maximized \\
  --autoplay-policy=no-user-gesture-required \\
  "\$URL"
EOF

chmod +x "$KIOSK_HOME/.local/bin/start-mizan-kiosk.sh"

cat > "$KIOSK_HOME/.config/autostart/mizan-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Mizan Kiosk
Comment=Start Mizan in Chromium kiosk mode
Exec=$KIOSK_HOME/.local/bin/start-mizan-kiosk.sh
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

chmod +x "$KIOSK_HOME/.config/autostart/mizan-kiosk.desktop"
chown -R "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.local" "$KIOSK_HOME/.config/autostart"

# Disable old user systemd kiosk launcher if present.
run_as_kiosk_user "systemctl --user disable --now mizan-kiosk.service 2>/dev/null || true"
run_as_kiosk_user "systemctl --user reset-failed 2>/dev/null || true"

# ── GDM autologin ─────────────────────────────────────────────────────────────

if [ -f /etc/gdm3/custom.conf ]; then
  info "Configuring GDM autologin for $KIOSK_USER..."

  cp /etc/gdm3/custom.conf "/etc/gdm3/custom.conf.bak.$(date +%Y%m%d%H%M%S)"

  if ! grep -q '^\[daemon\]' /etc/gdm3/custom.conf; then
    printf '\n[daemon]\n' >> /etc/gdm3/custom.conf
  fi

  sed -i '/^[[:space:]]*AutomaticLoginEnable[[:space:]]*=.*/d' /etc/gdm3/custom.conf
  sed -i '/^[[:space:]]*AutomaticLogin[[:space:]]*=.*/d' /etc/gdm3/custom.conf

  sed -i "/^\[daemon\]/a AutomaticLogin = $KIOSK_USER" /etc/gdm3/custom.conf
  sed -i "/^\[daemon\]/a AutomaticLoginEnable = true" /etc/gdm3/custom.conf

  info "GDM autologin configured."
else
  warn "GDM config not found at /etc/gdm3/custom.conf. Autologin not configured."
fi

# ── Disable sleep/screen blanking ─────────────────────────────────────────────

info "Disabling suspend/sleep targets..."
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target || true

cat > "$KIOSK_HOME/.config/autostart/mizan-display.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Mizan Display Settings
Exec=sh -c "xset s off; xset -dpms; xset s noblank; unclutter -idle 1 -root"
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

chown "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.config/autostart/mizan-display.desktop"

# ── Enable/start services ─────────────────────────────────────────────────────

info "Enabling and starting Mizan services..."

systemctl daemon-reload
systemctl enable mizan-backend.service
systemctl enable mizan-frontend.service

systemctl restart mizan-backend.service
systemctl restart mizan-frontend.service

# ── Health checks ─────────────────────────────────────────────────────────────

info "Checking backend health..."
for i in $(seq 1 30); do
  if curl -sf "http://$BACKEND_HOST:$BACKEND_PORT/health" >/dev/null 2>&1; then
    info "Backend is healthy ✓"
    break
  fi

  if [ "$i" -eq 30 ]; then
    warn "Backend did not respond. Check: journalctl -u mizan-backend -n 100 --no-pager"
  fi

  sleep 1
done

info "Checking frontend health..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$FRONTEND_PORT" >/dev/null 2>&1; then
    info "Frontend is healthy ✓"
    break
  fi

  if [ "$i" -eq 30 ]; then
    warn "Frontend did not respond. Check: journalctl -u mizan-frontend -n 100 --no-pager"
  fi

  sleep 1
done

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}          Mizan Kiosk Setup Complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "User:"
echo "  $KIOSK_USER"
echo ""
echo "Project:"
echo "  $PROJECT_DIR"
echo ""
echo "Frontend:"
echo "  http://127.0.0.1:$FRONTEND_PORT"
echo ""
echo "Backend:"
echo "  http://$BACKEND_HOST:$BACKEND_PORT"
echo ""
echo "Ollama:"
echo "  $OLLAMA_BASE_URL"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status mizan-backend"
echo "  sudo systemctl status mizan-frontend"
echo "  journalctl -u mizan-backend -f"
echo "  journalctl -u mizan-frontend -f"
echo "  cat $KIOSK_HOME/.mizan-kiosk.log"
echo ""
echo -e "${YELLOW}Reboot to test kiosk autostart:${NC}"
echo "  sudo reboot"
echo ""
