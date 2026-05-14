"""Intent classification and request-type detection."""
from __future__ import annotations

import functools
import re
from dataclasses import dataclass
from datetime import date, timedelta

try:
    from hijridate import Gregorian, Hijri
    _HIJRIDATE_AVAILABLE = True
except ImportError:
    _HIJRIDATE_AVAILABLE = False


# ── intent patterns ───────────────────────────────────────────────────────────

INTENT_PATTERNS: dict[str, re.Pattern] = {
    "greeting": re.compile(
        r"^(hi|hey|hello|salam|assalamu|wa alaikum|how are you|how are things|"
        r"how'?s your day|how'?s it going|how are you doing|good morning|good afternoon|"
        r"good evening|good night|just checking in|how have you been)\b",
        re.IGNORECASE,
    ),
    "chitchat": re.compile(
        r"^(thank(s| you)|jazak|shukran|great|awesome|ok|okay|cool|got it|"
        r"sounds good|nice|perfect|alright|sure|yes|no|nope|yep|wow|haha|lol|"
        r"understand|gotcha|fair enough)\b",
        re.IGNORECASE,
    ),
    "intro": re.compile(
        r"^(i'?m |i am |my name is |this is |it'?s me|it is me)\w",
        re.IGNORECASE,
    ),
    "statement": re.compile(
        r"^(i feel|i think|i believe|i know|i just|i was|i am feeling|"
        r"i'?m (tired|exhausted|happy|sad|stressed|busy|overwhelmed|fine|bored|good|bad|okay)|"
        r"it'?s (a |been |so |really |very )?(nice|great|hard|tough|busy|slow|long|beautiful|quiet)|"
        r"today (is|was|has been)|it'?s been|what do you think about|"
        r"tell me about|who are you|what are you)\b",
        re.IGNORECASE,
    ),
    "remember": re.compile(
        r"^(remember|remind me|note that|save this|keep in mind|don'?t forget)\b",
        re.IGNORECASE,
    ),
    "task_request": re.compile(
        r"\b(suggest|give me|what (should|can) (i|we)|help (me|us) (with|plan|"
        r"organiz|clean|do|get|manage)|create (a|some|my)|plan (for|my|the)|"
        r"tasks?|chores?|routine|schedule|what'?s next|things? to do|"
        r"ideas? for|how (should|can) (i|we)|make a plan|weekly plan)\b",
        re.IGNORECASE,
    ),
    "edit_request": re.compile(
        r"\b(make it|make them|change|adjust|modify|lighter|heavier|more|less|"
        r"add|remove|focus on|less for|more for|"
        r"i (don'?t|can'?t|won'?t|prefer not|don'?t want|don'?t like|don'?t have)|"
        r"not (after|before|in the|at night|in the morning|at that time)|"
        r"instead|skip|replace|without|too (early|late|long|hard|much|far)|"
        r"i prefer|i'?d rather|swap|different|something else)\b",
        re.IGNORECASE,
    ),
    "iman_request": re.compile(
        r"\b(iman|quran|dhikr|dua|pray|prayer|tafsir|sunnah|barakah|"
        r"spiritual|closer to allah|faith|consistency in deen)\b",
        re.IGNORECASE,
    ),
    "cleaning_request": re.compile(
        r"\b(clean|tidy|organi[sz]|declutter|house|apartment|kitchen|bathroom|"
        r"living\s+room|bedroom|fridge|sink|dishes|laundry|trash|garbage|"
        r"counter|floor|table|mess|dirty|dusty|cluttered|"
        r"guests?|company|visitors?)",
        re.IGNORECASE,
    ),
    "situation_request": re.compile(
        r"\b(i (need|want|have got) to\b|we (need|should|must)\b|"
        r"i haven'?t |i (didn'?t|did not) |"
        r"the (house|room|kitchen|bathroom|sink|floor|table|place|apartment) (is|was|has|needs|looks)\b|"
        r"it'?s (dirty|messy|a mess|full of|piled up|a disaster)|"
        r"(full of|piled up|running out of))\b",
        re.IGNORECASE,
    ),
    "goal_statement": re.compile(
        r"^("
        r"my goal is\b|our goal is\b|"
        r"help (me|us) with (my|our) goal\b|"
        r"(i|we) want to (be|become|grow|build|develop|strengthen|improve|keep|stay|practice)\b|"
        r"(i|we) (would|'d) like to (be|become|grow|build|develop|strengthen|improve)\b|"
        r"(i|we) (am|are|'m|'re) trying to (be|become|grow|improve)\b"
        r")",
        re.IGNORECASE,
    ),
}

