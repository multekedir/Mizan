"""System prompt construction."""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from config import settings
from intent import (
    INTENT_PATTERNS,
    classify_intent,
    get_event_date,
    is_birthday_without_date,
    is_event_plan_request,
    is_single_task_creation,
    is_today_request,
    is_light_day_request,
    _event_honoree,
    _day_label,
    _SPECIFIC_DATE_RE,
    should_generate_tasks,
)
from models import ChatRequest, KBDocument


def _birthday_date_in_notes(notes: list[str]) -> bool:
    for note in notes:
        if _SPECIFIC_DATE_RE.search(note) and re.search(
            r'\b(birthday|anniversary|bday)\b', note, re.IGNORECASE
        ):
            return True
    return False


def _child_names() -> set[str]:
    return {m.name for m in settings.assistant.members if m.too_young_for_tasks}


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
# Matches explicit task-creation language ("create tasks", "add tasks", etc.)
# When present with a cleaning request, the user wants concrete task cards — prefer
# the cleaning branch over the abstract recurring-plan branch.
_EXPLICIT_TASKS_RE = re.compile(
    r'\b(create|add|give me|suggest|make)\s+(some\s+|a\s+few\s+)?tasks?\b',
    re.IGNORECASE,
)

_GOAL_STATEMENT_RE = INTENT_PATTERNS["goal_statement"]


def _time_blocking_lines(ctx, today: "date | None" = None) -> list[str]:
    """Future-only prayer-block labels, Friday-aware, baby-aware nap, load-check."""
    child_names = _child_names()
    has_young_child = bool(child_names)
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
            # Friday: replace pre-Dhuhr window with "Before Jumu'ah"
            if before_dhuhr:
                out.append(
                    f'  "Before Jumu\'ah" (before {pt.dhuhr}) — Ghusl/shower, prep tasks, errands, cleaning BEFORE Friday prayer'
                )
            # "After Dhuhr" window lasts until Asr — only show if Asr hasn't passed
            if _future(pt.asr):
                out.append(
                    f'  "After Dhuhr" ({pt.dhuhr}) — After Jumu\'ah: lighter tasks, rest, family time (NOT heavy cleaning)'
                )
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
            # Approximate: "After Dhuhr" window ends at Asr (~4 PM). Show if before 4 PM.
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

    if has_young_child:
        child_list = ', '.join(sorted(child_names))
        morning_nap = _parse_time_str("10:00 AM")
        afternoon_nap = _parse_time_str("2:00 PM")
        nap_end = _parse_time_str("3:30 PM")

        if now is None or (morning_nap and now < morning_nap):
            upcoming_nap = "~10 AM or ~2 PM"
        elif afternoon_nap and now < afternoon_nap:
            upcoming_nap = "~2 PM"
        elif nap_end and now < nap_end:
            upcoming_nap = "~2 PM"
        else:
            upcoming_nap = None  # both naps done for today

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


