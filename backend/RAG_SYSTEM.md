# RAG System — Mizan Backend

The knowledge base (KB) provides the assistant with family-specific and domain-specific context that would otherwise not be present in the base LLM. This document covers how documents are stored, embedded, retrieved, and scored.

---

## Overview

Retrieval happens in `kb.py` via the `KnowledgeBase` singleton (`kb`). Every chat request first retrieves the top-k relevant documents, which are injected into the system prompt before the model sees the user's message.

Two retrieval paths exist:

| Path | When used | Network calls |
|------|-----------|--------------|
| **Hybrid** (cosine + keyword + category) | Task / planning requests | 1 embed call for query + batch embed for any un-embedded docs |
| **Keyword-only** | Plain chat, greetings, non-task messages | Zero |

---

## Document storage

Documents live in `backend/data/kb.json` as a flat JSON array. Each document has four fields:

```json
{
  "id": "uuid4",
  "category": "cleaning_kitchen",
  "content": "Kitchen cleaning tasks by level: ...",
  "embedding": [0.021, -0.043, ...]
}
```

- `category` — a short snake_case tag used for keyword boosting and admin display
- `content` — the full document text that gets embedded and retrieved
- `embedding` — cached float vector; empty `[]` until the first retrieval or explicit embed

The KB is loaded into memory at startup. CRUD operations persist immediately to disk. Embeddings are computed lazily and cached — a document is only re-embedded when its `content` changes.

---

## Seeding

On first startup (when `kb.json` is empty), documents from `knowledge_base.seed_documents` in `config.yaml` are inserted automatically. To reset the KB to seed state, delete `kb.json` and restart the backend.

Current seed categories:

| Category | Content |
|----------|---------|
| `family_profile` | Who lives here, location, energy levels |
| `home_constraints` | Tenant rules — what NOT to suggest |
| `islamic_guidance` | Prayer practice, adhkar, Quran goals |
| `task_guidelines` | Keep tasks under 20 min, small wins |
| `cleaning_philosophy` | Specific, action-verb titles; visible wins |
| `cleaning_levels` | Quick reset / regular / deep clean / organizing definitions |
| `cleaning_kitchen` | Room-specific task lists by cleaning level |
| `cleaning_living_room` | Room-specific task lists |
| `cleaning_bedroom` | Room-specific task lists |
| `cleaning_bathroom` | Room-specific task lists (ordered: toilet → sink → mirror → floor) |
| `cleaning_entryway` | Entryway + laundry area task lists |
| `cleaning_priorities` | Situation-based priority order (overwhelmed / guests / Jummah / Eid) |
| `cleaning_task_style` | Title formatting rules, duration guide, verb list |

---

## Embedding pipeline

Embeddings are generated via Ollama's `/api/embeddings` endpoint using the model configured in `embed_model` (default: `nomic-embed-text`).

### Lazy batch embedding

When `retrieve()` is called, `_embed_missing()` runs first. It finds all documents with an empty `embedding` field and embeds them **concurrently** using `asyncio.gather()`:

```python
results = await asyncio.gather(
    *(self._embed(d.content) for d in pending),
    return_exceptions=True,
)
```

`return_exceptions=True` means a single failed embed doesn't block the rest. Documents that fail are skipped and retried on the next request. The KB is saved to disk once after all successful embeddings.

### Magnitude caching

Cosine similarity requires the vector magnitude of each document. These are computed once and cached in `self._magnitudes` (a `dict[str, float]`). The cache is invalidated on `update()` and `delete()`.

### Embed unavailability

If the embed model returns HTTP 404, `self._embed_unavailable` is set to `True` and all subsequent calls skip the embed path immediately, falling back to keyword retrieval for the session.

---

## Scoring

### Hybrid score (when embeddings available)

```
score = 0.65 × cosine_similarity + 0.35 × keyword_score + category_boost
```

Only documents with `score >= rag.min_score` (default `0.25`) are returned.

#### Cosine similarity

Standard dot product over L2-normalized vectors:

