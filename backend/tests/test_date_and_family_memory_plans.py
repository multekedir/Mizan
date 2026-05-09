import json
import pytest

from assistant import _parse
from intent import is_event_plan_request, should_generate_tasks
from prompt import build_system_prompt


# ---------------------------------------------------------------------
# Date-specific plans
# ---------------------------------------------------------------------

@pytest.mark.parametrize(
    "message",
    [
        "create a plan for May 11",
        "create a plan for date May 11",
        "help me plan for May 11",
        "make a plan for Monday May 11",
    ],
)
def test_specific_calendar_date_plan_generates_tasks(message):
    assert should_generate_tasks(message) is True


@pytest.mark.parametrize(
    "message",
    [
        "create a plan for May 11",
        "create a plan for date May 11",
        "help me plan for May 11",
        "make a plan for Monday May 11",
    ],
)
def test_specific_calendar_date_is_event_plan(message):
    assert is_event_plan_request(message) is True


def test_specific_date_plan_prompt_mentions_target_date(sample_chat_request):
    sample_chat_request.message = "create a plan for date May 11"

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=[],
        kb_docs=[],
    )

    assert "May 11" in prompt
    assert "once" in prompt.lower()
    assert "daily/weekly/monthly" not in prompt.lower()


# ---------------------------------------------------------------------
# Baby-aware planning
# ---------------------------------------------------------------------

def test_date_plan_uses_baby_context_from_notes(sample_chat_request):
    sample_chat_request.message = "create a plan for date May 11"

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=[
            "We have a baby.",
            "Sister can help with babysitting when needed.",
        ],
        kb_docs=[],
    )

    assert "We have a baby." in prompt
    assert "Sister can help with babysitting when needed." in prompt


def test_baby_plan_expected_model_output_includes_sister_help():
    raw = json.dumps(
        {
            "message": "Here is a May 11 plan that accounts for the baby.",
            "tasks": [
                {
                    "title": "Ask sister if she can help watch the baby during the outing",
                    "assignee": "Dad",
                    "frequency": "once",
                    "day": None,
                    "time": "Mon May 11",
                    "duration": "10 min",
                },
                {
                    "title": "Pack baby bag with diapers, wipes, bottle, and backup clothes",
                    "assignee": "Dad",
                    "frequency": "once",
                    "day": None,
                    "time": "Mon May 11",
                    "duration": "15 min",
                },
            ],
            "memory_updates": [],
        }
    )

    message, tasks, updates, _ = _parse(raw, members=["Mom", "Dad"])

    titles = [t.title.lower() for t in tasks]

    assert "baby" in message.lower()
    assert any("sister" in title and "baby" in title for title in titles)
    assert any("baby bag" in title for title in titles)
    assert all(t.frequency == "once" for t in tasks)
    assert updates == []


# ---------------------------------------------------------------------
# Dad birthday: unknown date should ask first
# ---------------------------------------------------------------------

def test_dad_birthday_without_known_date_should_ask_for_date(sample_chat_request):
    sample_chat_request.message = "create a plan for Dad birthday"

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=[],
        kb_docs=[],
    )

    assert "ask" in prompt.lower() and "date" in prompt.lower() or \
           "do not guess" in prompt.lower()


def test_dad_birthday_with_known_date_can_create_plan(sample_chat_request):
    sample_chat_request.message = "create a plan for Dad birthday"

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=["Dad's birthday is May 11."],
        kb_docs=[],
    )

    assert "Dad's birthday is May 11." in prompt
    assert "EVENT PLAN" in prompt or "once" in prompt.lower()


def test_dad_birthday_date_should_be_remembered_when_user_provides_it():
    raw = json.dumps(
        {
            "message": "Got it — I'll remember Dad's birthday is May 11.",
            "tasks": [],
            "memory_updates": ["Dad's birthday is May 11."],
        }
    )

    message, tasks, updates, _ = _parse(raw, members=["Mom", "Dad"])

    assert "remember" in message.lower()
    assert tasks == []
    assert updates == ["Dad's birthday is May 11."]


# ---------------------------------------------------------------------
# Dad birthday should not assign tasks to Dad if he is the honoree
# ---------------------------------------------------------------------

def test_dad_birthday_plan_should_not_assign_tasks_to_dad():
    raw = json.dumps(
        {
            "message": "Here is Dad's birthday plan.",
            "tasks": [
                {
                    "title": "Buy Dad's birthday gift",
                    "assignee": "Mom",
                    "frequency": "once",
                    "day": None,
                    "time": "Mon May 11",
                    "duration": "30 min",
                },
                {
                    "title": "Ask sister to help with the baby during dinner",
                    "assignee": "Mom",
                    "frequency": "once",
                    "day": None,
                    "time": "Mon May 11",
                    "duration": "10 min",
                },
            ],
            "memory_updates": [],
        }
    )

    _, tasks, _, _ = _parse(raw, members=["Mom", "Dad"])

    assert tasks
    assert all(t.assignee != "Dad" for t in tasks)
    assert any("sister" in t.title.lower() and "baby" in t.title.lower() for t in tasks)
