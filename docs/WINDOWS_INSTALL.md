# Mizan — Windows installation guide

This guide walks through installing and running Mizan on **Windows 10/11**. The app works without the AI backend; the Smart Assistant needs **Ollama** plus the Python API.

**No Bash or GNU Make required** — use the PowerShell scripts in `scripts/windows/` (or the `install.bat` / `mizan.bat` launchers at the project root).

---

## Quick start (PowerShell)

From the project root in **PowerShell** or **Command Prompt**:

```powershell
# One-time setup (Node + Python venv + npm ci)
.\install.bat
# or: powershell -ExecutionPolicy Bypass -File .\scripts\windows\mizan.ps1 install

# Development — two terminals
.\mizan.bat dev        # API on http://127.0.0.1:8000
.\mizan.bat dev-ui     # UI on http://localhost:5173

# Production-style (built UI on port 3000)
.\mizan.bat start
.\mizan.bat stop
```

All commands: `.\mizan.bat help` or `.\scripts\windows\mizan.ps1 help`.

Override ports with environment variables (same as `make` on Linux/macOS):

```powershell
$env:BACKEND_PORT = "8001"
$env:VITE_PORT = "5174"
.\mizan.bat dev
```

---

## What you will run

| Service | Default port | Purpose |
|---------|--------------|---------|
| **Frontend (dev)** | **5173** | Mizan UI in the browser (`npm run dev`) |
| **Frontend (prod)** | **3000** | Built UI (`make start` / `deploy.sh`) |
| **Backend (API)** | **8000** | Assistant API (`make dev` or manual uvicorn) |
| **Ollama** | **11434** | Local LLM (optional, for AI only) |

Open the kiosk UI at **http://localhost:5173** during development — not port 8000 (that is API-only).

---

## 1. Install prerequisites

### Node.js (required)