```python
dot = sum(x * y for x, y in zip(q_emb, doc.embedding))
cosine = dot / (q_norm * d_norm)
```

#### Keyword score

Token-set intersection — both query and content are tokenised to remove stop words and short words before comparison:

```python
def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", text.lower())
            if w not in _STOP_WORDS and len(w) > 2}

keyword_score = len(query_tokens & content_tokens) / len(query_tokens)
```

This avoids substring false-positives (e.g. "ham" matching "Muhammad") that a naive `in haystack` check produces.

#### Category boost

If words from the category name appear in the query, the document gets a small additive boost (up to +0.20):

```python
def _category_boost(query: str, category: str) -> float:
    cat = category.lower().replace("_", " ")
    boost = sum(0.08 for word in re.findall(r"\w+", cat)
                if len(word) > 2 and word in query.lower())
    return min(boost, 0.2)
```

**Effect:** A query mentioning "bathroom" will score `cleaning_bathroom` up to +0.16 higher than `cleaning_philosophy`, even if the semantic similarity is similar. This ensures room-specific docs beat generic philosophy docs when the user names a specific room.

### Keyword-only score (fallback)

```
score = keyword_score + category_boost
```

Same token intersection, same category boost, no embeddings. Used when:
- The message is classified as non-task (greeting, chitchat, plain question)
- The Ollama embed endpoint is unavailable
- `rag.keyword_fallback` is `true` and hybrid retrieval returns nothing

---

## Configuration

All tunables live in `backend/data/config.yaml` under the `rag:` key:

```yaml
rag:
  top_k: 5              # max documents returned per query
  min_score: 0.25       # minimum hybrid score; lower = more permissive
  keyword_fallback: true # whether to fall back to keyword retrieval
```

And under `ollama:`:

```yaml
ollama:
  embed_model: "nomic-embed-text"
  timeout_seconds: 90
```

---

## Knowledge base API

The KB is exposed through REST endpoints in `main.py`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/knowledge` | List all documents (`?category=x` to filter) |
| `POST` | `/v1/knowledge` | Add a document `{ category, content }` |
| `GET` | `/v1/knowledge/:id` | Get a single document |
| `PUT` | `/v1/knowledge/:id` | Update category or content (clears embedding on content change) |
| `DELETE` | `/v1/knowledge/:id` | Remove a document |

When you add or update a document via the API, its embedding is computed on the next retrieval request. There is no explicit "re-embed" endpoint — the lazy pipeline handles it automatically.

---

## Adding new knowledge

To extend what the assistant knows (e.g. a new room, a new topic, cultural context):

**Option 1 — via API:**
```bash
curl -X POST http://localhost:8000/v1/knowledge \
  -H "Content-Type: application/json" \
  -d '{"category": "cleaning_office", "content": "Office cleaning tasks: ..."}'
```

**Option 2 — via config.yaml seed:**

Add an entry under `knowledge_base.seed_documents`. This only runs when `kb.json` is empty, so you need to delete `kb.json` and restart to re-seed.

**Option 3 — via Admin UI:**

The admin panel in the dashboard has a Knowledge Base section for adding and managing documents without touching the API directly.

---

## Tuning notes

- **`min_score` too high** — relevant documents are filtered out, model gives generic responses. Lower it if the assistant seems unaware of room-specific or family-specific context.
- **`min_score` too low** — noise documents are injected, confusing the model. Raise it if the assistant includes irrelevant context or contradicts itself.
- **`top_k` too high** — the prompt grows, Ollama's context fills up, generation slows. Keep at 5 unless documents are very short.
- **Category boost** — the +0.08 per matching word and +0.20 cap were tuned for the current category naming scheme. If you add categories with long multi-word names (e.g. `deep_cleaning_high_traffic_areas`), the boost could over-fire; consider renaming to shorter categories.
- **Keyword fallback** — keep `keyword_fallback: true` unless you want the assistant to produce zero KB context when Ollama embeddings are slow or unavailable.
