"""Pydantic models — generic enough for any RAG application."""
from __future__ import annotations

from pydantic import BaseModel, Field


# ── Live context (application-supplied per request) ───────────────────────────

class FamilyMember(BaseModel):
    name: str


class PrayerTimes(BaseModel):
    fajr: str
    dhuhr: str
    asr: str
    maghrib: str
    isha: str


class ContextTask(BaseModel):
    title: str
    assignee: str
    completed: bool = False
    schedule: str | None = None   # "daily" | "weekly:N" | "monthly:N" | None (once)


class ContextGoal(BaseModel):
    id: str | None = None
    title: str
    assignee: str | None = None
    completed: bool = False


class CalendarEvent(BaseModel):
    title: str
    start: str
    end: str


class LiveContext(BaseModel):
    members: list[FamilyMember] = []
    prayer_times: PrayerTimes | None = None
    current_time: str | None = None   # e.g. "7:35 PM" — user's local time
    current_tasks: list[ContextTask] = []          # today's tasks (all frequencies)
    recurring_tasks: list[ContextTask] = []        # all recurring task definitions across days
    current_goals: list[ContextGoal] = []
    completed_history: list[str] = []
    calendar_events: list[CalendarEvent] = []


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    live_context: LiveContext = Field(default_factory=LiveContext)


class SuggestedTask(BaseModel):
    title: str
    assignee: str
    frequency: str = "once"   # "once" | "daily" | "weekly" | "monthly"
    day: str | None = None    # suggested day: name for weekly ("Saturday"), ordinal for monthly ("15th")
    time: str | None = None   # suggested time label, e.g. "6:00 AM" (optional)
    duration: str | None = None  # estimated duration, e.g. "5 min", "15 min", "1 hr"
    goal_id: str | None = None  # ID of a matching active goal, or null


class GoalSuggestion(BaseModel):
    title: str


class ChatResponse(BaseModel):
    message: str
    tasks: list[SuggestedTask] = []
    mode: str = "chat"         # "chat" | "tasks"
    memory_updates: list[str] = []
    goal: GoalSuggestion | None = None


# ── History ───────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str
    content: str


class HistoryResponse(BaseModel):
    messages: list[HistoryMessage]


# ── Notes ─────────────────────────────────────────────────────────────────────

class NotesResponse(BaseModel):
    notes: list[str]


# ── Knowledge Base ────────────────────────────────────────────────────────────

class KBDocument(BaseModel):
    id: str
    category: str = "general"
    content: str
    embedding: list[float] = []   # cached; omitted from API responses


class KBDocumentPublic(BaseModel):
    """KBDocument without the embedding vector (safe to send over the wire)."""
    id: str
    category: str
    content: str


class KBAddRequest(BaseModel):
    category: str = "general"
    content: str


class KBUpdateRequest(BaseModel):
    category: str | None = None
    content: str | None = None


class KBListResponse(BaseModel):
    documents: list[KBDocumentPublic]
    total: int


# ── Config (read-only export) ─────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    assistant_name: str
    chat_model: str
    embed_model: str
    response_format: str
    rag_top_k: int
    members: list[str]
