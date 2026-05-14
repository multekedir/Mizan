"""System prompt construction."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import Enum

from config import settings
from intent import (
    INTENT_PATTERNS,
    classify_intent,
    get_event_date,
    is_birthday_without_date,
    is_calendar_request,
    is_event_plan_request,
    is_single_task_creation,
    is_today_request,
    is_tomorrow_request,
    is_light_day_request,
    _event_honoree,
    _day_label,
    _SPECIFIC_DATE_RE,
    _SCHEDULE_QUERY_RE,
    is_schedule_lookup,
    is_islamic_holiday_request,
    should_generate_tasks,
)
from models import ChatRequest, KBDocument


# ── regex constants ───────────────────────────────────────────────────────────

_DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

_CLEANING_RE = re.compile(
    r'\b(clean|tidy|organi[sz]|declutter|deep.?clean|scrub|wipe|vacuum|mop|dust|'
    r'jummah|juma|jumuah|sink|dishes|laundry|trash|garbage|'
    r'kitchen|bathroom|bedroom|living\s+room|house|apartment|fridge|'
    r'counter|floor|table|mess|dirty|dusty|cluttered|'
    r'guests?|company|visitors?)',
    re.IGNORECASE,
)
_MULTI_ROOM_RE = re.compile(
    r'\b(two|both|all|multiple|every)\s+(bedroom|room|bathroom|area)s?\b'
    r'|\b(bedroom|room|bathroom)\s*(1|one|#1)\b.{0,60}\b(bedroom|room|bathroom)\s*(2|two|#2)\b',
    re.IGNORECASE,
)
_JUMMAH_RE = re.compile(r'\b(jummah|juma|jumuah|friday\s+prayer)\b', re.IGNORECASE)
_WANTS_TIME_RE = re.compile(r'\b(time|schedule|when|hour|am|pm|routine)\b', re.IGNORECASE)
_BROAD_RE = re.compile(
    r'\b(weekly plan|routine|recurring|schedule|system|keep.*clean|'
    r'organiz.*house|house schedule|cleaning schedule)\b',
    re.IGNORECASE,
)
_EXPLICIT_TASKS_RE = re.compile(
    r'\b(create|add|give me|suggest|make)\s+(some\s+|a\s+few\s+)?tasks?\b',
    re.IGNORECASE,
)
_ROOM_RE = re.compile(
    r'\b(kitchen|bathroom|bedroom|living\s+room|entryway|pantry|laundry|garage|office)\b',
    re.IGNORECASE,
)
_GOAL_STATEMENT_RE = INTENT_PATTERNS["goal_statement"]


# ── enums ─────────────────────────────────────────────────────────────────────

class JummahMode(str, Enum):
    NONE             = "none"
    TODAY_PRE_DHUHR  = "today_pre_dhuhr"
    TODAY_POST_DHUHR = "today_post_dhuhr"
    UPCOMING_FRIDAY  = "upcoming_friday"


class ResponseMode(str, Enum):
    NEEDS_DATE      = "needs_date"
    CALENDAR_EVENT  = "calendar_event"
    SCHEDULE_LOOKUP = "schedule_lookup"
    LIGHT_DAY       = "light_day"
    CHAT            = "chat"
    GOAL_PLAN       = "goal_plan"
    EVENT_PLAN      = "event_plan"
    TODAY_TASKS     = "today_tasks"
    TOMORROW_TASKS  = "tomorrow_tasks"
    RECURRING_PLAN  = "recurring_plan"
    CLEANING_TASKS  = "cleaning_tasks"
    GENERAL_TASKS   = "general_tasks"


class CleaningLevel(str, Enum):
    QUICK_RESET   = "quick_reset"
    REGULAR_CLEAN = "regular_clean"
    DEEP_CLEAN    = "deep_clean"
    ORGANIZING    = "organizing"


# ── small objects ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CleaningPlanSpec:
    level: CleaningLevel
    task_min: int
    task_max: int
    room: str | None
    multi_room: bool


@dataclass(frozen=True)
class EventDateInfo:
    ev_date: date | None
    days_away: int
    ev_label: str
    day_slots: list[str]
    day_context: str


@dataclass(frozen=True)
class PromptContext:
    req: ChatRequest
    notes: list[str]
    kb_docs: list[KBDocument]
    history: list[dict] | None

    today: date
    today_str: str

    member_list: list[str]
    assignable: list[str]

    needs_birthday_date: bool
    schedule_lookup: bool
    is_task_request: bool

    today_req: bool
    is_cleaning: bool
    multi_room: bool

    is_friday: bool
    mentions_jummah: bool
    before_dhuhr: bool
    jummah_mode: JummahMode

    is_goal_statement: bool
    is_cal_request: bool
    is_schedule_query: bool

    event_plan: bool
    single_task: bool
    wants_time: bool
    is_broad: bool
    tomorrow_req: bool

    cleaning_spec: CleaningPlanSpec | None

    @property
    def response_mode(self) -> ResponseMode:
        return _get_response_mode(self)


# ── detection helpers ─────────────────────────────────────────────────────────

def _get_response_mode(pc: PromptContext) -> ResponseMode:
    if pc.needs_birthday_date:
        return ResponseMode.NEEDS_DATE
    if pc.is_cal_request:
        return ResponseMode.CALENDAR_EVENT
    if pc.schedule_lookup:
        return ResponseMode.SCHEDULE_LOOKUP
    if is_light_day_request(pc.req.message):
        return ResponseMode.LIGHT_DAY
    if not pc.is_task_request:
        return ResponseMode.CHAT
    if pc.is_goal_statement:
        return ResponseMode.GOAL_PLAN
    if pc.event_plan:
        return ResponseMode.EVENT_PLAN
    if pc.tomorrow_req:
        return ResponseMode.TOMORROW_TASKS
    if pc.today_req:
        return ResponseMode.TODAY_TASKS
    if pc.is_broad:
        return ResponseMode.RECURRING_PLAN
    if pc.is_cleaning:
        return ResponseMode.CLEANING_TASKS
    return ResponseMode.GENERAL_TASKS


def _next_friday(today: date) -> date:
    days = (4 - today.weekday()) % 7
    return today + timedelta(days=days or 7)


def _jummah_mode(
    *,
    today: date,
    mentions_jummah: bool,
    before_dhuhr: bool,
    is_task_request: bool,
) -> JummahMode:
    if not is_task_request:
        return JummahMode.NONE
    is_friday = today.weekday() == 4
    if is_friday and before_dhuhr and mentions_jummah:
        return JummahMode.TODAY_PRE_DHUHR
    if is_friday and not before_dhuhr:
        return JummahMode.TODAY_POST_DHUHR if mentions_jummah else JummahMode.NONE
    if mentions_jummah:
        return JummahMode.UPCOMING_FRIDAY
    return JummahMode.NONE


_CLEANING_TASK_COUNTS: dict[CleaningLevel, tuple[int, int]] = {
    CleaningLevel.QUICK_RESET:   (5, 8),
    CleaningLevel.REGULAR_CLEAN: (8, 12),
    CleaningLevel.DEEP_CLEAN:    (10, 16),
    CleaningLevel.ORGANIZING:    (6, 10),
}


def _detect_cleaning_level(message: str) -> CleaningLevel:
    if re.search(r'\b(quick|tidy\s*up|reset|light|fast|presentable)\b', message, re.IGNORECASE):
        return CleaningLevel.QUICK_RESET
    if re.search(r'\bdeep.?clean\b', message, re.IGNORECASE):
        return CleaningLevel.DEEP_CLEAN
    if re.search(r'\b(organi[sz]|sort|declutter)\b', message, re.IGNORECASE):
        return CleaningLevel.ORGANIZING
    return CleaningLevel.REGULAR_CLEAN


def _cleaning_plan_spec(message: str, multi_room: bool) -> CleaningPlanSpec:
    level = _detect_cleaning_level(message)
    task_min, task_max = _CLEANING_TASK_COUNTS[level]
    room_match = _ROOM_RE.search(message)
    return CleaningPlanSpec(
        level=level,
        task_min=task_min,
        task_max=task_max,
        room=room_match.group(0) if room_match else None,
        multi_room=multi_room,
    )


def _event_date_info(pc: PromptContext) -> EventDateInfo:
    ev_date = get_event_date(pc.req.message)
    if ev_date:
        days_away = (ev_date - pc.today).days
        approx    = is_islamic_holiday_request(pc.req.message)
        ev_label  = _day_label(ev_date, approximate=approx)
        day_slots = [_day_label(pc.today + timedelta(days=i)) for i in range(min(days_away + 1, 8))]
        day_sched = "\n".join(
            f"  - \"{s}\"{'  ← event day' if s == ev_label else ''}" for s in day_slots
        )
        day_context = (
            f"TODAY is {pc.today_str}. Event is on {ev_label} — {days_away} day(s) away.\n"
            f"Spread tasks across these days (copy the label exactly into the 'time' field):\n"
            f"{day_sched}"
        )
    else:
        days_away   = 0
        ev_label    = pc.today_str
        day_slots   = [pc.today_str]
        day_context = f"TODAY is {pc.today_str}. Spread tasks across the days leading up to and including the event."
    return EventDateInfo(
        ev_date=ev_date,
        days_away=days_away,
        ev_label=ev_label,
        day_slots=day_slots,
        day_context=day_context,
    )


# ── utility functions ─────────────────────────────────────────────────────────

def _format_calendar_ts(s: str) -> str:
    if not s:
        return s
    try:
        if "T" in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.strftime("%a %b %d, %Y %I:%M %p")
    except (ValueError, OSError, TypeError):
        pass
    return s


def _birthday_date_in_notes(notes: list[str]) -> bool:
    for note in notes:
        if _SPECIFIC_DATE_RE.search(note) and re.search(
            r'\b(birthday|anniversary|bday)\b', note, re.IGNORECASE
        ):
            return True
    return False


def _child_names() -> set[str]:
    return {m.name for m in settings.assistant.members if m.too_young_for_tasks}


def _detect_self(message: str, notes: list[str], members: list[str]) -> str | None:
    combined = message + " " + " ".join(notes[-5:])
    for m in members:
        if re.search(rf"\bi'?m {re.escape(m)}\b|\bi am {re.escape(m)}\b", combined, re.IGNORECASE):
            return m
    return None


def _format_schedule(schedule: str | None) -> str:
    if not schedule or schedule == "daily":
        return "daily"
    if schedule.startswith("weekly:"):
        try:
            return f"weekly on {_DOW[int(schedule[7:])]}"
        except (ValueError, IndexError):
            return "weekly"
    if schedule.startswith("weekly2:"):
        parts = schedule.split(":")
        try:
            days = " & ".join(_DOW[int(p)] for p in parts[1:] if p)
            return f"twice weekly ({days})"
        except (ValueError, IndexError):
            return "twice weekly"
    if schedule.startswith("monthly:"):
        return f"monthly on the {schedule[8:]}th"
    if schedule.startswith("interval:"):
        parts = schedule.split(":")
        if len(parts) == 3:
            _, unit, n = parts
            return f"every {n} {unit}"
    return schedule


# ── time / prayer utilities ───────────────────────────────────────────────────

def _parse_time_str(s: str) -> datetime | None:
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            continue
    return None


def _mins_between(a: datetime, b: datetime) -> int:
    return int((b - a).total_seconds() / 60)


def _is_before_dhuhr(ctx) -> bool:
    now = _parse_time_str(ctx.current_time) if ctx.current_time else None
    if now is None:
        return True
    pt = ctx.prayer_times
    dhuhr_t = _parse_time_str(pt.dhuhr) if pt else _parse_time_str("12:30 PM")
    return dhuhr_t is None or now < dhuhr_t


def _future_blocks(ctx, today: date) -> list[str]:
    pt = ctx.prayer_times
    now = _parse_time_str(ctx.current_time) if ctx.current_time else None
    is_friday = today.weekday() == 4

    def _after(time_str: str | None) -> bool:
        if now is None or time_str is None:
            return True
        t = _parse_time_str(time_str)
        return t is None or t > now

    blocks: list[str] = []
    if pt:
        dhuhr_t = _parse_time_str(pt.dhuhr)
        before_dhuhr = now is None or dhuhr_t is None or now < dhuhr_t
        if is_friday:
            if before_dhuhr:
                blocks.append("Before Jumu'ah")
            if _after(pt.asr):
                blocks.append("After Dhuhr")
        else:
            if _after(pt.fajr):
                blocks.append("After Fajr")
            if _after(pt.asr):
                blocks.append("After Dhuhr")
        if _after(pt.asr):
            blocks.append("After Asr")
        if _after(pt.maghrib):
            blocks.append("After Maghrib")
        if _after(pt.isha):
            blocks.append("After Isha")
    else:
        _APPROX: dict[str, str] = {
            "After Fajr": "6:30 AM", "Before Jumu'ah": "11:30 AM",
            "After Dhuhr": "1:00 PM", "After Asr": "4:30 PM",
            "After Maghrib": "7:30 PM", "After Isha": "9:30 PM",
        }
        if is_friday:
            candidates = (
                ["Before Jumu'ah", "After Dhuhr", "After Asr", "After Maghrib", "After Isha"]
                if _after(_APPROX["Before Jumu'ah"])
                else ["After Dhuhr", "After Asr", "After Maghrib", "After Isha"]
            )
        else:
            candidates = ["After Fajr", "After Dhuhr", "After Asr", "After Maghrib", "After Isha"]
        blocks = [b for b in candidates if _after(_APPROX.get(b))]
    blocks.append("Before Sleep")
    return blocks


def _prayer_window_context(current_time_str: str, pt) -> str:
    now = _parse_time_str(current_time_str)
    if now is None or pt is None:
        return ""
    prayers = [
        ("Fajr",    _parse_time_str(pt.fajr)),
        ("Dhuhr",   _parse_time_str(pt.dhuhr)),
        ("Asr",     _parse_time_str(pt.asr)),
        ("Maghrib", _parse_time_str(pt.maghrib)),
        ("Isha",    _parse_time_str(pt.isha)),
    ]
    prayers = [(n, t) for n, t in prayers if t is not None]
    upcoming = [(n, t) for n, t in prayers if t > now]
    passed   = [(n, t) for n, t in prayers if t <= now]
    parts: list[str] = [f"Current time: {current_time_str}."]
    if passed:
        last_name, last_time = passed[-1]
        mins_since = _mins_between(last_time, now)
        if mins_since <= 90:
            parts.append(
                f"{last_name} was {mins_since} minutes ago "
                f"({last_time.strftime('%-I:%M %p')}) — a good time for post-prayer adhkar."
            )
    if upcoming:
        next_name, next_time = upcoming[0]
        mins = _mins_between(now, next_time)
        if mins > 90:
            hrs = mins // 60
            parts.append(f"Next prayer: {next_name} in {hrs}h {mins % 60}m ({next_time.strftime('%-I:%M %p')}).")
        else:
            parts.append(f"Next prayer: {next_name} in {mins} minutes ({next_time.strftime('%-I:%M %p')}).")
        if mins <= 30:
            parts.append(
                f"IMPORTANT: Only {mins} minutes until {next_name} — "
                f"avoid starting anything that takes more than {mins - 5} minutes."
            )
        if len(upcoming) > 1:
            after_name, after_time = upcoming[1]
            parts.append(f"After that: {after_name} at {after_time.strftime('%-I:%M %p')}.")
    elif passed:
        last_name, last_time = passed[-1]
        parts.append(
            f"All prayers done for today ({last_name} at {last_time.strftime('%-I:%M %p')}). "
            "Wind-down tasks only."
        )
    return " ".join(parts)


def _time_blocking_lines(ctx, today: "date | None" = None) -> list[str]:
    child_names = _child_names()
    pt = ctx.prayer_times
    now = _parse_time_str(ctx.current_time) if ctx.current_time else None
    is_friday = today is not None and today.weekday() == 4

    def _future(time_str: str | None) -> bool:
        if now is None or time_str is None:
            return True
        t = _parse_time_str(time_str)
        return t is None or t > now

    out: list[str] = ["TIME BLOCKS — assign each task to one of these UPCOMING blocks only (do not use past blocks):"]
    if pt:
        dhuhr_t = _parse_time_str(pt.dhuhr)
        before_dhuhr = now is None or dhuhr_t is None or now < dhuhr_t
        if is_friday:
            if before_dhuhr:
                out.append(f'  "Before Jumu\'ah" (before {pt.dhuhr}) — Ghusl/shower, prep tasks, errands, cleaning BEFORE Friday prayer')
            if _future(pt.asr):
                out.append(f'  "After Dhuhr" ({pt.dhuhr}) — After Jumu\'ah: lighter tasks, rest, family time (NOT heavy cleaning)')
        else:
            if _future(pt.fajr):
                out.append(f'  "After Fajr"    ({pt.fajr})    — Quran, quiet morning habits')
            if _future(pt.dhuhr):
                out.append(f'  "After Dhuhr"   ({pt.dhuhr})   — Errands, home tasks, midday chores')
        if _future(pt.asr):
            out.append(f'  "After Asr"     ({pt.asr})     — Active tasks, exercise, outdoor errands')
        if _future(pt.maghrib):
            out.append(f'  "After Maghrib" ({pt.maghrib}) — Family time, lighter evening tasks')
        if _future(pt.isha):
            out.append(f'  "Before Isha"   ({pt.isha})    — Quiet prep before night prayer')
            out.append(f'  "After Isha"    ({pt.isha})    — Evening routine, wind-down')
    else:
        if is_friday:
            if _is_before_dhuhr(ctx):
                out.append('  "Before Jumu\'ah" — Tasks before Friday prayer (ghusl, prep, errands)')
            _approx_asr = _parse_time_str("4:00 PM")
            if now is None or _approx_asr is None or now < _approx_asr:
                out.append('  "After Dhuhr" — After Jumu\'ah: lighter tasks, rest, family time')
        else:
            out.append('  "After Fajr" | "After Dhuhr" — Morning / midday tasks')
        out += [
            '  "After Asr" — Afternoon tasks',
            '  "After Maghrib" — Evening tasks',
            '  "After Isha" — Night routine',
        ]
    out.append('  "Before Sleep" — Night prep, tomorrow\'s layout')

    if child_names:
        child_list = ', '.join(sorted(child_names))
        morning_nap   = _parse_time_str("10:00 AM")
        afternoon_nap = _parse_time_str("2:00 PM")
        nap_end       = _parse_time_str("3:30 PM")
        if now is None or (morning_nap and now < morning_nap):
            upcoming_nap = "~10 AM or ~2 PM"
        elif afternoon_nap and now < afternoon_nap:
            upcoming_nap = "~2 PM"
        elif nap_end and now < nap_end:
            upcoming_nap = "~2 PM"
        else:
            upcoming_nap = None
        if upcoming_nap:
            out += [
                f'  "During Nap" ({upcoming_nap}, while {child_list} sleeps) — USE THIS for quiet solo tasks',
                f"BABY-AWARE ({child_list}): Nap time is a productive window — fill it (folding laundry, meal prep, online errands, reading).",
                f"Include at least 1 family/child activity (gentle play, reading, stroller walk) assigned to Both.",
            ]

    out += [
        "Use MULTIPLE different blocks. Do NOT stack all tasks into one block.",
        "LOAD CHECK: If total duration exceeds ~11 hours, trim and note it in 'message'.",
        "",
    ]
    return out


def _jummah_awareness_lines(today: date, pt, mode: JummahMode) -> list[str]:
    dhuhr_str = pt.dhuhr if pt else "~12:30 PM"

    if mode == JummahMode.TODAY_PRE_DHUHR:
        return [
            "## JUMU'AH FRIDAY RULES — TODAY BEFORE DHUHR",
            f"Today is Friday. Jumu'ah prayer is at Dhuhr time ({dhuhr_str}).",
            "Use 'Before Jumu'ah' for ghusl, clean clothes, mosque prep, Surah Al-Kahf, salawat, and heavier prep.",
            "Use 'After Dhuhr' only for post-Jumu'ah lighter tasks, rest, family time, or simple cleanup.",
            "ALWAYS include these tasks (frequency='once', time='Before Jumu\\'ah'):",
            "  • 'Ghusl (shower) for Jumu\\'ah' — assignee: Both",
            "  • 'Wear clean Friday clothes' — assignee: Both",
            "  • 'Head to the mosque for Jumu\\'ah' — assignee: Dad",
            "- Mention Jumu'ah warmly in 'message' (e.g. 'Jumu'ah Mubarak! Here is your Friday plan.').",
            "",
        ]

    if mode == JummahMode.TODAY_POST_DHUHR:
        return [
            "## JUMU'AH FRIDAY RULES — TODAY AFTER DHUHR",
            f"Today is Friday and Jumu'ah/Dhuhr time ({dhuhr_str}) has already passed.",
            "Do NOT schedule pre-Jumu'ah tasks like ghusl, getting dressed, or heading to the mosque.",
            "Use lighter post-Jumu'ah tasks only: family time, rest, simple cleanup, gratitude, salawat, or evening prep.",
            "",
        ]

    if mode == JummahMode.UPCOMING_FRIDAY:
        next_fri = _next_friday(today)
        return [
            "## JUMU'AH PREP — UPCOMING FRIDAY",
            f"The user mentioned Jumu'ah, but today is not Friday. The upcoming Friday is {next_fri.strftime('%A, %B %-d')}.",
            "Do NOT say today is Friday.",
            "Plan prep tasks leading up to Friday: choose clean clothes, tidy prayer area, plan mosque timing, "
            "prepare a simple meal, read or listen to Surah Al-Kahf, send salawat, and make dua.",
            "",
        ]

    return []


# ── context builder ───────────────────────────────────────────────────────────

def _build_context(
    req: ChatRequest,
    notes: list[str],
    kb_docs: list[KBDocument],
    history: list[dict] | None,
) -> PromptContext:
    cfg = settings.assistant
    ctx = req.live_context
    member_list = [m.name for m in ctx.members] or [m.name for m in cfg.members]
    assignable = [n for n in member_list if n not in _child_names()]

    today = date.today()
    today_str = today.strftime("%A, %B %-d, %Y")
    is_friday = today.weekday() == 4
    before_dhuhr = _is_before_dhuhr(ctx)

    needs_birthday_date = is_birthday_without_date(req.message) and not _birthday_date_in_notes(notes)
    is_task_request = should_generate_tasks(req.message) and not needs_birthday_date

    today_req = is_today_request(req.message)
    is_cleaning = bool(_CLEANING_RE.search(req.message))
    multi_room = bool(_MULTI_ROOM_RE.search(req.message))
    mentions_jummah = bool(_JUMMAH_RE.search(req.message))

    if history:
        intent_now, _ = classify_intent(req.message)
        if intent_now == "edit_request":
            recent_user = [h["content"] for h in history[-6:] if h["role"] == "user"][-2:]
            if not today_req:
                today_req = any(is_today_request(m) for m in recent_user)
            if not is_cleaning:
                is_cleaning = any(_CLEANING_RE.search(m) for m in recent_user)
            if not multi_room and is_cleaning:
                multi_room = any(_MULTI_ROOM_RE.search(m) for m in recent_user)
            if not mentions_jummah:
                mentions_jummah = any(_JUMMAH_RE.search(m) for m in recent_user)

    is_goal_statement = bool(_GOAL_STATEMENT_RE.search(req.message))
    is_cal_request = is_calendar_request(req.message)
    schedule_lookup = is_schedule_lookup(req.message)
    is_schedule_query = bool(_SCHEDULE_QUERY_RE.search(req.message)) or schedule_lookup

    event_plan = is_event_plan_request(req.message) and not needs_birthday_date
    tomorrow_req = (
        is_tomorrow_request(req.message)
        and is_task_request
        and not event_plan
        and not today_req
    )
    single_task = is_single_task_creation(req.message)
    wants_time = bool(_WANTS_TIME_RE.search(req.message))
    is_broad = (
        not today_req and not event_plan and not single_task
        and not (is_cleaning and bool(_EXPLICIT_TASKS_RE.search(req.message)))
        and bool(_BROAD_RE.search(req.message))
    )
    cleaning_spec = _cleaning_plan_spec(req.message, multi_room) if is_cleaning else None
    jm = _jummah_mode(
        today=today,
        mentions_jummah=mentions_jummah,
        before_dhuhr=before_dhuhr,
        is_task_request=is_task_request,
    )

    return PromptContext(
        req=req,
        notes=notes,
        kb_docs=kb_docs,
        history=history,
        today=today,
        today_str=today_str,
        member_list=member_list,
        assignable=assignable,
        needs_birthday_date=needs_birthday_date,
        schedule_lookup=schedule_lookup,
        is_task_request=is_task_request,
        today_req=today_req,
        is_cleaning=is_cleaning,
        multi_room=multi_room,
        is_friday=is_friday,
        mentions_jummah=mentions_jummah,
        before_dhuhr=before_dhuhr,
        jummah_mode=jm,
        is_goal_statement=is_goal_statement,
        is_cal_request=is_cal_request,
        is_schedule_query=is_schedule_query,
        event_plan=event_plan,
        tomorrow_req=tomorrow_req,
        single_task=single_task,
        wants_time=wants_time,
        is_broad=is_broad,
        cleaning_spec=cleaning_spec,
    )


# ── prompt section builders ───────────────────────────────────────────────────

def _append_header(lines: list[str], pc: PromptContext) -> None:
    cfg = settings.assistant
    lines += [
        f"You are '{cfg.name}' — {cfg.persona}",
        f"TODAY IS {pc.today_str}.",
        "",
        "CORE RULE: Generate tasks whenever the user asks for tasks, a plan, suggestions, "
        "OR expresses intent to do something "
        "(e.g. 'I want to clean', 'I'd like to organise', 'help me deep clean'). "
        "Only skip tasks for pure greetings, introductions, feelings, or questions about you — "
        "respond warmly in 1–2 sentences only.",
        "",
    ]


def _append_constraints(lines: list[str], pc: PromptContext) -> None:
    cfg = settings.assistant
    if cfg.constraints:
        lines.append("NEVER suggest any of the following:")
        for c in cfg.constraints:
            lines.append(f"- {c}")
        lines.append("")


def _append_prayer_times(lines: list[str], pc: PromptContext) -> None:
    ctx = pc.req.live_context
    if not ctx.prayer_times:
        return
    pt = ctx.prayer_times
    lines += [
        "## TODAY'S PRAYER TIMES",
        f"Fajr: {pt.fajr} | Dhuhr: {pt.dhuhr} | Asr: {pt.asr} | Maghrib: {pt.maghrib} | Isha: {pt.isha}",
        "Avoid heavy tasks right before prayer times.",
    ]
    if ctx.current_time:
        window = _prayer_window_context(ctx.current_time, pt)
        if window:
            lines.append(window)
            lines.append("Tailor all suggested tasks to fit the available time before the next prayer.")
    lines.append("")


def _append_context_sections(lines: list[str], pc: PromptContext) -> None:
    """Jumu'ah rules, KB, notes, calendar, goals, recurring tasks, pending, history."""
    ctx = pc.req.live_context

    if pc.jummah_mode != JummahMode.NONE:
        lines += _jummah_awareness_lines(pc.today, ctx.prayer_times, pc.jummah_mode)

    if pc.kb_docs:
        lines.append("## KNOWLEDGE BASE")
        for doc in pc.kb_docs:
            lines.append(f"[{doc.category}] {doc.content.strip()}")
        lines.append("")

    if pc.notes:
        lines.append("## REMEMBERED NOTES (Always respect these)")
        for note in pc.notes[-10:]:
            lines.append(f"• {note}")
        lines.append("")

    if ctx.calendar_events:
        lines.append("## UPCOMING CALENDAR EVENTS (already in their Google Calendar)")
        for ev in ctx.calendar_events:
            lines.append(f"• {ev.title}: {_format_calendar_ts(ev.start)} → {_format_calendar_ts(ev.end)}")
        if pc.is_schedule_query:
            event_list = ", ".join(
                f"{ev.title} at {_format_calendar_ts(ev.start)}" for ev in ctx.calendar_events
            )
            lines.append(
                f"CRITICAL: The user is asking about their schedule. "
                f"Your 'message' field MUST mention these calendar appointments: {event_list}. "
                f"Do NOT omit them. Start the message with the calendar events, then mention tasks."
            )
        else:
            lines.append(
                "IMPORTANT: When the user asks about their schedule or what they have to do on a specific day, "
                "you MUST mention any calendar events on that day. Do not ignore these events."
            )
        lines.append("")

    active_goals = [g for g in ctx.current_goals if not g.completed and g.id]
    if active_goals:
        lines.append("## ACTIVE GOALS (Link tasks to goals using goal_id)")
        for g in active_goals:
            lines.append(f'• "{g.id}" — {g.title}')
        lines.append(
            "When a task clearly supports one of these goals, set goal_id to that goal's exact ID string. "
            "If no goal fits, set goal_id to null. Never invent or guess a goal ID."
        )
        lines.append("")

    if ctx.recurring_tasks:
        lines.append("## ALREADY SCHEDULED (Recurring — do NOT suggest these again)")
        seen: set[str] = set()
        for t in ctx.recurring_tasks:
            key = t.title.lower()
            if key in seen:
                continue
            seen.add(key)
            lines.append(f"• {t.title} [{t.assignee}] — {_format_schedule(t.schedule)}")
        lines.append("")

    pending = [t for t in ctx.current_tasks if not t.completed]
    if pending:
        lines.append("## TODAY'S PENDING TASKS (Do NOT duplicate these)")
        for t in pending[:12]:
            lines.append(f"• {t.title} [{t.assignee}]")
        lines.append("")

    if ctx.tomorrow_tasks or ctx.tomorrow_events:
        tomorrow = pc.today + timedelta(days=1)
        tomorrow_str = tomorrow.strftime("%A, %B %-d")
        lines.append(f"## TOMORROW'S EXISTING PLAN ({tomorrow_str} — already scheduled)")
        pending_tmrw = [t for t in ctx.tomorrow_tasks if not t.completed]
        if pending_tmrw:
            lines.append("Tasks already scheduled for tomorrow (do NOT duplicate):")
            for t in pending_tmrw[:12]:
                lines.append(f"• {t.title} [{t.assignee}]")
        if ctx.tomorrow_events:
            lines.append("Calendar events already on tomorrow:")
            for ev in ctx.tomorrow_events:
                lines.append(f"• {ev.title}: {_format_calendar_ts(ev.start)} → {_format_calendar_ts(ev.end)}")
        lines.append("Only suggest tasks that fill realistic gaps around the above. Keep the day achievable.")
        lines.append("")

    if ctx.completed_history:
        lines.append("## RECENTLY DONE (Avoid repeating)")
        for h in ctx.completed_history[-15:]:
            day_part = f" — completed day: {h.day}" if h.day else ""
            lines.append(f"• {h.title} [{h.assignee}]{day_part}")
        lines.append("")


