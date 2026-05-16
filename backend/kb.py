"""Knowledge Base — CRUD + semantic retrieval via Ollama embeddings."""
from __future__ import annotations

import asyncio
import json
import math
import re
import time
from pathlib import Path

import httpx

from config import settings
from models import KBDocument

KB_PATH = Path(__file__).parent / "data" / "kb.json"

_MAX_EMBED_FAILURES = 3         # consecutive per-doc failures before giving up
_BACKOFF_TRANSIENT  = 300.0     # seconds to wait after a ConnectError / timeout
_BACKOFF_MODEL_404  = 1800.0    # seconds to wait after 404 (wrong model name)

_STOP_WORDS = frozenset({
    "a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "with",
    "is", "are", "was", "were", "be", "been", "have", "has", "had",
    "do", "does", "did", "but", "if", "at", "by", "from", "up", "out",
    "as", "it", "its", "this", "that", "my", "our", "your", "me", "us", "we", "i", "you",
})


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", text.lower()) if w not in _STOP_WORDS and len(w) > 2}


def _category_boost_from_tokens(query_words: set[str], category: str) -> float:
    cat_words = {w for w in re.findall(r"\w+", category.lower().replace("_", " ")) if len(w) > 2}
    return min(0.08 * len(query_words & cat_words), 0.2)


