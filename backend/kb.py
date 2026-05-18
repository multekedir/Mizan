"""Knowledge Base — CRUD + semantic retrieval via Ollama embeddings."""
from __future__ import annotations

import asyncio
import datetime
import json
import math
import re
import time
from pathlib import Path

import httpx

from config import settings
from models import KBDocument, KBUpdateRequest

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


def _filter_by_date(docs: list[KBDocument]) -> list[KBDocument]:
    """Remove docs outside their valid date range (valid_from / valid_until)."""
    today = datetime.date.today().isoformat()
    return [
        d for d in docs
        if (d.valid_from is None or d.valid_from <= today)
        and (d.valid_until is None or d.valid_until >= today)
    ]


def _temporal_boost(doc: KBDocument, query_words: set[str]) -> float:
    """Score boost from priority, tag overlap, and event proximity."""
    boost = doc.priority * 0.05

    if doc.tags:
        tag_words = {w for tag in doc.tags for w in re.findall(r"\w+", tag.lower())}
        boost += min(len(query_words & tag_words) * 0.04, 0.16)

    if doc.doc_kind == "event" and doc.valid_from:
        try:
            days_until = (datetime.date.fromisoformat(doc.valid_from) - datetime.date.today()).days
            if 0 <= days_until <= 7:
                boost += 0.15 * math.exp(-days_until / 7)
        except ValueError:
            pass

    return boost


def _inject_temporal_context(query: str, current_time: str | None = None) -> str:
    """Prepend the current day-of-week (and optionally time) before embedding."""
    today = datetime.date.today()
    prefix = f"[{today.strftime('%A')}, {today.isoformat()}]"
    if current_time:
        prefix += f" [{current_time}]"
    return f"{prefix} {query}"


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def _mmr_select(
    q_emb: list[float],
    candidates: list[tuple[float, KBDocument]],
    lambda_val: float = 0.75,
    top_k: int = 5,
) -> list[KBDocument]:
    """Maximal Marginal Relevance: pick diverse top-k from pre-scored candidates."""
    if not candidates:
        return []
    selected: list[KBDocument] = []
    remaining = list(candidates)
    for _ in range(min(top_k, len(candidates))):
        if not remaining:
            break
        best_idx, best_mmr = 0, float("-inf")
        for i, (score, doc) in enumerate(remaining):
            if not selected:
                mmr = score
            else:
                max_sim = max(_cosine_sim(doc.embedding, s.embedding) for s in selected)
                mmr = lambda_val * score - (1 - lambda_val) * max_sim
            if mmr > best_mmr:
                best_mmr = mmr
                best_idx = i
        selected.append(remaining[best_idx][1])
        remaining.pop(best_idx)
    return selected


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

    def update(self, doc_id: str, req: "KBUpdateRequest") -> KBDocument | None:
        doc = self._docs.get(doc_id)
        if doc is None:
            return None
        if req.category is not None:
            doc.category = req.category
        if req.doc_kind is not None:
            doc.doc_kind = req.doc_kind
        if req.tags is not None:
            doc.tags = req.tags
        if req.valid_from is not None:
            doc.valid_from = req.valid_from
        if req.valid_until is not None:
            doc.valid_until = req.valid_until
        if req.priority is not None:
            doc.priority = req.priority
        if req.content is not None:
            doc.content = req.content
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

    def retrieve_keywords(self, query: str, current_time: str | None = None) -> list[KBDocument]:
        """Synchronous keyword-only retrieval — zero network calls."""
        cfg = settings.rag
        docs = _filter_by_date(list(self._docs.values()))
        if not docs:
            return []
        query_words = _tokens(query)
        scored = [
            (round(
                (len(query_words & self._doc_tokens(d)) / len(query_words) if query_words else 0.0)
                + _category_boost_from_tokens(query_words, d.category)
                + _temporal_boost(d, query_words),
                4,
            ), d)
            for d in docs
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [d for score, d in scored[: cfg.top_k] if score > 0]

    async def retrieve(self, query: str, current_time: str | None = None) -> list[KBDocument]:
        """Keyword-first retrieval; upgrades to hybrid (0.65 cosine + 0.35 keyword) with MMR when needed."""
        cfg = settings.rag
        docs = _filter_by_date(list(self._docs.values()))
        if not docs:
            return []

        # Always run keyword retrieval first — zero network calls.
        # If it returns a full top_k, that's good enough; skip Ollama entirely.
        kw_results = self.retrieve_keywords(query, current_time)
        if len(kw_results) >= cfg.top_k or time.monotonic() < self._embed_unavailable_until:
            return kw_results

        # Keyword alone didn't fill top_k — upgrade to hybrid.
        # Inject day-of-week context into the query embedding for temporal relevance.
        augmented = _inject_temporal_context(query, current_time)
        try:
            await self._embed_missing()
            q_emb = await self._embed(augmented)
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
                hybrid = (
                    0.65 * cosine
                    + 0.35 * kw
                    + _category_boost_from_tokens(query_words, doc.category)
                    + _temporal_boost(doc, query_words)
                )
                if hybrid >= cfg.min_score:
                    scored.append((hybrid, doc))
            scored.sort(key=lambda x: x[0], reverse=True)
            if scored:
                return _mmr_select(q_emb, scored, lambda_val=0.75, top_k=cfg.top_k)
        except httpx.ConnectError:
            self._embed_unavailable_until = time.monotonic() + _BACKOFF_TRANSIENT
        except Exception as exc:
            print(f"[kb] embed error: {exc}")
            self._embed_unavailable_until = time.monotonic() + _BACKOFF_TRANSIENT

        # Ollama unavailable or scored nothing — return whatever keyword found.
        return kw_results

    async def _expand_query(self, query: str) -> list[str]:
        """Generate 3 rephrasings of the query using the fast LLM for better recall."""
        prompt = (
            "Rephrase the following question 3 different ways to search a family "
            "home-management knowledge base. Cover different angles: chores, Islamic "
            "practice, food, parenting, energy level. Output exactly 3 lines, no "
            "numbering, no explanation.\n\nQuestion: " + query
        )
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{settings.ollama.base_url}/api/chat",
                    json={
                        "model": settings.ollama.chat_model_fast,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False,
                        "options": {"temperature": 0.4, "num_predict": 120},
                    },
                )
                resp.raise_for_status()
            lines = [l.strip() for l in resp.json()["message"]["content"].splitlines() if l.strip()]
            return [query] + lines[:3]
        except Exception:
            return [query]

    async def retrieve_expanded(self, query: str, current_time: str | None = None) -> list[KBDocument]:
        """Multi-query expansion: retrieve for original + rephrasings, union results."""
        queries = await self._expand_query(query)
        seen_ids: set[str] = set()
        results: list[KBDocument] = []
        for q in queries:
            for doc in await self.retrieve(q, current_time):
                if doc.id not in seen_ids:
                    seen_ids.add(doc.id)
                    results.append(doc)
        return results[: settings.rag.top_k * 2]


kb = KnowledgeBase()
