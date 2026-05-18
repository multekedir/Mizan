"""Ollama call, response parsing, and deduplication."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator

import httpx

from config import settings
from intent import (
    classify_intent,
    should_generate_tasks,
    is_birthday_without_date,
    is_calendar_request,
    is_today_request,
    is_event_plan_request,
    has_event_target_date,
    get_event_date,
    is_light_day_request,
    is_schedule_lookup,
    is_islamic_holiday_request,
    _day_label,
)
from kb import kb
from models import ChatRequest, ChatResponse, KBDocument, SuggestedTask, SuggestedEvent, GoalSuggestion
from prompt import build_system_prompt, _child_names, _birthday_date_in_notes


# ── response validation regexes ───────────────────────────────────────────────

_TIME_LABEL_RE = re.compile(r'^\d{1,2}:\d{2}\s*(AM|PM)$', re.IGNORECASE)
_DATE_LABEL_RE = re.compile(
    r'^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w+\s+\d{1,2}(\s*\(.*\))?$',
    re.IGNORECASE,
)
_PRAYER_TIME_RE = re.compile(
    r'^(after\s+(fajr|dhuhr|asr|maghrib|isha)|before\s+(sleep|isha|jum[a-z\']*)|during\s+(child\'?s?\s+)?nap)\s*(\(.*\))?$',
    re.IGNORECASE,
)


# ── parsing helpers ───────────────────────────────────────────────────────────

def _norm(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[^a-z0-9 ]", "", t)
    t = re.sub(r"\b(the|a|an|and|or|of|in|on|to|for|with)\b", "", t)
    return re.sub(r"\s+", " ", t).strip()


def _resolve_assignee(raw: str, members: list[str], idx: int) -> str:
    raw_stripped = raw.strip()
    if "both" in raw_stripped.lower() or raw_stripped.lower() in ("all", "family"):
        return "Both"
    for m in members:
        if m.lower() == raw_stripped.lower():
            return m
    for m in members:
        if m.lower() in raw.lower():
            return m
    adults = [m for m in members if m not in _child_names()]
    pool = adults if adults else members
    return pool[idx % len(pool)]


def _deduplicate(
    tasks: list[SuggestedTask],
    existing: list[str],
    history_titles: list[str],
) -> list[SuggestedTask]:
    blocked = {_norm(t) for t in existing + history_titles}
    seen: set[str] = set()
    out: list[SuggestedTask] = []
    for t in tasks:
        k = _norm(t.title)
        if not k or k in blocked or k in seen:
            continue
        seen.add(k)
        out.append(t)
    return out


def _salvage_json(text: str) -> dict | None:
    for suffix in ("]}", "}]}", "}"):
        try:
            result = json.loads(text + suffix)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            pass
    return None


_HEADER_TITLES = {"daily tasks", "weekly tasks", "monthly tasks", "once tasks", "one-time tasks"}


def _parse(
    raw: str,
    members: list[str],
) -> tuple[str, list[SuggestedTask], list[SuggestedEvent], list[str], "GoalSuggestion | None"]:
    text = raw.strip()
    if text.startswith("```"):
        inner = text.splitlines()[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()

    data: dict | None = None
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            data = result
    except json.JSONDecodeError:
        data = _salvage_json(text)

    if data is None:
        print(f"[assistant] JSON parse failed — raw ({len(raw)} chars): {raw[:200]!r}")
        return "I've put together some tasks for you. Let me know if you'd like any changes!", [], [], [], None

    message = str(data.get("message", "")).strip() or raw.strip()

    tasks: list[SuggestedTask] = []
    for i, item in enumerate(data.get("tasks") or []):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title or title.lower() in _HEADER_TITLES:
            continue
        assignee = _resolve_assignee(str(item.get("assignee", "")), members, i)
        freq = str(item.get("frequency", "once")).strip().lower()
        if freq not in ("once", "daily", "weekly", "monthly"):
            freq = "once"
        raw_day = str(item.get("day") or "").strip().lower()
        day = None if raw_day in ("", "none", "null", "n/a", "na", "-") else raw_day or None
        raw_time = str(item.get("time") or "").strip()
        if raw_time.lower() in ("", "none", "null", "n/a"):
            time = None
        elif _TIME_LABEL_RE.match(raw_time) or _DATE_LABEL_RE.match(raw_time) or _PRAYER_TIME_RE.match(raw_time):
            time = raw_time
        else:
            time = None
        raw_dur = str(item.get("duration") or "").strip()
        if raw_dur.lower() in ("", "none", "null", "n/a"):
            duration = None
        else:
            duration = re.sub(r'\bminutes?\b', 'min', raw_dur, flags=re.IGNORECASE)
            duration = re.sub(r'\bhours?\b', 'hr', duration, flags=re.IGNORECASE) or None
        raw_goal = str(item.get("goal_id") or "").strip()
        goal_id = None if raw_goal.lower() in ("", "none", "null", "n/a") else raw_goal or None
        tasks.append(SuggestedTask(
            title=title, assignee=assignee, frequency=freq,
            day=day, time=time, duration=duration, goal_id=goal_id,
        ))

    suggested_events: list[SuggestedEvent] = []
    for item in data.get("suggested_events") or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        raw_rec = str(item.get("recurrence") or "none").strip().lower()
        if raw_rec not in ("daily", "weekly", "monthly"):
            raw_rec = "none"
        suggested_events.append(SuggestedEvent(
            title=title,
            date=str(item.get("date") or "").strip() or None,
            start_time=str(item.get("start_time") or "").strip() or None,
            end_time=str(item.get("end_time") or "").strip() or None,
            recurrence=raw_rec,
        ))

    updates: list[str] = []
    for item in data.get("memory_updates") or []:
        note = str(item).strip()
        if note:
            updates.append(note)

    goal_data = data.get("goal")
    goal: GoalSuggestion | None = None
    if isinstance(goal_data, dict) and goal_data.get("title"):
        goal = GoalSuggestion(title=str(goal_data["title"]).strip())

    return message, tasks, suggested_events, updates, goal


# ── post-processing ───────────────────────────────────────────────────────────

def _postprocess_tasks(
    tasks: list[SuggestedTask],
    message: str,
    existing: list[str],
    history_titles: list[str],
    members: list[str],
    force_today: bool = False,
) -> list[SuggestedTask]:
    tasks = _deduplicate(tasks, existing, history_titles)
    is_today = force_today or is_today_request(message)
    if is_today or is_event_plan_request(message) or has_event_target_date(message):
        tasks = [t for t in tasks if t.frequency == "once"]
    if is_today:
        tasks = [
            t.model_copy(update={"time": None}) if t.time and _DATE_LABEL_RE.match(t.time) else t
            for t in tasks
        ]
    if is_event_plan_request(message) or has_event_target_date(message):
        ev = get_event_date(message)
        if ev:
            approx = is_islamic_holiday_request(message)
            label = _day_label(ev, approximate=approx)
            tasks = [
                t.model_copy(update={"time": label}) if not t.time else t
                for t in tasks
            ]
    return tasks


def _is_today_context(message: str, history: list[dict]) -> bool:
    if is_today_request(message):
        return True
    intent_now, _ = classify_intent(message)
    if intent_now == "edit_request":
        recent_user = [h["content"] for h in history[-6:] if h["role"] == "user"]
        return any(is_today_request(m) for m in recent_user[-2:])
    return False


# ── chat mode routing ─────────────────────────────────────────────────────────

class ChatMode(str, Enum):
    CHAT            = "chat"
    TASKS           = "tasks"
    CALENDAR        = "calendar"
    SCHEDULE_LOOKUP = "schedule_lookup"
    LIGHT_DAY       = "light_day"
    REMEMBER        = "remember"
    NEEDS_DATE      = "needs_date"


_FAST_MODES: frozenset[ChatMode] = frozenset({
    ChatMode.CHAT,
    ChatMode.SCHEDULE_LOOKUP,
    ChatMode.LIGHT_DAY,
    ChatMode.NEEDS_DATE,
})

_JSON_MODES: frozenset[ChatMode] = frozenset({
    ChatMode.TASKS,
    ChatMode.CALENDAR,
    ChatMode.REMEMBER,
})


def _get_chat_mode(req: ChatRequest, notes: list[str]) -> ChatMode:
    message = req.message
    if is_light_day_request(message):
        return ChatMode.LIGHT_DAY
    if is_calendar_request(message):
        return ChatMode.CALENDAR
    if is_schedule_lookup(message):
        return ChatMode.SCHEDULE_LOOKUP
    if is_birthday_without_date(message) and not _birthday_date_in_notes(notes):
        return ChatMode.NEEDS_DATE
    if classify_intent(message)[0] == "remember":
        return ChatMode.REMEMBER
    if should_generate_tasks(message):
        return ChatMode.TASKS
    return ChatMode.CHAT


# ── shared request preparation ────────────────────────────────────────────────

@dataclass(frozen=True)
class _ChatPrep:
    mode: ChatMode
    model: str
    member_list: list[str]
    messages: list[dict]
    use_json: bool

    @property
    def is_fast_mode(self) -> bool:
        return self.mode in _FAST_MODES

    @property
    def is_task_mode(self) -> bool:
        return self.mode == ChatMode.TASKS


def _build_messages(
    req: ChatRequest,
    history: list[dict],
    notes: list[str],
    kb_docs: list[KBDocument],
) -> list[dict]:
    system_prompt = build_system_prompt(req, notes, kb_docs, history)
    messages = [{"role": "system", "content": system_prompt}]
    for turn in history[-(settings.ollama.max_context_turns * 2):]:
        messages.append(turn)
    messages.append({"role": "user", "content": req.message})
    return messages


async def _prepare_chat(
    req: ChatRequest,
    history: list[dict],
    notes: list[str],
) -> _ChatPrep:
    mode = _get_chat_mode(req, notes)
    cfg = settings.ollama
    current_time = req.live_context.current_time

    if mode in _FAST_MODES:
        kb_docs = kb.retrieve_keywords(req.message, current_time)
        model = cfg.chat_model_fast
    elif mode == ChatMode.TASKS:
        # Multi-query expansion for task planning: wider retrieval net improves suggestions
        kb_docs = await kb.retrieve_expanded(req.message, current_time)
        model = cfg.chat_model
    else:
        kb_docs = await kb.retrieve(req.message, current_time)
        model = cfg.chat_model

    member_list = (
        [m.name for m in req.live_context.members]
        or [m.name for m in settings.assistant.members]
    )
    messages = _build_messages(req, history, notes, kb_docs)
    use_json = settings.assistant.response_format == "json" and mode in _JSON_MODES

    return _ChatPrep(
        mode=mode,
        model=model,
        member_list=member_list,
        messages=messages,
        use_json=use_json,
    )


# ── Ollama call layer ─────────────────────────────────────────────────────────

async def chat(
    req: ChatRequest,
    history: list[dict],
    notes: list[str],
) -> ChatResponse:
    prep = await _prepare_chat(req, history, notes)

    payload: dict = {
        "model": prep.model,
        "messages": prep.messages,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 300 if prep.is_fast_mode else 2000},
    }
    if prep.use_json:
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=settings.ollama.timeout_seconds) as client:
        resp = await client.post(f"{settings.ollama.base_url}/api/chat", json=payload)
        resp.raise_for_status()

    raw: str = resp.json().get("message", {}).get("content", "")
    if not raw.strip():
        raise ValueError("Ollama returned an empty response.")

    if prep.use_json:
        message, tasks, suggested_events, memory_updates, goal = _parse(raw, prep.member_list)
        tasks = _postprocess_tasks(
            tasks, req.message,
            existing=[t.title for t in req.live_context.current_tasks],
            history_titles=[h.title for h in req.live_context.completed_history],
            members=prep.member_list,
            force_today=_is_today_context(req.message, history),
        )
    else:
        message, tasks, suggested_events, memory_updates, goal = raw.strip(), [], [], [], None

    mode = "light_day" if is_light_day_request(req.message) else ("tasks" if tasks else "chat")
    return ChatResponse(
        message=message, tasks=tasks, suggested_events=suggested_events,
        mode=mode, memory_updates=memory_updates, goal=goal,
    )


async def chat_stream(
    req: ChatRequest,
    history: list[dict],
    notes: list[str],
) -> AsyncIterator[str]:
    """Yields SSE lines. Token events: data: {"token":"…"}  Final: data: [DONE] {full payload}"""
    prep = await _prepare_chat(req, history, notes)

    payload: dict = {
        "model": prep.model,
        "messages": prep.messages,
        "stream": True,
        "options": {"temperature": 0.2, "num_predict": 300 if prep.is_fast_mode else 2000},
    }
    if prep.use_json:
        payload["format"] = "json"

    accumulated = ""
    async with httpx.AsyncClient(timeout=settings.ollama.timeout_seconds) as client:
        async with client.stream("POST", f"{settings.ollama.base_url}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                token: str = chunk.get("message", {}).get("content", "")
                if token:
                    accumulated += token
                    yield f"data: {json.dumps({'token': token, 'is_json': prep.use_json})}\n\n"
                if chunk.get("done"):
                    break

    if prep.use_json:
        message, tasks, suggested_events, memory_updates, goal = _parse(accumulated, prep.member_list)
        tasks = _postprocess_tasks(
            tasks, req.message,
            existing=[t.title for t in req.live_context.current_tasks],
            history_titles=[h.title for h in req.live_context.completed_history],
            members=prep.member_list,
            force_today=_is_today_context(req.message, history),
        )
    else:
        message, tasks, suggested_events, memory_updates, goal = accumulated.strip(), [], [], [], None

    done_payload = {
        "message": message,
        "tasks": [t.model_dump() for t in tasks],
        "suggested_events": [e.model_dump() for e in suggested_events],
        "memory_updates": memory_updates,
        "goal": goal.model_dump() if goal else None,
        "mode": "light_day" if is_light_day_request(req.message) else ("tasks" if tasks else "chat"),
    }
    yield f"data: [DONE] {json.dumps(done_payload)}\n\n"
