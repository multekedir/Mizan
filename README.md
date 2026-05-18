# Mizan

Family kiosk dashboard for prayer rhythm, daily tasks, goals, and household management — with an optional local AI assistant that suggests structured tasks from natural language.

Built for a touch screen. All data stays in the browser. The AI backend is fully optional and runs locally via [Ollama](https://ollama.com/).

---

## What it does

- **Prayer rhythm** — computes daily prayer times (`adhan` library), highlights the current block, and plays the athan at each prayer
- **Tasks** — create, assign, and complete tasks across family members; supports daily, weekly, monthly, and one-off schedules; logical-day rollover at 4 AM
- **Goals** — long-running family goals with linked task suggestions from the assistant
- **AI assistant** — a local FastAPI + Ollama backend that reads context (pending tasks, prayer times, recurring schedule, goals) and returns structured task suggestions or plain chat
- **Google Calendar** — optional OAuth import for external calendar events
- **Weather** — optional OpenWeatherMap widget in the header

---

## Project structure

```
mizan/
├── src/                        # React frontend (Vite + TypeScript)
│   ├── components/             # UI components grouped by feature
│   ├── stores/                 # Zustand state (tasks, goals, people, assistant …)
│   ├── services/               # API clients (assistant, prayer, weather, calendar)
│   ├── db/database.ts          # Dexie (IndexedDB) schema
│   └── lib/                    # Utilities (logical day, prayer blocks, NL parser …)
├── backend/                    # Python FastAPI assistant service
│   ├── main.py                 # HTTP routes (chat, history, notes, KB CRUD)
│   ├── assistant.py            # Ollama call, streaming, response parsing
│   ├── prompt.py               # System prompt builder (intent-aware, prayer-aware)
│   ├── intent.py               # Request classification heuristics
│   ├── kb.py                   # Knowledge base — embedding + hybrid retrieval
│   ├── config.py               # Typed settings loader from data/config.yaml
│   ├── models.py               # Pydantic request/response models
│   ├── data/
│   │   ├── config.yaml         # All runtime configuration (edit this)
│   │   ├── kb.json             # Persisted knowledge base with embeddings
│   │   ├── history.json        # Conversation history (last 100 turns)
│   │   └── notes.json          # Remembered notes ("remember that …")
│   ├── tests/                  # pytest test suite
│   └── dev.sh                  # Dev server with hot-reload
├── deploy.sh                   # Full deploy script (build + start both services)
├── install.bat                 # Windows: first-time install
├── mizan.bat                   # Windows: dev / start / stop (wraps scripts/windows/mizan.ps1)
├── scripts/windows/mizan.ps1   # Windows PowerShell tasks (install, dev, deploy)
└── .env.example                # Frontend environment variables template
```

---

## Running locally

**Windows:** run `install.bat`, then `mizan.bat dev` + `mizan.bat dev-ui`. See [docs/WINDOWS_INSTALL.md](docs/WINDOWS_INSTALL.md) for prerequisites, Ollama, and troubleshooting.

### Prerequisites

| Tool | Purpose |
|------|---------|
| Node.js (LTS) | Frontend dev server and build |
| Python 3.11+ | Backend (use a venv) |
| [Ollama](https://ollama.com/) | Local LLM inference (optional — required for AI) |

Pull the models named in `backend/data/config.yaml` before starting the backend:

```bash
ollama pull aya:latest            # task-aware chat model
ollama pull llama3.2:latest       # fast chat-only model
ollama pull nomic-embed-text      # embeddings for RAG
```

### Frontend

```bash
npm install
npm run dev          # http://localhost:5173
```

### Backend

```bash
cd backend
./dev.sh             # creates venv, installs deps, starts uvicorn --reload on :8000
```

The backend is fully independent. The frontend works without it — the assistant button simply won't produce task suggestions.

### Deploy (production)

`deploy.sh` at the project root builds the frontend, installs the backend, and starts both as background processes:

```bash
./deploy.sh           # build frontend + start both services
./deploy.sh --stop    # stop both

# partial restarts
./deploy.sh --backend
./deploy.sh --frontend

# custom ports
SERVE_PORT=4000 BACKEND_PORT=9000 ./deploy.sh
```

Logs go to `.frontend.log` and `.backend.log`. PIDs are tracked in `.frontend.pid` and `.backend.pid`.

**Kiosk mode (Chromium):**

```bash
chromium-browser --kiosk --disable-infobars http://127.0.0.1:3000/
```

---

## Configuration

### Frontend environment variables

Copy `.env.example` to `.env.local` and fill in the values you need:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_ASSISTANT_URL` | `http://localhost:8000` | Backend API base URL |
| `VITE_GOOGLE_CLIENT_ID` | — | Google OAuth (Calendar import) |
| `VITE_GOOGLE_API_KEY` | — | Google API key (public calendars) |
| `VITE_GOOGLE_CALENDAR_ID` | `primary` | Calendar to sync |
| `VITE_OPENWEATHER_API_KEY` | — | Weather widget |

### Backend (`backend/data/config.yaml`)

All backend behaviour is controlled through `config.yaml`. Key sections:

```yaml
ollama:
  chat_model: "aya:latest"           # model used for task requests (JSON mode)
  chat_model_fast: "llama3.2:latest" # model used for plain chat replies
  embed_model: "nomic-embed-text"    # model used for KB embeddings
  timeout_seconds: 90

rag:
  top_k: 5           # max KB documents injected per query
  min_score: 0.25    # minimum hybrid score to include a document
  keyword_fallback: true

assistant:
  name: "Mizan"
  response_format: json   # "json" → structured tasks | "text" → plain chat
  members:
    - name: "Mom"
    - name: "Dad"
    - name: "Zayd"
      too_young_for_tasks: true
```

The `knowledge_base.seed_documents` section pre-populates `kb.json` on first run. To reset and re-seed, delete `backend/data/kb.json`.

---

## How the assistant works

1. **Browser** assembles `live_context` — current tasks, recurring definitions, active goals, prayer times, current time — and POSTs to `/v1/chat/stream`
2. **Intent classification** (`intent.py`) decides whether to generate tasks and which branch of the system prompt applies (today-only, event plan, recurring routine, cleaning, goal statement, or general)
3. **RAG retrieval** (`kb.py`) fetches the top-k relevant KB documents using hybrid scoring (cosine similarity + keyword overlap + category boost); falls back to keyword-only when embeddings are unavailable
4. **System prompt** is assembled from the intent, KB docs, family context, prayer times, and active goals
5. **Ollama** returns either plain text (chat mode) or JSON `{ message, tasks[], memory_updates[], goal }` (task mode), streamed token-by-token
6. **Response parsing** (`assistant.py`) validates task fields, resolves assignees, deduplicates against pending tasks, and emits the final `[DONE]` SSE event
7. **Frontend** receives the structured payload, creates ghost task cards the user can accept or dismiss

See `backend/RAG_SYSTEM.md` for the full RAG implementation details.

---

## Tech stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v3, Framer Motion |
| Client state | Zustand, Dexie (IndexedDB) |
| Prayer times | adhan.js (NorthAmerica calculation method) |
| Backend | FastAPI, uvicorn, httpx, Pydantic v2, PyYAML |
| AI | Ollama (local LLMs + embeddings) |

---

## Backend API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health + counts |
| `POST` | `/v1/chat/stream` | SSE streaming chat (primary endpoint) |
| `POST` | `/v1/chat` | Non-streaming chat |
| `GET/DELETE` | `/v1/history` | Conversation history |
| `GET/DELETE` | `/v1/notes/:index` | Remembered notes |
| `GET/POST` | `/v1/knowledge` | List / add KB documents |
| `GET/PUT/DELETE` | `/v1/knowledge/:id` | Read / update / delete a KB document |
| `GET` | `/v1/config` | Active configuration summary |