def _append_response_instructions(lines: list[str], pc: PromptContext) -> None:
    cfg = settings.assistant
    ctx = pc.req.live_context
    mode = pc.response_mode

    # ── non-JSON or non-task short-circuit modes ──────────────────────────────

    if cfg.response_format != "json":
        lines += ["Respond naturally in plain text. Be warm and concise.", ""]
        return

    if mode == ResponseMode.NEEDS_DATE:
        lines += [
            "BIRTHDAY/ANNIVERSARY DATE UNKNOWN:",
            "Ask the user which date it falls on. Respond with ONE warm question only. Do NOT suggest any tasks.",
            "",
        ]
        return

    if mode == ResponseMode.CALENDAR_EVENT:
        lines += [
            "## RESPONSE FORMAT",
            "Respond with valid JSON only. No extra text, no markdown fences.",
            "The user wants to add an event to their Google Calendar.",
            "Output a 'suggested_events' array — do NOT output tasks.",
            "",
            "JSON TEMPLATE:",
            '{"message":"Confirming the event details","tasks":[],"suggested_events":['
            '{"title":"Event name","date":"YYYY-MM-DD","start_time":"H:MM AM","end_time":"H:MM AM","recurrence":"none"}],'
            '"memory_updates":[]}',
            "",
            "Rules:",
            f"- TODAY IS {pc.today_str}. Infer the date from the user's message (e.g. 'tomorrow', 'next Monday').",
            "- recurrence must be exactly one of: 'none', 'daily', 'weekly', 'monthly'.",
            "- If the user does not specify an end time, add 1 hour to the start time.",
            "- If the user does not specify a date, use today's date.",
            "- Use 12-hour time format with AM/PM (e.g. '2:00 PM').",
            "",
        ]
        return

    if mode == ResponseMode.SCHEDULE_LOOKUP:
        lines += [
            "SCHEDULE LOOKUP: The user is asking what they already have scheduled.",
            "Answer in natural prose (no task cards). Cover in order:",
            "  1. Any UPCOMING CALENDAR EVENTS on the day(s) they asked about — always mention title and time.",
            "  2. Any recurring tasks that fall on that weekday.",
            "  3. Any pending one-off tasks for that day.",
            "If there are no calendar events for that day, say so before moving on.",
            "Keep the response concise but complete — 2-4 sentences is fine.",
            "",
        ]
        return

    if mode == ResponseMode.LIGHT_DAY:
        lines += [
            "LIGHT DAY: The user wants an easy, restful day.",
            "Respond warmly in 1-2 sentences. Let them know you understand and that their pending tasks will be moved to tomorrow so they can rest today.",
            "Do NOT suggest any new tasks. Be warm, supportive, and brief.",
            "Example tone: 'Of course! Rest is important too. Your pending tasks will be moved to tomorrow — enjoy your lighter day. 💙'",
            "",
        ]
        return

    if mode == ResponseMode.CHAT:
        lines += [
            "NOT A TASK REQUEST: Do not suggest, mention, or hint at any tasks.",
            "Respond in 1–2 warm, natural sentences only.",
            "",
        ]
        return

    # ── task JSON modes ───────────────────────────────────────────────────────

    lines += [
        "## RESPONSE FORMAT",
        "Respond with valid JSON only. No extra text, no markdown fences.",
        "memory_updates must always be an empty array [] unless the user EXPLICITLY says "
        "'remember that', 'save this', or 'note that'.",
        "",
    ]

    event_assignable: list[str] = pc.assignable  # narrowed for EVENT_PLAN

    if mode == ResponseMode.GOAL_PLAN:
        self_id = _detect_self(pc.req.message, pc.notes, pc.assignable)
        default_assignee = self_id if self_id else "Both"
        a0 = pc.assignable[0] if pc.assignable else "Mom"
        a1 = pc.assignable[-1] if pc.assignable else "Dad"
        lines += [
            "GOAL PLAN: The user is stating a personal or family goal.",
            "1. Extract a short goal title (2-6 words) from the message.",
            '2. Include "goal": {"title": "<extracted title>"} in your JSON.',
            "3. Create 4-8 tasks that directly support this goal.",
            "4. Mix frequencies: daily for habits, weekly for deeper activities.",
            f"5. Default assignee is '{default_assignee}'. Alternate Mom and Dad for individual tasks. Use 'Both' for shared habits.",
            "6. If the goal is iman/spiritual: include Quran, dhikr, dua, reflection tasks.",
            "7. If the goal is fitness: include exercise, meal prep, hydration habits.",
            "8. If the goal is home/cleanliness: include a mix of daily upkeep and weekly deep tasks.",
            "9. If the goal is parenting/patience: include family time, communication, and self-care tasks.",
            "10. Add a memory_update with the goal (e.g. 'Goal: Grow my Iman — shared family goal').",
        ]
        lines += _time_blocking_lines(ctx, pc.today)
        lines += [
            "TIME: Assign a prayer block label to EVERY task. Never use null for time.",
            "Use: 'After Fajr', 'After Dhuhr', 'After Asr', 'After Maghrib', 'After Isha', or 'Before Sleep'.",
            "",
            "JSON TEMPLATE (replace all content with your own):",
            '{"message":"Warm encouragement about their goal","goal":{"title":"Short goal title"},"tasks":[',
            f'  {{"title":"Read 1 page of Quran with translation","assignee":"{a0}","frequency":"daily","day":null,"time":"After Fajr","duration":"10 min"}},',
            f'  {{"title":"5 minutes of dhikr after Maghrib","assignee":"{a1}","frequency":"daily","day":null,"time":"After Maghrib","duration":"5 min"}},',
            '  {"title":"Family dua together after dinner","assignee":"Both","frequency":"daily","day":null,"time":"After Maghrib","duration":"5 min"},',
            f'  {{"title":"Listen to a short Islamic reminder","assignee":"Both","frequency":"weekly","day":"Friday","time":"After Dhuhr","duration":"15 min"}}',
            '],"memory_updates":["Goal: Grow my Iman — shared family goal"]}',
            "Now write YOUR OWN version for this family's goal.",
            "",
        ]

    elif mode == ResponseMode.EVENT_PLAN:
        honoree = _event_honoree(pc.req.message, pc.assignable)
        event_assignable = [n for n in pc.assignable if n != honoree] or pc.assignable
        edi = _event_date_info(pc)
        assignee_ex  = event_assignable[0] if event_assignable else pc.assignable[0]
        assignee_ex2 = event_assignable[-1] if event_assignable else pc.assignable[-1]
        ex_day1      = edi.day_slots[0]
        ex_day_mid   = edi.day_slots[len(edi.day_slots) // 2] if len(edi.day_slots) > 1 else ex_day1
        ex_day_last  = edi.day_slots[-1]
        lines.append("EVENT PLAN: All tasks use frequency='once'. Never use daily, weekly, or monthly.")
        lines.append(edi.day_context)
        lines.append("Put the day label exactly as shown into the 'time' field — no clock times.")
        lines.append("Spread tasks logically: early prep first, day-of tasks last.")
        if honoree:
            lines.append(
                f"HONOREE RULE: {honoree} is being celebrated — NEVER assign any task to {honoree}. "
                f"Only assign to: {event_assignable}."
            )
        lines += [
            "",
            "JSON TEMPLATE (replace titles with your own — aim for 6–10 tasks):",
            '{"message":"A warm summary of the plan","tasks":[',
            f'  {{"title":"Decide on the plan and budget","assignee":"{assignee_ex}","frequency":"once","day":null,"time":"{ex_day1}","duration":"15 min"}},',
            f'  {{"title":"Order or buy the gift","assignee":"{assignee_ex}","frequency":"once","day":null,"time":"{ex_day_mid}","duration":"25 min"}},',
            f'  {{"title":"Prepare the special meal or activity","assignee":"{assignee_ex2}","frequency":"once","day":null,"time":"{ex_day_last}","duration":"45 min"}}',
            '],"memory_updates":[]}',
            "",
        ]

    elif mode == ResponseMode.TODAY_TASKS:
        lines.append("TODAY TASKS: Every task must use frequency='once'. Never use daily, weekly, or monthly.")
        lines.append("Every task is for TODAY — do NOT schedule anything for tomorrow or a future date.")
        if pc.jummah_mode == JummahMode.TODAY_PRE_DHUHR:
            lines.append(
                f"JUMU'AH PREP: Today is {pc.today_str}. The user is preparing for Jumu'ah today before Dhuhr."
            )
        elif pc.jummah_mode == JummahMode.TODAY_POST_DHUHR:
            lines.append(
                f"POST-JUMU'AH: Today is {pc.today_str}, and Jumu'ah time has passed. Suggest lighter tasks only."
            )
        elif pc.jummah_mode == JummahMode.UPCOMING_FRIDAY:
            next_fri = _next_friday(pc.today)
            lines.append(
                f"UPCOMING JUMU'AH PREP: Today is {pc.today_str}. Plan toward Friday, {next_fri.strftime('%B %-d')}."
            )
        if ctx.current_time:
            lines.append(
                f"CURRENT TIME: {ctx.current_time}. "
                "Only suggest times still in the future. Never suggest a time that has already passed."
            )
        _fb = _future_blocks(ctx, pc.today)
        _t1 = _fb[0] if len(_fb) > 0 else "After Maghrib"
        _t2 = _fb[1] if len(_fb) > 1 else _t1
        _t3 = _fb[2] if len(_fb) > 2 else _t2
        lines += [
            "",
            "JSON TEMPLATE — IMPORTANT: always set 'time' to a prayer block label, never null:",
            '{"message":"Here are your tasks for today","tasks":[',
            f'  {{"title":"Wipe down kitchen counters","assignee":"{pc.assignable[0]}","frequency":"once","day":null,"time":"{_t1}","duration":"10 min"}},',
            f'  {{"title":"Vacuum the living room","assignee":"Both","frequency":"once","day":null,"time":"{_t2}","duration":"15 min"}},',
            f'  {{"title":"Tidy the bedroom","assignee":"{pc.assignable[-1]}","frequency":"once","day":null,"time":"{_t3}","duration":"12 min"}}',
            '],"memory_updates":[]}',
            "",
        ]
        lines += _time_blocking_lines(ctx, pc.today)

    elif mode == ResponseMode.TOMORROW_TASKS:
        tomorrow = pc.today + timedelta(days=1)
        tomorrow_str = tomorrow.strftime("%A, %B %-d")
        is_tmrw_friday = tomorrow.weekday() == 4
        lines.append(f"TOMORROW TASKS: Every task must use frequency='once' and be for tomorrow, {tomorrow_str}.")
        lines.append("Do NOT schedule anything for today. Every task is for tomorrow only.")
        if is_tmrw_friday:
            lines.append(
                f"JUMU'AH FRIDAY: Tomorrow is Friday. Include Ghusl, heading to mosque, and Surah Al-Kahf in the morning plan."
            )
        _fb_tmrw = [
            "After Fajr", "After Dhuhr", "After Asr", "After Maghrib", "After Isha", "Before Sleep",
        ]
        if is_tmrw_friday:
            _fb_tmrw = [
                "Before Jumu'ah", "After Dhuhr", "After Asr", "After Maghrib", "After Isha", "Before Sleep",
            ]
        _t1 = _fb_tmrw[0]
        _t2 = _fb_tmrw[1] if len(_fb_tmrw) > 1 else _t1
        _t3 = _fb_tmrw[2] if len(_fb_tmrw) > 2 else _t2
        lines += [
            "",
            "TIME BLOCKS — all blocks are available since we are planning ahead for tomorrow:",
        ]
        pt = ctx.prayer_times
        if pt:
            if is_tmrw_friday:
                lines += [
                    f'  "Before Jumu\'ah" (before {pt.dhuhr}) — morning prep, ghusl, Surah Al-Kahf, errands',
                    f'  "After Dhuhr"   ({pt.dhuhr}) — after Jumu\'ah: lighter tasks, rest, family time',
                ]
            else:
                lines += [
                    f'  "After Fajr"    ({pt.fajr})    — Quran, quiet morning habits',
                    f'  "After Dhuhr"   ({pt.dhuhr})   — errands, home tasks, midday chores',
                ]
            lines += [
                f'  "After Asr"     ({pt.asr})     — active tasks, exercise, outdoor errands',
                f'  "After Maghrib" ({pt.maghrib}) — family time, lighter evening tasks',
                f'  "After Isha"    ({pt.isha})    — evening routine, wind-down',
            ]
        else:
            lines += [
                f'  "{_t1}" | "{_t2}" — morning / midday tasks',
                f'  "{_t3}" — afternoon tasks',
                '  "After Maghrib" — evening tasks',
                '  "After Isha" — night routine',
            ]
        lines += [
            '  "Before Sleep" — night prep, day layout',
            "Use MULTIPLE different blocks. Aim for 5–10 tasks covering the full day.",
            "LOAD CHECK: If total duration exceeds ~11 hours, trim and note it in 'message'.",
            "",
            "JSON TEMPLATE — set 'time' to a prayer block label, never null:",
            '{"message":"Here are your tasks for tomorrow","tasks":[',
            f'  {{"title":"Plan tomorrow\'s priorities","assignee":"{pc.assignable[0]}","frequency":"once","day":null,"time":"{_t1}","duration":"10 min"}},',
            f'  {{"title":"Example midday task","assignee":"Both","frequency":"once","day":null,"time":"{_t2}","duration":"20 min"}},',
            f'  {{"title":"Example afternoon task","assignee":"{pc.assignable[-1]}","frequency":"once","day":null,"time":"{_t3}","duration":"15 min"}}',
            '],"memory_updates":[]}',
            "",
        ]

    elif mode == ResponseMode.RECURRING_PLAN:
        a0 = pc.assignable[0]
        a1 = pc.assignable[-1]
        lines += [
            "RECURRING PLAN: Return a mix — at least 3 daily + 4 weekly (each a different day) + 1 monthly.",
            "Do NOT use 'once'. Only 'daily', 'weekly', or 'monthly'.",
            "Weekly tasks must each have a distinct 'day'. Monthly tasks need a day ordinal (e.g. '1st', '15th').",
            "TIME: Assign a prayer block label to EVERY task — even recurring ones. Never use null for time.",
            "Use: 'After Fajr', 'After Dhuhr', 'After Asr', 'After Maghrib', 'After Isha', or 'Before Sleep'.",
            "CRITICAL: ALL tasks must be inside the 'tasks' JSON array. 'message' is a single warm sentence ONLY.",
            "Do NOT list tasks inside 'message'. Do NOT describe tasks in prose. Use ONLY the JSON structure below.",
            "",
            "JSON TEMPLATE (replace with your own tasks):",
            '{"message":"Here is your recurring home plan","tasks":[',
            f'  {{"title":"Wipe kitchen counters","assignee":"{a0}","frequency":"daily","day":null,"time":"After Dhuhr","duration":"5 min"}},',
            f'  {{"title":"Tidy living room","assignee":"Both","frequency":"daily","day":null,"time":"After Maghrib","duration":"10 min"}},',
            f'  {{"title":"Quick bathroom wipe","assignee":"{a1}","frequency":"daily","day":null,"time":"After Asr","duration":"5 min"}},',
            f'  {{"title":"Vacuum and sweep floors","assignee":"Both","frequency":"weekly","day":"Saturday","time":"After Dhuhr","duration":"20 min"}},',
            f'  {{"title":"Deep clean bathroom","assignee":"{a0}","frequency":"weekly","day":"Sunday","time":"After Asr","duration":"30 min"}},',
            f'  {{"title":"Wash bed sheets","assignee":"Both","frequency":"weekly","day":"Friday","time":"After Dhuhr","duration":"15 min"}},',
            f'  {{"title":"Dust shelves and electronics","assignee":"{a1}","frequency":"weekly","day":"Tuesday","time":"After Asr","duration":"15 min"}},',
            '  {"title":"Clean out fridge","assignee":"Both","frequency":"monthly","day":"1st","time":"After Dhuhr","duration":"20 min"}',
            '],"memory_updates":[]}',
            "Now write YOUR OWN version for this family.",
            "",
        ]
        lines += _time_blocking_lines(ctx, pc.today)

    elif mode == ResponseMode.CLEANING_TASKS:
        spec = pc.cleaning_spec
        if spec is None:
            return
        level_label = spec.level.value.replace("_", " ").upper()
        lines += [
            f"CLEANING LEVEL: {level_label}",
            f"Generate EXACTLY {spec.task_min}–{spec.task_max} tasks. Do not stop early.",
            "Every task: frequency='once', day=null, time=null. NEVER use daily, weekly, or monthly.",
            "Use specific action verbs: wipe, vacuum, scrub, fold, sort, dust, sweep, mop, empty, wash, clear, pull out, declutter.",
            "Titles must be specific (e.g. 'Vacuum under the bed', 'Wipe light switches and handles').",
            "Do NOT use vague titles like 'Clean the room', 'Tidy up', 'Organize stuff', or 'Deep clean bedroom'.",
        ]
        if spec.room and not spec.multi_room:
            lines.append(
                f"ROOM FOCUS: All tasks must be for the {spec.room} ONLY. "
                f"Do NOT include tasks for any other room."
            )
        if spec.multi_room:
            lines.append(
                "MULTI-ROOM: Prefix every title with the room name and a dash "
                "(e.g. 'Bedroom 1 - Vacuum carpet', 'Bedroom 2 - Dust surfaces'). "
                "Cover the same categories per room. Alternate assignees. Aim for 4–6 tasks per room."
            )
        _fb4 = _future_blocks(ctx, pc.today)
        _c1 = _fb4[0] if _fb4 else "After Maghrib"
        _c2 = _fb4[1] if len(_fb4) > 1 else _c1
        _c3 = _fb4[2] if len(_fb4) > 2 else _c2
        lines += [
            "",
            "TIME: Assign a prayer block label to every task. Never use null for time.",
            f"Use: {', '.join(f'{chr(39)}{b}{chr(39)}' for b in _fb4)}.",
            "",
            "JSON TEMPLATE — replace ALL titles with your own specific tasks:",
            '{"message":"Warm 1-sentence intro","tasks":[',
            f'  {{"title":"{spec.room or "Area"} - Specific action 1","assignee":"{pc.assignable[0]}","frequency":"once","day":null,"time":"{_c1}","duration":"10 min"}},',
            f'  {{"title":"{spec.room or "Area"} - Specific action 2","assignee":"Both","frequency":"once","day":null,"time":"{_c2}","duration":"15 min"}},',
            f'  {{"title":"{spec.room or "Area"} - Specific action 3","assignee":"{pc.assignable[-1]}","frequency":"once","day":null,"time":"{_c1}","duration":"20 min"}},',
            f'  {{"title":"{spec.room or "Area"} - Specific action 4","assignee":"{pc.assignable[0]}","frequency":"once","day":null,"time":"{_c2}","duration":"10 min"}},',
            f'  {{"title":"{spec.room or "Area"} - Specific action 5","assignee":"Both","frequency":"once","day":null,"time":"{_c3}","duration":"5 min"}}',
            '],"memory_updates":[]}',
            f"Continue until you have {spec.task_min}–{spec.task_max} tasks. Do not stop at 3 or 4.",
            "",
        ]
        lines += _time_blocking_lines(ctx, pc.today)

    else:  # GENERAL_TASKS
        lines += [
            "JSON SCHEMA:",
            "{",
            '  "message": "Warm, helpful response",',
            '  "tasks": [',
            f'    {{"title": "Short clear task title", "assignee": "one of {pc.assignable} or Both", '
            '"frequency": "once|daily|weekly|monthly", '
            '"day": "weekday for weekly (e.g. Saturday) or ordinal for monthly (e.g. 15th) — null for once/daily", '
            f'"time": {"\\\"e.g. 6:00 AM\\\"" if pc.wants_time else "null"}, '
            '"duration": "e.g. 10 min or 1 hr"}}',
            "  ],",
            '  "memory_updates": []',
            "}",
            "",
            "FREQUENCY RULES:",
            "- once: one-off task, day=null.",
            "- daily: repeats every day, day=null.",
            "- weekly: set day to the weekday name (e.g. 'Friday').",
            "- monthly: set day to an ordinal (e.g. '1st', '15th').",
            "TIME RULE: ALWAYS set a prayer block label for every task — never null. "
            "Use: 'After Fajr', 'After Dhuhr', 'After Asr', 'After Maghrib', 'After Isha', or 'Before Sleep'. "
            "Only use a clock time if the user explicitly asked for one.",
            "",
        ]
        lines += _time_blocking_lines(ctx, pc.today)

    # ── cleaning boost for today/event branches ───────────────────────────────
    if pc.is_cleaning and not pc.is_broad and mode in (ResponseMode.TODAY_TASKS, ResponseMode.EVENT_PLAN):
        if pc.multi_room:
            lines.append(
                "MULTI-ROOM CLEANING: Generate tasks for EACH room separately. "
                "Prefix every task title with the room name followed by ' - '. "
                "Cover: declutter/pick up, make bed if applicable, vacuum or sweep, dust surfaces, "
                "wipe light switches and handles. Alternate assignees. Aim for 4–6 tasks per room. Use frequency='once'."
            )
        else:
            lines.append(
                "CLEANING: Generate 10–12 specific, granular tasks for the area mentioned. "
                "Be detailed — e.g. 'Vacuum under the bed', 'Wipe down baseboards', "
                "'Dust ceiling fan blades', 'Wipe light switches and door handles'. "
                "Do NOT use vague titles like 'Clean the room'. Use frequency='once'."
            )

    # ── single task override ──────────────────────────────────────────────────
    if pc.single_task and mode != ResponseMode.EVENT_PLAN:
        lines += [
            "",
            "SINGLE TASK: Create exactly ONE task with frequency='once'.",
            "Do not generate a list, routine, or plan.",
            "Title should be short and directly based on what the user asked.",
        ]

    # ── assignee rules ────────────────────────────────────────────────────────
    eff_assignable = event_assignable if mode == ResponseMode.EVENT_PLAN else pc.assignable
    lines += [
        "",
        f"ASSIGNEES: Use exactly one name from {eff_assignable}, or the word 'Both'.",
        "Never use 'Mom or Dad', 'Family', 'All', or any other phrasing.",
        "DURATION: Always set a realistic estimate (e.g. '5 min', '15 min', '1 hr'). Never null.",
        "",
    ]

    # ── config task rules ─────────────────────────────────────────────────────
    once_only = mode in (
        ResponseMode.TODAY_TASKS, ResponseMode.TOMORROW_TASKS, ResponseMode.EVENT_PLAN, ResponseMode.CLEANING_TASKS,
    ) or pc.single_task
    cfg = settings.assistant
    if cfg.task_rules:
        lines.append("RULES:")
        for rule in cfg.task_rules:
            if once_only and any(w in rule.lower() for w in ("daily", "weekly", "monthly", "recurring", "frequency")):
                continue
            lines.append(f"- {rule}")


# ── entry point ───────────────────────────────────────────────────────────────

def build_system_prompt(
    req: ChatRequest,
    notes: list[str],
    kb_docs: list[KBDocument],
    history: list[dict] | None = None,
) -> str:
    pc = _build_context(req, notes, kb_docs, history)
    lines: list[str] = []
    _append_header(lines, pc)
    _append_constraints(lines, pc)
    _append_prayer_times(lines, pc)
    _append_context_sections(lines, pc)
    _append_response_instructions(lines, pc)
    return "\n".join(lines)
