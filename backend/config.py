"""Load and expose typed settings from data/config.yaml."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

CONFIG_PATH = Path(__file__).parent / "data" / "config.yaml"


# ── sub-structures ────────────────────────────────────────────────────────────

@dataclass
class ServerSettings:
    port: int = 8000
    cors_origins: list[str] = field(default_factory=lambda: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ])


@dataclass
class OllamaSettings:
    base_url: str = "http://localhost:11434"
    chat_model: str = "llama3.2:latest"
    chat_model_fast: str = "llama3.2:latest"
    embed_model: str = "nomic-embed-text"
    timeout_seconds: float = 90.0
    max_context_turns: int = 12


@dataclass
class RagSettings:
    top_k: int = 5
    min_score: float = 0.25
    keyword_fallback: bool = True


@dataclass
class MemberConfig:
    name: str
    role: str = "adult"
    too_young_for_tasks: bool = False


@dataclass
class AssistantSettings:
    name: str = "Assistant"
    persona: str = "You are a helpful assistant."
    response_format: str = "json"
    task_rules: list[str] = field(default_factory=list)
    members: list[MemberConfig] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)


@dataclass
class KBSeedDocument:
    category: str
    content: str


@dataclass
class KBSettings:
    seed_documents: list[KBSeedDocument] = field(default_factory=list)


@dataclass
class Settings:
    server: ServerSettings = field(default_factory=ServerSettings)
    ollama: OllamaSettings = field(default_factory=OllamaSettings)
    rag: RagSettings = field(default_factory=RagSettings)
    assistant: AssistantSettings = field(default_factory=AssistantSettings)
    knowledge_base: KBSettings = field(default_factory=KBSettings)


# ── loader ────────────────────────────────────────────────────────────────────

def _coerce(dc_type: type, data: Any):
    """Recursively coerce a dict into a dataclass."""
    if not isinstance(data, dict):
        return dc_type()
    hints: dict[str, Any] = dc_type.__dataclass_fields__  # type: ignore[attr-defined]
    kwargs: dict[str, Any] = {}
    for fname, fobj in hints.items():
        if fname not in data:
            continue
        raw = data[fname]
        ft = fobj.type
        # Handle list[SomeDataclass]
        if hasattr(ft, "__origin__") and ft.__origin__ is list:
            inner = ft.__args__[0]
            if hasattr(inner, "__dataclass_fields__"):
                raw = [_coerce(inner, item) for item in (raw or [])]
        elif hasattr(ft, "__dataclass_fields__"):
            raw = _coerce(ft, raw)
        kwargs[fname] = raw
    return dc_type(**kwargs)


def _load_raw() -> dict:
    if CONFIG_PATH.exists():
        return yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    return {}


def load_settings() -> Settings:
    raw = _load_raw()

    # YAML key "A" maps to assistant section (short key to avoid YAML bool parsing of "assistant")
    assistant_raw = raw.get("A") or raw.get("assistant") or {}

    members = [
        MemberConfig(
            name=m["name"],
            role=m.get("role", "adult"),
            too_young_for_tasks=m.get("too_young_for_tasks", False),
        )
        for m in (assistant_raw.get("members") or [])
    ]

    seed_docs = [
        KBSeedDocument(category=d["category"], content=d["content"])
        for d in ((raw.get("knowledge_base") or {}).get("seed_documents") or [])
    ]

    return Settings(
        server=_coerce(ServerSettings, raw.get("server") or {}),
        ollama=_coerce(OllamaSettings, raw.get("ollama") or {}),
        rag=_coerce(RagSettings, raw.get("rag") or {}),
        assistant=AssistantSettings(
            name=assistant_raw.get("name", "Assistant"),
            persona=str(assistant_raw.get("persona", "You are a helpful assistant.")).strip(),
            response_format=assistant_raw.get("response_format", "json"),
            task_rules=list(assistant_raw.get("task_rules") or []),
            members=members,
            constraints=list(assistant_raw.get("constraints") or []),
        ),
        knowledge_base=KBSettings(seed_documents=seed_docs),
    )


# Singleton — imported everywhere
settings: Settings = load_settings()
