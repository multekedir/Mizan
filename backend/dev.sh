#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Recreate venv if the interpreter is missing (e.g. after a Python upgrade or copy from another machine).
if [ -d ".venv" ] && ! .venv/bin/python3 -c "" 2>/dev/null; then
  echo "Stale venv detected — recreating..."
  rm -rf .venv
fi

[ -d ".venv" ] || python3 -m venv .venv

source .venv/bin/activate
python3 -m pip install -q --upgrade pip
python3 -m pip install -q -r requirements.txt

HOST="${BACKEND_HOST:-127.0.0.1}"
PORT="${BACKEND_PORT:-8000}"

echo ""
echo "  Listening on port ${PORT}"
echo "  Mizan API  →  http://${HOST}:${PORT}"
echo "  Health     →  http://${HOST}:${PORT}/health"
echo "  Mizan UI   →  http://localhost:5173  (make dev-ui, VITE_PORT)"
echo "               http://localhost:3000  (make start, SERVE_PORT)"
echo ""
exec uvicorn main:app --reload --host "$HOST" --port "$PORT"
