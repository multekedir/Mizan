#!/usr/bin/env bash
# Mizan — deploy script (frontend + backend)
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

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }

print_ports() {
  echo ""
  echo -e "${BLUE}  Ports${NC}"
  $DO_FRONTEND && echo -e "    UI (frontend, port ${SERVE_PORT})  →  http://${BACKEND_HOST}:${SERVE_PORT}"
  $DO_BACKEND  && echo -e "    API (backend)  →  http://${BACKEND_HOST}:${BACKEND_PORT}"
  echo ""
}

# ── helpers ───────────────────────────────────────────────────────────────────

stop_process() {
  local pidfile="$1" name="$2"
  [ -f "$pidfile" ] || return 0
  local pid; pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    info "Stopping $name (PID $pid)..."
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  else
    warn "$name was not running."
  fi
  rm -f "$pidfile"
}

free_listen_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids; pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      warn "Port $port is in use; stopping listener(s)..."
      # shellcheck disable=SC2086
      kill -TERM $pids 2>/dev/null || true
      sleep 0.5
      pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
      # shellcheck disable=SC2086
      [ -n "$pids" ] && kill -KILL $pids 2>/dev/null || true
    fi
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
}

wait_for_url() {
  local url="$1" label="$2" logfile="$3" fatal="${4:-false}"
  info "Waiting for $label..."
  for i in $(seq 1 20); do
    if curl -sf "$url" >/dev/null 2>&1; then
      info "$label is healthy."
      return 0
    fi
    [ "$i" -eq 20 ] && break
    sleep 1
  done
  if [ "$fatal" = "true" ]; then
    error "$label did not respond after 20s. See $logfile"
    exit 1
  else
    warn "$label did not respond after 20s. Check $logfile"
  fi
}

# ── arg parsing ───────────────────────────────────────────────────────────────

DO_FRONTEND=true
DO_BACKEND=true

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

print_ports

# ── pre-flight checks ─────────────────────────────────────────────────────────

if $DO_FRONTEND; then
  command -v node >/dev/null 2>&1 || { error "Node.js not found."; exit 1; }
  info "Node $(node --version) / npm $(npm --version)"
fi

if $DO_BACKEND; then
  command -v python3 >/dev/null 2>&1 || { error "python3 not found."; exit 1; }
  info "Python $(python3 --version)"
  command -v ollama >/dev/null 2>&1 \
    && info "Ollama: $(ollama --version 2>/dev/null || echo 'found')" \
    || warn "ollama not found in PATH — AI responses will fail."
fi

# ── stop existing instances ───────────────────────────────────────────────────

stop_process "$FRONTEND_PID" "frontend"
stop_process "$BACKEND_PID"  "backend"

# ── frontend ──────────────────────────────────────────────────────────────────

if $DO_FRONTEND; then
  cd "$ROOT"
  info "Installing frontend dependencies..."
  npm ci --silent

  info "Building frontend..."
  npm install --silent --no-audit --no-save serve
  VITE_ASSISTANT_URL="${VITE_ASSISTANT_URL:-http://$BACKEND_HOST:$BACKEND_PORT}" npm run build

  SERVE_BIN="$ROOT/node_modules/.bin/serve"
  [ -e "$SERVE_BIN" ] || { error "serve not found at $SERVE_BIN"; exit 1; }

  free_listen_port "$SERVE_PORT"

  info "Starting frontend — listening on port $SERVE_PORT..."
  nohup "$SERVE_BIN" -s dist -l "tcp://$BACKEND_HOST:$SERVE_PORT" > "$FRONTEND_LOG" 2>&1 &
  echo $! > "$FRONTEND_PID"
  info "Frontend PID $(cat "$FRONTEND_PID") → http://$BACKEND_HOST:$SERVE_PORT"

  sleep 1
  kill -0 "$(cat "$FRONTEND_PID")" 2>/dev/null || { error "Frontend failed to start. See $FRONTEND_LOG"; exit 1; }
fi

# ── backend ───────────────────────────────────────────────────────────────────

if $DO_BACKEND; then
  cd "$ROOT/backend"

  # Recreate venv if the interpreter is missing.
  if [ -d ".venv" ] && ! .venv/bin/python3 -c "" 2>/dev/null; then
    warn "Stale backend venv — recreating..."
    rm -rf .venv
  fi

  info "Setting up Python virtual environment..."
  [ -d ".venv" ] || python3 -m venv .venv

  source .venv/bin/activate
  python3 -m pip install -q --upgrade pip
  python3 -m pip install -q -r requirements.txt
  mkdir -p data

  free_listen_port "$BACKEND_PORT"

  info "Starting backend — listening on port $BACKEND_PORT..."
  BACKEND_HOST="$BACKEND_HOST" BACKEND_PORT="$BACKEND_PORT" \
    nohup uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" \
    > "$BACKEND_LOG" 2>&1 &
  echo $! > "$BACKEND_PID"
  info "Backend PID $(cat "$BACKEND_PID") → http://$BACKEND_HOST:$BACKEND_PORT"

  sleep 1
  kill -0 "$(cat "$BACKEND_PID")" 2>/dev/null || { error "Backend failed to start. See $BACKEND_LOG"; exit 1; }
fi

# ── health checks ─────────────────────────────────────────────────────────────

$DO_FRONTEND && wait_for_url "http://$BACKEND_HOST:$SERVE_PORT"          "frontend" "$FRONTEND_LOG"
$DO_BACKEND  && wait_for_url "http://$BACKEND_HOST:$BACKEND_PORT/health" "backend"  "$BACKEND_LOG" true

# ── summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} Mizan is running${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
$DO_FRONTEND && echo -e "  UI on port ${SERVE_PORT}  →  http://$BACKEND_HOST:$SERVE_PORT  (log: $FRONTEND_LOG)"
$DO_BACKEND  && echo -e "  API on port ${BACKEND_PORT}  →  http://$BACKEND_HOST:$BACKEND_PORT  (log: $BACKEND_LOG)"
echo -e "  Stop      →  make stop  (or ./deploy.sh --stop)"
echo ""
