from __future__ import annotations

import json
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse

from assistant import chat, chat_stream
from config import settings
from kb import kb
from models import (
    ChatRequest,
    ChatResponse,
    ConfigResponse,
    HistoryMessage,
    HistoryResponse,
    KBAddRequest,
    KBDocument,
    KBDocumentPublic,
    KBListResponse,
    KBUpdateRequest,
    NotesResponse,
)

# ── Persistent state ──────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent / "data"

_history: list[dict] = []
_notes: list[str] = []


def _load_state() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    h = DATA_DIR / "history.json"
    n = DATA_DIR / "notes.json"
    global _history, _notes
    if h.exists():
        _history = json.loads(h.read_text(encoding="utf-8"))
    if n.exists():
        _notes = json.loads(n.read_text(encoding="utf-8"))


def _save_history() -> None:
    (DATA_DIR / "history.json").write_text(
        json.dumps(_history[-100:], ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _save_notes() -> None:
    (DATA_DIR / "notes.json").write_text(
        json.dumps(_notes, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _norm(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[^a-z0-9 ]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def _seed_kb() -> None:
    if not kb.is_empty():
        return
    for seed in settings.knowledge_base.seed_documents:
        doc = KBDocument(
            id=str(uuid.uuid4()),
            category=seed.category,
            content=seed.content.strip(),
        )
        kb.add(doc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_state()
    _seed_kb()
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Mizan Assistant", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.server.cors_origins,
    # Browser uses exact Origin matching — 127.0.0.1 vs localhost, or a different dev port (e.g. 5174),
    # all fail preflight with 400 unless allowed here or listed explicitly in cors_origins.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Root (avoid “broken app” when opening :8000 in the browser) ───────────────

@app.get("/", response_class=HTMLResponse)
async def root():
    return """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mizan API</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#173B34}
a{color:#2A6156}code{background:#F7ECD6;padding:.15em .4em;border-radius:.25rem}</style></head>
<body>
  <h1>Mizan API is running</h1>
  <p>This port is the <strong>assistant backend</strong>, not the kiosk UI.</p>
  <p>Open the app in your browser:</p>
  <ul>
    <li><a href="http://localhost:5173">http://localhost:5173</a> — <code>npm run dev</code></li>
    <li><a href="http://localhost:3000">http://localhost:3000</a> — <code>make start</code></li>
  </ul>
  <p><a href="/health">/health</a> · API under <code>/v1/…</code></p>
</body>
</html>"""


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "history_turns": len(_history) // 2,
        "notes": len(_notes),
        "kb_documents": len(kb.all()),
    }


# ── Config ────────────────────────────────────────────────────────────────────

@app.get("/v1/config", response_model=ConfigResponse)
async def get_config():
    cfg = settings
    return ConfigResponse(
        assistant_name=cfg.assistant.name,
        chat_model=cfg.ollama.chat_model,
        embed_model=cfg.ollama.embed_model,
        response_format=cfg.assistant.response_format,
        rag_top_k=cfg.rag.top_k,
        members=[m.name for m in cfg.assistant.members],
    )


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/v1/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    """SSE stream. Token events: data: {"token":"…"}  Final: data: [DONE] {full payload}"""
    async def generate():
        try:
            async for raw_line in chat_stream(req, _history, _notes):
                yield raw_line
                # Intercept the [DONE] event to persist history + notes
                if raw_line.startswith("data: [DONE] "):
                    payload_str = raw_line[len("data: [DONE] "):].strip()
                    try:
                        payload = json.loads(payload_str)
                        _persist_turn(req.message, payload)
                    except Exception:
                        pass
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot reach Ollama. Is it running?'})}\n\n"
        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': 'The assistant took too long to respond. Please try again.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _persist_turn(user_message: str, payload: dict) -> None:
    """Save conversation turn + any new memory notes to disk."""
    memory_updates = payload.get("memory_updates") or []
    if memory_updates:
        existing_norm = {_norm(n) for n in _notes}
        for note in memory_updates:
            if _norm(note) not in existing_norm:
                _notes.append(note)
                existing_norm.add(_norm(note))
        _save_notes()
    assistant_content = payload.get("message", "")
    # Guard: never save raw JSON as history — it primes the model to ignore schema
    if assistant_content.strip().startswith("{"):
        assistant_content = ""
    if not assistant_content:
        return  # nothing useful to save
    _history.append({"role": "user", "content": user_message})
    _history.append({"role": "assistant", "content": assistant_content})
    if len(_history) > 200:
        _history[:] = _history[-200:]
    _save_history()


@app.post("/v1/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    try:
        response = await chat(req, _history, _notes)
    except httpx.ConnectError:
        raise HTTPException(502, detail="Cannot reach Ollama at localhost:11434.")
    except httpx.TimeoutException:
        raise HTTPException(504, detail="Ollama timed out.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, detail=f"Ollama error: {e.response.text[:200]}")
    except ValueError as e:
        raise HTTPException(502, detail=str(e))

    _persist_turn(req.message, response.model_dump())
    return response


# ── History ───────────────────────────────────────────────────────────────────

@app.get("/v1/history", response_model=HistoryResponse)
async def get_history():
    return HistoryResponse(messages=[HistoryMessage(**m) for m in _history[-40:]])


@app.delete("/v1/history")
async def clear_history():
    global _history
    _history = []
    _save_history()
    return {"status": "cleared"}


# ── Notes ─────────────────────────────────────────────────────────────────────

@app.get("/v1/notes", response_model=NotesResponse)
async def get_notes():
    return NotesResponse(notes=_notes)


@app.delete("/v1/notes/{index}", response_model=NotesResponse)
async def delete_note(index: int):
    global _notes
    if index < 0 or index >= len(_notes):
        raise HTTPException(404, detail="Note index out of range.")
    _notes = [n for i, n in enumerate(_notes) if i != index]
    _save_notes()
    return NotesResponse(notes=_notes)


# ── Knowledge Base ────────────────────────────────────────────────────────────

@app.get("/v1/knowledge", response_model=KBListResponse)
async def list_knowledge(category: str | None = None):
    docs = kb.all()
    if category:
        docs = [d for d in docs if d.category == category]
    return KBListResponse(
        documents=[
            KBDocumentPublic(**{k: v for k, v in d.model_dump().items() if k != "embedding"})
            for d in docs
        ],
        total=len(docs),
    )


@app.post("/v1/knowledge", response_model=KBDocumentPublic, status_code=201)
async def add_knowledge(req: KBAddRequest):
    doc = KBDocument(
        id=str(uuid.uuid4()),
        category=req.category,
        content=req.content,
        doc_kind=req.doc_kind,
        tags=req.tags,
        valid_from=req.valid_from,
        valid_until=req.valid_until,
        priority=req.priority,
    )
    saved = kb.add(doc)
    return KBDocumentPublic(**{k: v for k, v in saved.model_dump().items() if k != "embedding"})


@app.get("/v1/knowledge/{doc_id}", response_model=KBDocumentPublic)
async def get_knowledge(doc_id: str):
    doc = kb.get(doc_id)
    if doc is None:
        raise HTTPException(404, detail="Document not found.")
    return KBDocumentPublic(**{k: v for k, v in doc.model_dump().items() if k != "embedding"})


@app.put("/v1/knowledge/{doc_id}", response_model=KBDocumentPublic)
async def update_knowledge(doc_id: str, req: KBUpdateRequest):
    doc = kb.update(doc_id, req)
    if doc is None:
        raise HTTPException(404, detail="Document not found.")
    return KBDocumentPublic(**{k: v for k, v in doc.model_dump().items() if k != "embedding"})


@app.delete("/v1/knowledge/{doc_id}")
async def delete_knowledge(doc_id: str):
    if not kb.delete(doc_id):
        raise HTTPException(404, detail="Document not found.")
    return {"status": "deleted", "id": doc_id}
