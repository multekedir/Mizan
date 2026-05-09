#!/usr/bin/env bash
# Development start — hot-reload, localhost only.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
python3 -m pip install -q -r requirements.txt

echo "Mizan Assistant backend (dev) → http://localhost:8000"
exec uvicorn main:app --reload --host 127.0.0.1 --port 8000