1. Download **Node.js LTS** from [https://nodejs.org/](https://nodejs.org/).
2. Run the installer (include **npm**).
3. Verify in **PowerShell** or **Command Prompt**:

```powershell
node --version
npm --version
```

### Python 3.11+ (required for AI assistant)

1. Download from [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/).
2. On the first installer screen, check **“Add python.exe to PATH”**.
3. Verify:

```powershell
python --version
```

### Git for Windows (optional)

Only needed to clone the repo or to use Linux-style `make` / `deploy.sh`.

1. Install [Git for Windows](https://git-scm.com/download/win) if you use `git clone`.

### GNU Make / Git Bash (optional)

Use **`mizan.bat`** / **`scripts\windows\mizan.ps1`** instead of Make. If you prefer the Makefile, install Make (e.g. `choco install make`) and run commands from Git Bash.

### Ollama (optional — Smart Assistant)

1. Download from [https://ollama.com/download/windows](https://ollama.com/download/windows).
2. Install and ensure the Ollama app is running (tray icon).
3. Pull models (match `backend/data/config.yaml`):

```powershell
ollama pull llama3.2:latest
ollama pull nomic-embed-text
```

Verify:

```powershell
ollama --version
curl http://localhost:11434/api/tags
```

---

## 2. Get the project

```powershell
cd $HOME\Projects
git clone https://github.com/multekedir/Mizan.git mizan
cd mizan
```

Or download a ZIP from GitHub and extract it, then:

```powershell
cd path\to\mizan
```

---

## 3. Install Mizan

From the project root in **PowerShell** or **Command Prompt**:

```powershell
.\install.bat
```

Equivalent:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\mizan.ps1 install
```

This runs `npm ci`, creates `backend\.venv`, installs Python dependencies, and copies `.env.example` → `.env.local` if needed.

Edit `.env.local` if needed (see `.env.example`). For the assistant:

```env
VITE_ASSISTANT_URL=http://localhost:8000
```

### Windows commands (`mizan.bat`)

| Goal | Command |
|------|---------|
| Install | `.\install.bat` or `.\mizan.bat install` |
| Dev API | `.\mizan.bat dev` |
| Dev UI | `.\mizan.bat dev-ui` |
| Build UI | `.\mizan.bat build` |
| Production (UI + API) | `.\mizan.bat start` |
| Stop background services | `.\mizan.bat stop` |
| Help | `.\mizan.bat help` |

Custom ports (PowerShell env vars before the command):

```powershell
$env:BACKEND_PORT = "8001"
$env:VITE_PORT = "5174"
.\mizan.bat dev
```

---

## 4. Run Mizan (development)

You need **two terminals** for full functionality (UI + AI).

### Terminal A — Backend (API on port 8000)

```powershell
.\mizan.bat dev
```

API health: **http://127.0.0.1:8000/health**.

### Terminal B — Frontend (UI on port 5173)

```powershell
.\mizan.bat dev-ui
```

Open **http://localhost:5173** in Edge or Chrome.

### Manual setup (without `mizan.bat`)

If you prefer not to use the scripts:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

If activation fails with an execution policy error:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Frontend (second terminal, project root):

```powershell
npm run dev -- --port 5173
```

---

## 5. Production-style run (built UI on port 3000)

```powershell
.\mizan.bat start
```

Then open **http://127.0.0.1:3000**. Logs: `.frontend.log`, `.backend.log`. PIDs: `.frontend.pid`, `.backend.pid`.

Stop:

```powershell
.\mizan.bat stop
```

Custom ports:

```powershell
$env:SERVE_PORT = "3000"
$env:BACKEND_PORT = "8000"
.\mizan.bat start
```

**Git Bash alternative:** `make install`, `make start`, `make stop`.

---

## 6. Configure the assistant

Edit **`backend/data/config.yaml`**:

- Family member names under `assistant.members`
- Ollama models under `ollama:` (must match `ollama pull` names)
- Location / prayer settings if present in your copy

After changing models, pull them again:

```powershell
ollama pull llama3.2:latest
ollama pull nomic-embed-text
```

---

## 7. Windows firewall

The first time Python or Node listens on a port, Windows may prompt for network access. Allow **Private networks** for localhost development.

If the browser cannot reach the API, allow inbound rules for **Python** and **Node** on ports **5173**, **8000**, and **11434** (Ollama).

---

## 8. Troubleshooting

### Blank page or “Not Found” on port 8000

Port **8000** is the **API only**, not the React app. Use **http://localhost:5173** for the UI.

### Assistant shows “Not Found” or connection errors

1. Confirm the Mizan API is running: open **http://localhost:8000/health** — JSON should include `kb_documents` and `history_turns`.
2. If you see a different health shape (`checks.db`), another app is using port 8000 — stop it or change `BACKEND_PORT`.
3. Confirm Ollama is running and models are pulled.
4. Check `.env.local` has `VITE_ASSISTANT_URL=http://localhost:8000` and restart `npm run dev`.

### `pip` cannot reach pypi.org

Fix DNS or proxy/VPN, then retry. The venv can still work if dependencies were installed once.

### Port already in use

Find what is listening (PowerShell):

```powershell
netstat -ano | findstr :5173
netstat -ano | findstr :8000
```

Stop that process in Task Manager, or use another port:

```powershell
npm run dev -- --port 5174
```

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

Update `VITE_ASSISTANT_URL` if you change the backend port.

### `make` is not recognized

Use **`.\mizan.bat`** (see section 3) instead of Make.

### WSL alternative

You can clone and run Mizan inside **WSL2 (Ubuntu)** and follow the Linux flow in the main [README](../README.md). Open the UI from Windows at the WSL IP or use `localhost` if WSL port forwarding is enabled.

---

## 9. Quick reference

| Goal | Command | Browser URL |
|------|---------|-------------|
| First-time setup | `.\install.bat` | — |
| UI only (no AI) | `.\mizan.bat dev-ui` | http://localhost:5173 |
| API only | `.\mizan.bat dev` | http://localhost:8000/health |
| UI + AI | `dev` + `dev-ui` in two terminals | http://localhost:5173 |
| Full deploy | `.\mizan.bat start` | http://localhost:3000 |

---

## 10. Next steps

- Main documentation: [README](../README.md)
- RAG / knowledge base: [backend/RAG_SYSTEM.md](../backend/RAG_SYSTEM.md)
- Kiosk setup on Linux hardware: `make kiosk-setup` (not for Windows desktops)