def _jummah_awareness_lines(today: date, pt) -> list[str]:
    """Return Jumu'ah-specific scheduling rules whenever it's Friday or the user mentions it."""
    dhuhr_str = pt.dhuhr if pt else "~12:30 PM"
    out: list[str] = [
        "## JUMU'AH FRIDAY RULES — READ CAREFULLY",
        f"Today is Friday. Jumu'ah prayer is at Dhuhr time ({dhuhr_str}).",
        "",
        "MAP prayer blocks to Friday schedule like this:",
        f'  "After Fajr"    → BEFORE Jumu\'ah. Use for heavy cleaning, prep, errands. This is prime morning time.',
        f'  [Jumu\'ah gap]   → Ghusl, dressing, travel to mosque. Do NOT schedule any task here.',
        f'  "After Dhuhr"   → AFTER Jumu\'ah. First post-prayer slot. Lighter tasks, family time, rest.',
        f'  "After Asr"     → Relaxed afternoon. Moderate tasks, errands, children\'s activities.',
        f'  "After Maghrib" → Quiet evening. Wind-down only. Do NOT pile all tasks here.',
        f'  "Before Sleep"  → Night prep only.',
        "",
        "RULES:",
        "- DO use 'Before Jumu'ah' for heavier tasks — it is the prime pre-prayer block.",
        "- DO use 'After Dhuhr' as the first post-Jumu'ah slot (lighter tasks, rest, family time).",
        "- DO NOT assign all or most tasks to 'After Maghrib'. That block is evening wind-down only.",
        "- ALWAYS include these Jumu'ah prep tasks (frequency='once', time='Before Jumu\\'ah'):",
        "    • 'Ghusl (shower) for Jumu\\'ah' — assignee: Both. This is for EVERYONE including the baby — the whole family bathes/showers before Friday prayer.",
        "    • 'Wear clean Friday clothes' — assignee: Both",
        "    • 'Head to the mosque for Jumu\\'ah' — assignee: Dad",
        "- NOTE: Jumu\\'ah IS the Dhuhr prayer on Friday. 'After Dhuhr' block = after Jumu\\'ah. Do NOT create a separate 'After Jumu\\'ah' block — use 'After Dhuhr'.",
        "- Include 1 Sunnah task: reading Surah Al-Kahf or sending extra Salawat — time: 'Before Jumu\\'ah'.",
        "- Mention Jumu'ah warmly in 'message' (e.g. 'Jumu'ah Mubarak! Here is your Friday plan.').",
        "",
    ]
    return out


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


def _future_blocks(ctx, today: date) -> list[str]:
    """Prayer block labels still upcoming today, in chronological order."""
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
            # "After Dhuhr" window lasts until Asr
            if _after(pt.asr):
                blocks.append("After Dhuhr")
        else:
            if _after(pt.fajr):
                blocks.append("After Fajr")
            # "After Dhuhr" window lasts until Asr
            if _after(pt.asr):
                blocks.append("After Dhuhr")
        if _after(pt.asr):
            blocks.append("After Asr")
        if _after(pt.maghrib):
            blocks.append("After Maghrib")
        if _after(pt.isha):
            blocks.append("After Isha")
    else:
        # No prayer times — use approximate clock times for filtering
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


def _is_before_dhuhr(ctx) -> bool:
    """True if current time is before Dhuhr (or if time is unknown — conservative)."""
    now = _parse_time_str(ctx.current_time) if ctx.current_time else None
    if now is None:
        return True
    pt = ctx.prayer_times
    dhuhr_t = _parse_time_str(pt.dhuhr) if pt else _parse_time_str("12:30 PM")
    return dhuhr_t is None or now < dhuhr_t


def _parse_time_str(s: str) -> datetime | None:
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            continue
    return None


def _mins_between(a: datetime, b: datetime) -> int:
    return int((b - a).total_seconds() / 60)


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


