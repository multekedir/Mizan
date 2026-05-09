#!/usr/bin/env bash
# Mizan — full deploy script (frontend + backend)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh            # build frontend + install backend + start both
#   ./deploy.sh --backend  # backend only (skip frontend build)
#   ./deploy.sh --frontend # frontend build only (skip backend)
#   ./deploy.sh --stop     # stop all running Mizan processes
#
# Ports (override via env vars):
#   SERVE_PORT   — static frontend   (default: 3000)
#   BACKEND_PORT — Python API        (default: 8000)
#   BACKEND_HOST — bind address      (default: 127.0.0.1)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

SERVE_PORT="${SERVE_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"

FRONTEND_LOG="$ROOT/.frontend.log"
BACKEND_LOG="$ROOT/.backend.log"
FRONTEND_PID="$ROOT/.frontend.pid"
BACKEND_PID="$ROOT/.backend.pid"

# ── colour helpers ────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ── arg parsing ───────────────────────────────────────────────────────────────

DO_FRONTEND=true
DO_BACKEND=true

stop_process() {
  local pidfile="$1" name="$2"

  if [ ! -f "$pidfile" ]; then
    return 0
  fi

  local pid
  pid="$(cat "$pidfile")"

  if kill -0 "$pid" 2>/dev/null; then
    info "Stopping $name (PID $pid)..."
    kill "$pid" 2>/dev/null || true

    for _ in $(seq 1 10); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done

    if kill -0 "$pid" 2>/dev/null; then
      warn "$name did not stop gracefully; killing..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    warn "$name was not running."
  fi

  rm -f "$pidfile"
}

for arg in "$@"; do
  case "$arg" in
    --frontend) DO_BACKEND=false ;;
    --backend)  DO_FRONTEND=false ;;
    --stop)
      info "Stopping Mizan processes..."
      stop_process "$FRONTEND_PID" "frontend"
      stop_process "$BACKEND_PID"  "backend"
      exit 0
      ;;
    *)
      error "Unknown argument: $arg"
      echo "Usage: $0 [--frontend|--backend|--stop]"
      exit 1
      ;;
  esac
done

# ── pre-flight checks ─────────────────────────────────────────────────────────

if $DO_FRONTEND; then
  if ! command -v node >/dev/null 2>&1; then
    error "Node.js not found. Install via: https://github.com/nvm-sh/nvm"
    exit 1
  fi
  info "Node $(node --version) / npm $(npm --version)"
fi

if $DO_BACKEND; then
  if ! command -v python3 >/dev/null 2>&1; then
    error "python3 not found."
    exit 1
  fi
  info "Python $(python3 --version)"

  if ! command -v ollama >/dev/null 2>&1; then
    warn "ollama not found in PATH — backend will run but AI responses will fail."
    warn "Install Ollama: https://ollama.com"
  else
    info "Ollama: $(ollama --version 2>/dev/null || echo 'found')"
  fi
fi

# ── stop any existing instances ───────────────────────────────────────────────

stop_process "$FRONTEND_PID" "frontend"
stop_process "$BACKEND_PID"  "backend"

# ── frontend ──────────────────────────────────────────────────────────────────

if $DO_FRONTEND; then
  info "Installing frontend dependencies..."
  cd "$ROOT"
  npm ci --silent

  info "Building frontend..."
  npm install --silent --no-audit --no-save serve
  VITE_ASSISTANT_URL="${VITE_ASSISTANT_URL:-http://$BACKEND_HOST:$BACKEND_PORT}" npm run build

  info "Starting frontend static server on port $SERVE_PORT..."
  nohup npx --yes serve -s dist -l "tcp://$BACKEND_HOST:$SERVE_PORT" \
    > "$FRONTEND_LOG" 2>&1 &
  echo $! > "$FRONTEND_PID"
  info "Frontend PID $(cat "$FRONTEND_PID") → http://$BACKEND_HOST:$SERVE_PORT"

  sleep 1
  if ! kill -0 "$(cat "$FRONTEND_PID")" 2>/dev/null; then
    error "Frontend failed to start. See $FRONTEND_LOG"
    exit 1
  fi
fi

# ── backend ───────────────────────────────────────────────────────────────────

if $DO_BACKEND; then
  cd "$ROOT/backend"

  info "Setting up Python virtual environment..."
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi

  source .venv/bin/activate
  # Use python3 -m pip — bare `pip` is not always on PATH after `venv` on some setups.
  python3 -m pip install -q --upgrade pip
  python3 -m pip install -q -r requirements.txt

  # Ensure data directory exists (first run)
  mkdir -p data

  info "Starting backend on $BACKEND_HOST:$BACKEND_PORT..."
  BACKEND_HOST="$BACKEND_HOST" BACKEND_PORT="$BACKEND_PORT" \
    nohup uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" \
    > "$BACKEND_LOG" 2>&1 &
  echo $! > "$BACKEND_PID"
  info "Backend PID $(cat "$BACKEND_PID") → http://$BACKEND_HOST:$BACKEND_PORT"

  sleep 1
  if ! kill -0 "$(cat "$BACKEND_PID")" 2>/dev/null; then
    error "Backend failed to start. See $BACKEND_LOG"
    exit 1
  fi
fi

# ── health check ──────────────────────────────────────────────────────────────

if $DO_FRONTEND; then
  info "Waiting for frontend to be ready..."
  for i in $(seq 1 20); do
    if curl -sf "http://$BACKEND_HOST:$SERVE_PORT" >/dev/null 2>&1; then
      info "Frontend is healthy."
      break
    fi
    if [ "$i" -eq 20 ]; then
      warn "Frontend did not respond after 20s. Check $FRONTEND_LOG"
      break
    fi
    sleep 1
  done
fi

if $DO_BACKEND; then
  info "Waiting for backend to be ready..."
  for i in $(seq 1 20); do
    if curl -sf "http://$BACKEND_HOST:$BACKEND_PORT/health" >/dev/null 2>&1; then
      info "Backend is healthy."
      break
    fi
    if [ "$i" -eq 20 ]; then
      error "Backend did not respond after 20s. Check $BACKEND_LOG"
      exit 1
    fi
    sleep 1
  done
fi

# ── summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} Mizan is running${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if $DO_FRONTEND; then
  echo -e "  Frontend  →  http://$BACKEND_HOST:$SERVE_PORT"
  echo -e "  Logs      →  $FRONTEND_LOG"
fi
if $DO_BACKEND; then
  echo -e "  Backend   →  http://$BACKEND_HOST:$BACKEND_PORT"
  echo -e "  Health    →  http://$BACKEND_HOST:$BACKEND_PORT/health"
  echo -e "  Logs      →  $BACKEND_LOG"
fi
echo ""
echo -e "  Stop with:  ./deploy.sh --stop"
if $DO_FRONTEND; then
  echo ""
  echo -e "  Kiosk mode (Chromium):"
  echo -e "    ${BLUE}chromium-browser \\${NC}"
  echo -e "      ${BLUE}--kiosk \\${NC}"
  echo -e "      ${BLUE}--noerrdialogs \\${NC}"
  echo -e "      ${BLUE}--disable-infobars \\${NC}"
  echo -e "      ${BLUE}--disable-session-crashed-bubble \\${NC}"
  echo -e "      ${BLUE}--disable-features=TranslateUI \\${NC}"
  echo -e "      ${BLUE}--overscroll-history-navigation=0 \\${NC}"
  echo -e "      ${BLUE}--start-maximized \\${NC}"
  echo -e "      ${BLUE}http://$BACKEND_HOST:$SERVE_PORT${NC}"
fi
echo ""