# Lookup: user is asking what already exists on a given day — do NOT generate new tasks.
_SCHEDULE_LOOKUP_RE = re.compile(
    r'\b(what (do i|do we) (have to |need to )(do|focus on|work on)|'
    r'what (do i|do we) have (today|tomorrow|this week|on \w+day|'
    r'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)|'
    r"what'?s (on my |on the |my )?(schedule|agenda|calendar)|"
    r'(anything|what) (happening|planned|scheduled|on) (today|tomorrow|this week|on \w+day|'
    r'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun))\b',
    re.IGNORECASE,
)

# Suggestion: user wants new task ideas — keep in task mode.
_SCHEDULE_QUERY_RE = re.compile(
    r'\b(what (should i|should we) (have to |need to )?(do|focus on|work on)|'
    r"what'?s (on my |the |my )?(plan)\b)",
    re.IGNORECASE,
)


def is_schedule_lookup(message: str) -> bool:
    """True for 'what do I have to do on Wednesday' — lookup, not task generation."""
    return bool(_SCHEDULE_LOOKUP_RE.search(message))


_TOMORROW_RE = re.compile(r'\btomorrow\b', re.IGNORECASE)


def is_tomorrow_request(message: str) -> bool:
    """True when the user wants multiple task suggestions specifically for tomorrow."""
    return bool(_TOMORROW_RE.search(message)) and not is_single_task_creation(message)


_TASK_INTENTS = {"task_request", "cleaning_request", "edit_request", "situation_request", "goal_statement"}


def classify_intent(message: str) -> tuple[str, float]:
    msg = message.strip()
    if not msg:
        return "unknown", 0.0
    matches: dict[str, float] = {}
    for name, pattern in INTENT_PATTERNS.items():
        m = pattern.search(msg)
        if m:
            matches[name] = len(m.group(0)) / len(msg) + 0.3
    if not matches:
        return "general", 0.5
    return max(matches.items(), key=lambda x: x[1])


# ── request-type detectors ────────────────────────────────────────────────────

_LIGHT_DAY_RE = re.compile(
    r"\b("
    r"light\s+day|easy\s+day|lighter\s+day|simple\s+day|rest\s+day|slow\s+day|"
    r"take\s+it\s+easy(\s+today)?|"
    r"minimal(\s+tasks?)?(\s+today)?|"
    r"not\s+much\s+today|not\s+a\s+lot\s+today|"
    r"want\s+a\s+break(\s+today)?|need\s+a\s+break(\s+today)?|"
    r"move\s+(all\s+)?(my\s+)?tasks?\s+(to\s+)?tomorrow|"
    r"skip\s+(all\s+)?(today'?s?\s+)?tasks?|"
    r"clear\s+(all\s+)?(my\s+)?tasks?\s*(for\s+)?today"
    r")\b",
    re.IGNORECASE,
)


def is_light_day_request(message: str) -> bool:
    return bool(_LIGHT_DAY_RE.search(message))


