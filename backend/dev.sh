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

echo "Mizan backend (dev) → http://localhost:8000"
exec uvicorn main:app --reload --host 127.0.0.1 --port 8000