class KnowledgeBase:
    def __init__(self) -> None:
        self._docs: dict[str, KBDocument] = {}
        self._embed_unavailable_until: float = 0.0   # monotonic; 0 = always available
        self._magnitudes: dict[str, float] = {}
        self._token_cache: dict[str, set[str]] = {}
        self._pending_embed: set[str] = set()        # doc IDs that need an embedding
        self._embed_failures: dict[str, int] = {}    # doc ID → consecutive failure count
        self._load()

    # ── persistence ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        if KB_PATH.exists():
            raw = json.loads(KB_PATH.read_text(encoding="utf-8"))
            for item in raw:
                doc = KBDocument(**item)
                self._docs[doc.id] = doc
                if not doc.embedding:
                    self._pending_embed.add(doc.id)

    def _save(self) -> None:
        KB_PATH.parent.mkdir(exist_ok=True)
        data = [d.model_dump() for d in self._docs.values()]
        KB_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # ── CRUD ─────────────────────────────────────────────────────────────────

    def all(self) -> list[KBDocument]:
        return list(self._docs.values())

    def get(self, doc_id: str) -> KBDocument | None:
        return self._docs.get(doc_id)

    def add(self, doc: KBDocument) -> KBDocument:
        self._docs[doc.id] = doc
        if not doc.embedding:
            self._pending_embed.add(doc.id)
        self._save()
        return doc

    def update(self, doc_id: str, category: str | None, content: str | None) -> KBDocument | None:
        doc = self._docs.get(doc_id)
        if doc is None:
            return None
        if category is not None:
            doc.category = category
        if content is not None:
            doc.content = content
            doc.embedding = []
            self._magnitudes.pop(doc_id, None)
            self._token_cache.pop(doc_id, None)
            self._pending_embed.add(doc_id)
            self._embed_failures.pop(doc_id, None)
        self._save()
        return doc

    def delete(self, doc_id: str) -> bool:
        if doc_id not in self._docs:
            return False
        del self._docs[doc_id]
        self._magnitudes.pop(doc_id, None)
        self._token_cache.pop(doc_id, None)
        self._pending_embed.discard(doc_id)
        self._embed_failures.pop(doc_id, None)
        self._save()
        return True

    def is_empty(self) -> bool:
        return len(self._docs) == 0

    # ── embeddings ───────────────────────────────────────────────────────────

    async def _embed(self, text: str) -> list[float]:
        if time.monotonic() < self._embed_unavailable_until:
            raise RuntimeError("embed model temporarily unavailable (backoff)")
        url = f"{settings.ollama.base_url}/api/embeddings"
        async with httpx.AsyncClient(timeout=settings.ollama.timeout_seconds) as client:
            resp = await client.post(url, json={"model": settings.ollama.embed_model, "prompt": text})
            if resp.status_code == 404:
                self._embed_unavailable_until = time.monotonic() + _BACKOFF_MODEL_404
                raise RuntimeError(f"embed model not found: {settings.ollama.embed_model}")
            resp.raise_for_status()
        return resp.json()["embedding"]

    async def _embed_missing(self) -> None:
        """Embed docs in _pending_embed, skipping those that have hit the failure limit."""
        pending = [
            self._docs[doc_id]
            for doc_id in self._pending_embed
            if doc_id in self._docs
            and self._embed_failures.get(doc_id, 0) < _MAX_EMBED_FAILURES
        ]
        if not pending:
            return

        semaphore = asyncio.Semaphore(4)

        async def _embed_one(doc: KBDocument) -> list[float]:
            async with semaphore:
                return await self._embed(doc.content)

        results = await asyncio.gather(*(_embed_one(d) for d in pending), return_exceptions=True)
        dirty = False
        for doc, result in zip(pending, results):
            if isinstance(result, BaseException):
                self._embed_failures[doc.id] = self._embed_failures.get(doc.id, 0) + 1
                if self._embed_failures[doc.id] >= _MAX_EMBED_FAILURES:
                    print(f"[kb] giving up on doc {doc.id!r} after {_MAX_EMBED_FAILURES} failures")
                continue
            doc.embedding = result  # type: ignore[assignment]
            self._embed_failures.pop(doc.id, None)
            self._pending_embed.discard(doc.id)
            self._magnitudes.pop(doc.id, None)
            dirty = True
        if dirty:
            self._save()

    def _doc_norm(self, doc: KBDocument) -> float:
        if doc.id not in self._magnitudes:
            self._magnitudes[doc.id] = math.sqrt(sum(x * x for x in doc.embedding)) if doc.embedding else 0.0
        return self._magnitudes[doc.id]

    def _doc_tokens(self, doc: KBDocument) -> set[str]:
        if doc.id not in self._token_cache:
            self._token_cache[doc.id] = _tokens(doc.content)
        return self._token_cache[doc.id]

    # ── retrieval ────────────────────────────────────────────────────────────

    def retrieve_keywords(self, query: str) -> list[KBDocument]:
        """Synchronous keyword-only retrieval — zero network calls."""
        cfg = settings.rag
        docs = list(self._docs.values())
        if not docs:
            return []
        query_words = _tokens(query)
        scored = [
            (round(
                (len(query_words & self._doc_tokens(d)) / len(query_words) if query_words else 0.0)
                + _category_boost_from_tokens(query_words, d.category),
                4,
            ), d)
            for d in docs
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [d for score, d in scored[: cfg.top_k] if score > 0]

    async def retrieve(self, query: str) -> list[KBDocument]:
        """Keyword-first retrieval; upgrades to hybrid (0.65 cosine + 0.35 keyword) only when needed."""
        cfg = settings.rag
        docs = list(self._docs.values())
        if not docs:
            return []

        # Always run keyword retrieval first — zero network calls.
        # If it returns a full top_k, that's good enough; skip Ollama entirely.
        kw_results = self.retrieve_keywords(query)
        if len(kw_results) >= cfg.top_k or time.monotonic() < self._embed_unavailable_until:
            return kw_results

        # Keyword alone didn't fill top_k — upgrade to hybrid.
        try:
            await self._embed_missing()
            q_emb = await self._embed(query)
            q_norm = math.sqrt(sum(x * x for x in q_emb))
            query_words = _tokens(query)
            scored: list[tuple[float, KBDocument]] = []
            for doc in docs:
                if not doc.embedding:
                    continue
                dot = sum(x * y for x, y in zip(q_emb, doc.embedding))
                d_norm = self._doc_norm(doc)
                cosine = dot / (q_norm * d_norm) if q_norm and d_norm else 0.0
                kw = len(query_words & self._doc_tokens(doc)) / len(query_words) if query_words else 0.0
                hybrid = 0.65 * cosine + 0.35 * kw + _category_boost_from_tokens(query_words, doc.category)
                if hybrid >= cfg.min_score:
                    scored.append((hybrid, doc))
            scored.sort(key=lambda x: x[0], reverse=True)
            if scored:
                return [d for _, d in scored[: cfg.top_k]]
        except httpx.ConnectError:
            self._embed_unavailable_until = time.monotonic() + _BACKOFF_TRANSIENT
        except Exception as exc:
            print(f"[kb] embed error: {exc}")
            self._embed_unavailable_until = time.monotonic() + _BACKOFF_TRANSIENT

        # Ollama unavailable or scored nothing — return whatever keyword found.
        return kw_results


kb = KnowledgeBase()