_TODAY_RE = re.compile(
    r"\b(today|tonight|right now|this morning|this afternoon|this evening|"
    r"quick tasks?|light tasks?|easy tasks?|simple tasks?|a few tasks?|"
    r"quick\s+(tidy|clean|reset)|tidy\s+up|quick\s+reset|reset\s+the|make\s+it\s+presentable|"
    r"coming\s+over|guests?\s+(are\s+)?coming|have\s+company|expecting\s+(guests?|company|someone|visitors?)|"
    r"before\s+(they|she|he|my\s+)?(wife|husband|spouse|partner|mom|dad|guests?)\s+(arrive|comes?|gets?\s+(home|here|back))|"
    r"i\s+have\s+\d+\s+hours?\b|"
    r"full\s+of\s+(dirty|dishes|mess|trash|laundry)|"
    r"now|at the moment|currently|for me now)\b",
    re.IGNORECASE,
)
_RECURRING_RE = re.compile(
    r"\b(routine|schedule|plan|weekly|monthly|daily|recurring)\b",
    re.IGNORECASE,
)
_EVENT_PLAN_RE = re.compile(
    r"\b(mother'?s?\s+day|father'?s?\s+day|birthday|bday|anniversary|"
    r"valentine'?s|eid|ramadan|iftar|suhoor|"
    r"party|get-together|gathering|bbq|cookout|"
    r"trip|travel|vacation|outing|date\s+night|wedding|baby\s+shower|bridal\s+shower)\b",
    re.IGNORECASE,
)
_SPECIFIC_DATE_RE = re.compile(
    r"\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\s+(\d{1,2})\b",
    re.IGNORECASE,
)
_ONE_TASK_CREATE_RE = re.compile(
    r"\b(create|add|make|set)\s+(a\s+|one\s+)?task\b",
    re.IGNORECASE,
)
_RELATIVE_OR_SPECIFIC_DATE_RE = re.compile(
    r"\b("
    r"today|tomorrow|tonight|"
    r"next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|"
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\s+\d{1,2}"
    r")\b",
    re.IGNORECASE,
)
_EXPLICIT_RECURRING_RE = re.compile(
    r"\b(daily|weekly|monthly|recurring|routine|every\s+day|every\s+week|"
    r"every\s+month|each\s+day|each\s+week|repeat|repeating)\b",
    re.IGNORECASE,
)
_PLAN_KW_RE = re.compile(
    r"\b(plan|itinerary|ideas?\s+for|help\s+(me|us)\s+plan|"
    r"create\s+a\s+(plan|schedule|itinerary)|prepare\s+(for|a)|get\s+ready\s+for|planning)\b",
    re.IGNORECASE,
)
_MOTHERS_DAY_RE = re.compile(r"\bmother'?s?\s*day\b", re.IGNORECASE)
_FATHERS_DAY_RE = re.compile(r"\bfather'?s?\s*day\b", re.IGNORECASE)


def is_single_task_creation(message: str) -> bool:
    return bool(_ONE_TASK_CREATE_RE.search(message))


def is_one_off_dated_task(message: str) -> bool:
    return (
        is_single_task_creation(message)
        and bool(_RELATIVE_OR_SPECIFIC_DATE_RE.search(message))
        and not bool(_EXPLICIT_RECURRING_RE.search(message))
    )


def is_today_request(message: str) -> bool:
    return (
        (bool(_TODAY_RE.search(message)) and not bool(_RECURRING_RE.search(message)))
        or is_one_off_dated_task(message)
    )


def is_event_plan_request(message: str) -> bool:
    """True when user explicitly wants a multi-task plan for an event/holiday."""
    has_plan = bool(_PLAN_KW_RE.search(message))
    has_holiday = bool(_EVENT_PLAN_RE.search(message))
    has_date = bool(_SPECIFIC_DATE_RE.search(message))
    return (has_holiday or has_date) and has_plan


def has_event_target_date(message: str) -> bool:
    """True when message references a holiday or specific date without necessarily asking for a full plan."""
    return bool(_EVENT_PLAN_RE.search(message)) or bool(_SPECIFIC_DATE_RE.search(message))


def is_islamic_holiday_request(message: str) -> bool:
    """True when the message mentions an Islamic lunar holiday (dates are approximate)."""
    return any(h.pattern.search(message) for h in _ISLAMIC_HOLIDAYS)


def is_birthday_without_date(message: str) -> bool:
    """True when the message mentions a birthday/anniversary but no specific date is given.
    Mother's Day / Father's Day are excluded because their date is computable."""
    if not re.search(r'\b(birthday|bday|anniversary)\b', message, re.IGNORECASE):
        return False
    if _MOTHERS_DAY_RE.search(message) or _FATHERS_DAY_RE.search(message):
        return False
    return not bool(_SPECIFIC_DATE_RE.search(message))


_CALENDAR_RE = re.compile(
    r'\b(add\s+to\s+(my\s+)?calendar|schedule\s+(an?\s+)?event|put.*in\s+(my\s+)?calendar|'
    r'calendar\s+event|create\s+(an?\s+)?event|add\s+(an?\s+)?event|book.*calendar|'
    r'add.*appointment|schedule.*appointment|remind.*calendar)\b',
    re.IGNORECASE,
)


def is_calendar_request(message: str) -> bool:
    return bool(_CALENDAR_RE.search(message))


def should_generate_tasks(message: str) -> bool:
    if _SCHEDULE_LOOKUP_RE.search(message):
        return False
    intent, _ = classify_intent(message)
    if intent in _TASK_INTENTS:
        return True
    if _SCHEDULE_QUERY_RE.search(message):
        return True
    if intent == "iman_request":
        return bool(_IMAN_TASK_RE.search(message))
    if is_event_plan_request(message) or has_event_target_date(message):
        return True
    return False