def build_system_prompt(
    req: ChatRequest,
    notes: list[str],
    kb_docs: list[KBDocument],
    history: list[dict] | None = None,
) -> str:
    cfg = settings.assistant
    ctx = req.live_context
    member_list = [m.name for m in ctx.members] or [m.name for m in cfg.members]
    assignable = [n for n in member_list if n not in _child_names()]

    today = date.today()
    today_str = today.strftime("%A, %B %-d, %Y")
    is_friday = today.weekday() == 4
    before_dhuhr = _is_before_dhuhr(ctx)

    # DEBUG — remove after diagnosis
    print(f"[DEBUG] current_time={ctx.current_time!r}  prayer_times={ctx.prayer_times}  future_blocks={_future_blocks(ctx, today)}", flush=True)

    # ── Intent flags ──────────────────────────────────────────────────────────

    needs_birthday_date = is_birthday_without_date(req.message) and not _birthday_date_in_notes(notes)
    is_task_request     = should_generate_tasks(req.message) and not needs_birthday_date

    today_req   = is_today_request(req.message)
    is_cleaning = bool(_CLEANING_RE.search(req.message))
    multi_room  = bool(_MULTI_ROOM_RE.search(req.message))
    is_jummah   = bool(_JUMMAH_RE.search(req.message))

    # For follow-up edits ("add more"), inherit context from the last 2 user turns
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
            if not is_jummah:
                is_jummah = any(_JUMMAH_RE.search(m) for m in recent_user)

    is_goal_statement = bool(_GOAL_STATEMENT_RE.search(req.message))

    event_plan    = is_event_plan_request(req.message) and not needs_birthday_date
    single_task   = is_single_task_creation(req.message)
    wants_time    = bool(_WANTS_TIME_RE.search(req.message))
    is_broad      = (
        not today_req and not event_plan and not single_task
        # Don't use broad/recurring branch when user explicitly says "create tasks" +
        # cleaning — they want concrete task cards, not an abstract recurring plan.
        and not (is_cleaning and bool(_EXPLICIT_TASKS_RE.search(req.message)))
        and bool(_BROAD_RE.search(req.message))
    )

    event_assignable: list[str] = assignable  # may be narrowed inside event branch

    # ── Header ────────────────────────────────────────────────────────────────

    lines: list[str] = [
        f"You are '{cfg.name}' — {cfg.persona}",
        f"TODAY IS {today_str}.",
        "",
        "CORE RULE: Generate tasks whenever the user asks for tasks, a plan, suggestions, "
        "OR expresses intent to do something "
        "(e.g. 'I want to clean', 'I'd like to organise', 'help me deep clean'). "
        "Only skip tasks for pure greetings, introductions, feelings, or questions about you — "
        "respond warmly in 1–2 sentences only.",
        "",
    ]

    # ── Constraints ───────────────────────────────────────────────────────────

    if cfg.constraints:
        lines.append("NEVER suggest any of the following:")
        for c in cfg.constraints:
            lines.append(f"- {c}")
        lines.append("")

    # ── Prayer times ──────────────────────────────────────────────────────────

    if ctx.prayer_times:
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

    # ── Jumu'ah awareness ─────────────────────────────────────────────────────

    # Show Jumu'ah rules if: user mentioned Jumu'ah explicitly, OR it's Friday and still before Dhuhr
    if is_task_request and (is_jummah or (is_friday and before_dhuhr)):
        lines += _jummah_awareness_lines(today, ctx.prayer_times)

    # ── Knowledge base ────────────────────────────────────────────────────────

    if kb_docs:
        lines.append("## KNOWLEDGE BASE")
        for doc in kb_docs:
            lines.append(f"[{doc.category}] {doc.content.strip()}")
        lines.append("")

    # ── Remembered notes ──────────────────────────────────────────────────────

    if notes:
        lines.append("## REMEMBERED NOTES (Always respect these)")
        for note in notes[-10:]:
            lines.append(f"• {note}")
        lines.append("")

    # ── Active goals ──────────────────────────────────────────────────────────

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

    # ── Recurring tasks (avoid repeating) ─────────────────────────────────────

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

    # ── Today's pending tasks ─────────────────────────────────────────────────

    pending = [t for t in ctx.current_tasks if not t.completed]
    if pending:
        lines.append("## TODAY'S PENDING TASKS (Do NOT duplicate these)")
        for t in pending[:12]:
            lines.append(f"• {t.title} [{t.assignee}]")
        lines.append("")

    # ── Completed history ─────────────────────────────────────────────────────

    if ctx.completed_history:
        lines.append("## RECENTLY DONE (Avoid repeating)")
        for title in ctx.completed_history[-15:]:
            lines.append(f"• {title}")
        lines.append("")

    # ── Response format ───────────────────────────────────────────────────────

    if cfg.response_format == "json" and is_task_request:
        lines += [
            "## RESPONSE FORMAT",
            "Respond with valid JSON only. No extra text, no markdown fences.",
            "memory_updates must always be an empty array [] unless the user EXPLICITLY says "
            "'remember that', 'save this', or 'note that'.",
            "",
        ]

        # ── Branch 0: Goal statement ──────────────────────────────────────────
        if is_goal_statement:
            self_id = _detect_self(req.message, notes, assignable)
            default_assignee = self_id if self_id else "Both"
            a0 = assignable[0] if assignable else "Mom"
            a1 = assignable[-1] if assignable else "Dad"
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
            lines += _time_blocking_lines(ctx, today)
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

        # ── Branch 1: Event plan ──────────────────────────────────────────────
        elif event_plan:
            honoree = _event_honoree(req.message, assignable)
            event_assignable = [n for n in assignable if n != honoree] or assignable
            ev_date = get_event_date(req.message)

            if ev_date:
                days_away = (ev_date - today).days
                ev_label  = _day_label(ev_date)
                day_slots = [_day_label(today + timedelta(days=i)) for i in range(min(days_away + 1, 8))]
                day_sched = "\n".join(
                    f"  - \"{s}\"{'  ← event day' if s == ev_label else ''}"
                    for s in day_slots
                )
                day_context = (
                    f"TODAY is {today_str}. Event is on {ev_label} — {days_away} day(s) away.\n"
                    f"Spread tasks across these days (copy the label exactly into the 'time' field):\n"
                    f"{day_sched}"
                )
            else:
                day_slots   = [today_str]
                day_context = f"TODAY is {today_str}. Spread tasks across the days leading up to and including the event."

            assignee_ex  = event_assignable[0] if event_assignable else assignable[0]
            assignee_ex2 = event_assignable[-1] if event_assignable else assignable[-1]
            ex_day1      = day_slots[0]
            ex_day_mid   = day_slots[len(day_slots) // 2] if len(day_slots) > 1 else ex_day1
            ex_day_last  = day_slots[-1]

            lines.append("EVENT PLAN: All tasks use frequency='once'. Never use daily, weekly, or monthly.")
            lines.append(day_context)
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

        # ── Branch 2: Today / Jummah prep ────────────────────────────────────
        elif today_req:
            lines.append("TODAY TASKS: Every task must use frequency='once'. Never use daily, weekly, or monthly.")
            lines.append("Every task is for TODAY — do NOT schedule anything for tomorrow or a future date.")

            if is_jummah:
                lines.append(
                    f"JUMMAH PREP: Today is {today_str}. The user is cleaning in preparation for "
                    "Jummah (Friday prayers). The cleaning is done TODAY — not on Friday or tomorrow."
                )

            if ctx.current_time:
                lines.append(
                    f"CURRENT TIME: {ctx.current_time}. "
                    "Only suggest times still in the future. Never suggest a time that has already passed."
                )

            _fb = _future_blocks(ctx, today)
            _t1 = _fb[0] if len(_fb) > 0 else "After Maghrib"
            _t2 = _fb[1] if len(_fb) > 1 else _t1
            _t3 = _fb[2] if len(_fb) > 2 else _t2
            lines += [
                "",
                "JSON TEMPLATE — IMPORTANT: always set 'time' to a prayer block label, never null:",
                '{"message":"Here are your tasks for today","tasks":[',
                f'  {{"title":"Wipe down kitchen counters","assignee":"{assignable[0]}","frequency":"once","day":null,"time":"{_t1}","duration":"10 min"}},',
                f'  {{"title":"Vacuum the living room","assignee":"Both","frequency":"once","day":null,"time":"{_t2}","duration":"15 min"}},',
                f'  {{"title":"Tidy the bedroom","assignee":"{assignable[-1]}","frequency":"once","day":null,"time":"{_t3}","duration":"12 min"}}',
                '],"memory_updates":[]}',
                "",
            ]
            lines += _time_blocking_lines(ctx, today)

        # ── Branch 3: Recurring plan ──────────────────────────────────────────
        elif is_broad:
            a0 = assignable[0]
            a1 = assignable[-1]
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
            lines += _time_blocking_lines(ctx, today)

        # ── Branch 4: Cleaning / organizing (one-off, not recurring) ────────────
        elif is_cleaning:
            _level = (
                "quick reset" if re.search(r'\b(quick|tidy\s*up|reset|light|fast|presentable)\b', req.message, re.IGNORECASE)
                else "deep clean" if re.search(r'\bdeep.?clean\b', req.message, re.IGNORECASE)
                else "organizing" if re.search(r'\b(organi[sz]|sort|declutter)\b', req.message, re.IGNORECASE)
                else "regular clean"
            )
            _counts = {
                "quick reset": "5–8",
                "regular clean": "8–12",
                "deep clean": "10–16",
                "organizing": "6–10",
            }
            _min = _counts[_level].split("–")[0]
            _max = _counts[_level].split("–")[1]

            # Detect specific room(s) mentioned so tasks don't bleed into wrong areas
            _room_match = re.search(
                r'\b(kitchen|bathroom|bedroom|living\s+room|entryway|pantry|laundry|garage|office)\b',
                req.message, re.IGNORECASE,
            )
            _room = _room_match.group(0) if _room_match else None

            lines += [
                f"CLEANING LEVEL: {_level.upper()}",
                f"Generate EXACTLY {_min}–{_max} tasks. Do not stop early.",
                "Every task: frequency='once', day=null, time=null. NEVER use daily, weekly, or monthly.",
                "Use specific action verbs: wipe, vacuum, scrub, fold, sort, dust, sweep, mop, empty, wash, clear, pull out, declutter.",
                "Titles must be specific (e.g. 'Vacuum under the bed', 'Wipe light switches and handles').",
                "Do NOT use vague titles like 'Clean the room', 'Tidy up', 'Organize stuff', or 'Deep clean bedroom'.",
            ]
            if _room and not multi_room:
                lines.append(
                    f"ROOM FOCUS: All tasks must be for the {_room} ONLY. "
                    f"Do NOT include tasks for any other room (no bathroom, bedroom, or living room tasks if user asked for {_room})."
                )
            if multi_room:
                lines.append(
                    "MULTI-ROOM: Prefix every title with the room name and a dash "
                    "(e.g. 'Bedroom 1 - Vacuum carpet', 'Bedroom 2 - Dust surfaces'). "
                    "Cover the same categories per room. Alternate assignees. Aim for 4–6 tasks per room."
                )
            _fb4 = _future_blocks(ctx, today)
            _c1 = _fb4[0] if len(_fb4) > 0 else "After Maghrib"
            _c2 = _fb4[1] if len(_fb4) > 1 else _c1
            _c3 = _fb4[2] if len(_fb4) > 2 else _c2
            _block_use = ", ".join(f"'{b}'" for b in _fb4)
            lines += [
                "",
                "TIME: Assign a prayer block label to every task. Never use null for time.",
                f"Use: {_block_use}.",
                "",
                "JSON TEMPLATE — replace ALL titles with your own specific tasks:",
                '{"message":"Warm 1-sentence intro","tasks":[',
                f'  {{"title":"{_room or "Area"} - Specific action 1","assignee":"{assignable[0]}","frequency":"once","day":null,"time":"{_c1}","duration":"10 min"}},',
                f'  {{"title":"{_room or "Area"} - Specific action 2","assignee":"Both","frequency":"once","day":null,"time":"{_c2}","duration":"15 min"}},',
                f'  {{"title":"{_room or "Area"} - Specific action 3","assignee":"{assignable[-1]}","frequency":"once","day":null,"time":"{_c1}","duration":"20 min"}},',
                f'  {{"title":"{_room or "Area"} - Specific action 4","assignee":"{assignable[0]}","frequency":"once","day":null,"time":"{_c2}","duration":"10 min"}},',
                f'  {{"title":"{_room or "Area"} - Specific action 5","assignee":"Both","frequency":"once","day":null,"time":"{_c3}","duration":"5 min"}}',
                '],"memory_updates":[]}',
                f"Continue until you have {_min}–{_max} tasks. Do not stop at 3 or 4.",
                "",
            ]
            lines += _time_blocking_lines(ctx, today)

        # ── Branch 5: General tasks ───────────────────────────────────────────
        else:
            lines += [
                "JSON SCHEMA:",
                "{",
                '  "message": "Warm, helpful response",',
                '  "tasks": [',
                f'    {{"title": "Short clear task title", "assignee": "one of {assignable} or Both", '
                '"frequency": "once|daily|weekly|monthly", '
                '"day": "weekday for weekly (e.g. Saturday) or ordinal for monthly (e.g. 15th) — null for once/daily", '
                f'"time": {"\\\"e.g. 6:00 AM\\\"" if wants_time else "null"}, '
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
            lines += _time_blocking_lines(ctx, today)

        # ── Cleaning boost for today/event branches ───────────────────────────
        if is_cleaning and not is_broad and (today_req or event_plan):
            if multi_room:
                lines.append(
                    "MULTI-ROOM CLEANING: Generate tasks for EACH room separately. "
                    "Prefix every task title with the room name followed by ' - ' "
                    "(e.g. 'Bedroom 1 - Vacuum the carpet', 'Bedroom 2 - Dust surfaces'). "
                    "Cover these categories in each room: declutter/pick up, make bed if applicable, "
                    "vacuum or sweep, dust surfaces, wipe light switches and handles. "
                    "Alternate assignees across rooms. Aim for 4–6 tasks per room. Use frequency='once'."
                )
            else:
                lines.append(
                    "CLEANING: Generate 10–12 specific, granular tasks for the area mentioned. "
                    "Be detailed — e.g. 'Vacuum under the bed', 'Wipe down baseboards', "
                    "'Dust ceiling fan blades', 'Wipe light switches and door handles'. "
                    "Do NOT use vague titles like 'Clean the room'. Use frequency='once'."
                )

        # ── Single task override ──────────────────────────────────────────────
        if single_task and not event_plan:
            lines += [
                "",
                "SINGLE TASK: Create exactly ONE task with frequency='once'.",
                "Do not generate a list, routine, or plan.",
                "Title should be short and directly based on what the user asked.",
            ]

        # ── Assignee rules ────────────────────────────────────────────────────
        eff_assignable = event_assignable if event_plan else assignable
        lines += [
            "",
            f"ASSIGNEES: Use exactly one name from {eff_assignable}, or the word 'Both'.",
            "Never use 'Mom or Dad', 'Family', 'All', or any other phrasing.",
            "DURATION: Always set a realistic estimate (e.g. '5 min', '15 min', '1 hr'). Never null.",
            "",
        ]

    else:
        if is_light_day_request(req.message):
            lines += [
                "LIGHT DAY: The user wants an easy, restful day.",
                "Respond warmly in 1-2 sentences. Let them know you understand and that their pending tasks will be moved to tomorrow so they can rest today.",
                "Do NOT suggest any new tasks. Be warm, supportive, and brief.",
                "Example tone: 'Of course! Rest is important too. Your pending tasks will be moved to tomorrow — enjoy your lighter day. 💙'",
                "",
            ]
        else:
            lines += [
                "Respond naturally in plain text. Be warm and concise.",
                "Do NOT use JSON, bullet lists, or task formatting. Just a friendly sentence or two.",
                "",
            ]

    # ── Special overrides ─────────────────────────────────────────────────────

    if needs_birthday_date:
        lines += [
            "BIRTHDAY/ANNIVERSARY DATE UNKNOWN:",
            "Ask the user which date it falls on. Respond with ONE warm question only. Do NOT suggest any tasks.",
            "",
        ]
    elif not is_task_request:
        lines += [
            "NOT A TASK REQUEST: Do not suggest, mention, or hint at any tasks.",
            "Respond in 1–2 warm, natural sentences only.",
            "",
        ]

    # ── Config task rules (filtered for once-only modes) ─────────────────────

    once_only = today_req or event_plan or single_task or (is_cleaning and not is_broad)
    if cfg.task_rules:
        lines.append("RULES:")
        for rule in cfg.task_rules:
            if once_only and any(w in rule.lower() for w in ("daily", "weekly", "monthly", "recurring", "frequency")):
                continue
            lines.append(f"- {rule}")

    return "\n".join(lines)