# ── event date helpers ────────────────────────────────────────────────────────

def _event_honoree(message: str, assignable: list[str]) -> str | None:
    """Return the assignable name being celebrated, to exclude from task assignees."""
    if _MOTHERS_DAY_RE.search(message):
        for name in assignable:
            if name.lower() in ("mom", "mother", "mama", "mum"):
                return name
    if _FATHERS_DAY_RE.search(message):
        for name in assignable:
            if name.lower() in ("dad", "father", "papa", "baba"):
                return name
    return None


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """nth occurrence (1-based) of weekday (0=Mon…6=Sun) in the given month."""
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + (n - 1) * 7)


def _day_label(d: date, approximate: bool = False) -> str:
    """Short label for use in the task time field: 'Wed May 6'."""
    label = f"{d.strftime('%a')} {d.strftime('%b')} {d.day}"
    return f"{label} (may vary)" if approximate else label


_MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}

_NEW_YEAR_RE = re.compile(r"\bnew\s+year'?s?\b", re.IGNORECASE)

_IMAN_TASK_RE = re.compile(
    r"\b(plan|help|suggest|routine|tasks?|what should|how (can|do))\b",
    re.IGNORECASE,
)

@dataclass(frozen=True)
class _GregorianHoliday:
    pattern: re.Pattern
    month: int
    day: int


@dataclass(frozen=True)
class _IslamicHoliday:
    pattern: re.Pattern
    hijri_month: int
    hijri_day: int
    duration_days: int


# Fixed Gregorian holidays — patterns compiled once.
_FIXED_GREGORIAN_HOLIDAYS: list[_GregorianHoliday] = [
    _GregorianHoliday(re.compile(r"\bvalentine'?s?\s*(day)?\b", re.IGNORECASE), 2, 14),
]

# Islamic holidays mapped to Hijri dates.
# Order matters — more specific patterns must come before generic ones.
_ISLAMIC_HOLIDAYS: list[_IslamicHoliday] = [
    _IslamicHoliday(re.compile(r"\b(ramadan|ramzan|ramadhan|start\s+of\s+ramadan|first\s+day\s+of\s+ramadan)\b", re.IGNORECASE), 9, 1, 30),
    _IslamicHoliday(re.compile(r"\b(last\s+10\s+nights?|last\s+ten\s+nights?|final\s+10\s+nights?|final\s+ten\s+nights?)\s+(of\s+)?ramadan\b", re.IGNORECASE), 9, 21, 10),
    _IslamicHoliday(re.compile(r"\b(laylat\s+al[- ]?qadr|lailat\s+al[- ]?qadr|night\s+of\s+power|27th\s+night\s+of\s+ramadan)\b", re.IGNORECASE), 9, 27, 1),
    _IslamicHoliday(re.compile(r"\b(eid\s+al[- ]?fitr|eid\s+ul[- ]?fitr|eid\s+fitr|ramadan\s+eid)\b", re.IGNORECASE), 10, 1, 1),
    _IslamicHoliday(re.compile(r"\b(six\s+days\s+of\s+shawwal|6\s+days\s+of\s+shawwal|shawwal\s+fasts?)\b", re.IGNORECASE), 10, 2, 29),
    _IslamicHoliday(re.compile(r"\b(hajj|hajj\s+season|days\s+of\s+hajj)\b", re.IGNORECASE), 12, 8, 6),
    _IslamicHoliday(re.compile(r"\b(day\s+of\s+arafah|arafa|arafat|yawm\s+arafah|yawm\s+arafa)\b", re.IGNORECASE), 12, 9, 1),
    _IslamicHoliday(re.compile(r"\b(eid\s+al[- ]?adha|eid\s+ul[- ]?adha|eid\s+adha|qurbani\s+eid|big\s+eid)\b", re.IGNORECASE), 12, 10, 4),
    _IslamicHoliday(re.compile(r"\b(days\s+of\s+tashreeq|tashreeq)\b", re.IGNORECASE), 12, 11, 3),
    _IslamicHoliday(re.compile(r"\b(islamic\s+new\s+year|hijri\s+new\s+year|new\s+hijri\s+year|1st\s+muharram)\b", re.IGNORECASE), 1, 1, 1),
    _IslamicHoliday(re.compile(r"\b(ashura|ashoora|ashuraa|day\s+of\s+ashura|10th\s+of\s+muharram)\b", re.IGNORECASE), 1, 10, 1),
    _IslamicHoliday(re.compile(r"\b(white\s+days|ayyam\s+al[- ]?beed|13th\s+14th\s+15th)\b", re.IGNORECASE), 1, 13, 3),
    _IslamicHoliday(re.compile(r"\b(rajab|month\s+of\s+rajab)\b", re.IGNORECASE), 7, 1, 30),
    _IslamicHoliday(re.compile(r"\b(sha[''\- ]?ban|shaban|month\s+of\s+shaban)\b", re.IGNORECASE), 8, 1, 30),
    _IslamicHoliday(re.compile(r"\b(mid\s+sha[''\- ]?ban|middle\s+of\s+shaban|nisf\s+sha[''\- ]?ban|15th\s+of\s+shaban)\b", re.IGNORECASE), 8, 15, 1),
    _IslamicHoliday(re.compile(r"\b(rabi\s+al[- ]?awwal|rabiul\s+awwal|rabee\s+al[- ]?awwal)\b", re.IGNORECASE), 3, 1, 30),
    _IslamicHoliday(re.compile(r"\b(mawlid|milad\s+un[- ]?nabi|eid\s+milad|prophet'?s\s+birthday)\b", re.IGNORECASE), 3, 12, 1),
    # Generic "Eid" must be LAST so specific patterns above match first
    _IslamicHoliday(re.compile(r"\beid\b", re.IGNORECASE), 10, 1, 1),
]


def _hijri_to_gregorian_date(hijri_year: int, hijri_month: int, hijri_day: int) -> date:
    g = Hijri(hijri_year, hijri_month, hijri_day).to_gregorian()
    return date(g.year, g.month, g.day)


@functools.lru_cache(maxsize=128)
def _next_islamic_holiday_date(
    hijri_month: int,
    hijri_day: int,
    today: date,
) -> date | None:
    """Return the next Gregorian date for a Hijri month/day, checking current and next Hijri year."""
    if not _HIJRIDATE_AVAILABLE:
        return None
    current_hijri = Gregorian(today.year, today.month, today.day).to_hijri()
    candidates: list[date] = []
    for hijri_year in (current_hijri.year, current_hijri.year + 1):
        try:
            candidates.append(_hijri_to_gregorian_date(hijri_year, hijri_month, hijri_day))
        except ValueError:
            continue
    upcoming = [d for d in candidates if d >= today]
    return min(upcoming) if upcoming else None


def get_event_date(message: str, today: date | None = None) -> date | None:
    """
    Return the target date for a holiday or specific date mentioned in the message.

    Gregorian holidays are computed directly.
    Islamic holidays are computed from Hijri calendar via hijridate.
    Returns None if nothing is detected or the library is unavailable.
    """
    today = today or date.today()
    year = today.year

    # Floating Gregorian holidays
    if _MOTHERS_DAY_RE.search(message):
        d = _nth_weekday(year, 5, 6, 2)    # 2nd Sunday of May
        return d if d >= today else _nth_weekday(year + 1, 5, 6, 2)

    if _FATHERS_DAY_RE.search(message):
        d = _nth_weekday(year, 6, 6, 3)    # 3rd Sunday of June
        return d if d >= today else _nth_weekday(year + 1, 6, 6, 3)

    # New Year always points to the upcoming Jan 1
    if _NEW_YEAR_RE.search(message):
        d = date(year, 1, 1)
        return d if d >= today else date(year + 1, 1, 1)

    # Islamic lunar holidays — computed from Hijri calendar
    for h in _ISLAMIC_HOLIDAYS:
        if h.pattern.search(message):
            return _next_islamic_holiday_date(h.hijri_month, h.hijri_day, today)

    # Fixed Gregorian holidays
    for g in _FIXED_GREGORIAN_HOLIDAYS:
        if g.pattern.search(message):
            d = date(year, g.month, g.day)
            return d if d >= today else date(year + 1, g.month, g.day)

    # Explicit date in message: "May 11", "birthday on March 5"
    m = _SPECIFIC_DATE_RE.search(message)
    if m:
        month_num = _MONTH_MAP.get(m.group(1)[:3].lower())
        if month_num:
            try:
                d = date(year, month_num, int(m.group(2)))
                return d if d >= today else date(year + 1, month_num, int(m.group(2)))
            except ValueError:
                pass

    return None
