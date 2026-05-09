import pytest
from prompt import build_system_prompt
from intent import _event_honoree


def test_mothers_day_prompt_spreads_tasks_by_day(sample_chat_request):
    sample_chat_request.message = "I'm Dad and I want to plan for Mother's Day"

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=[],
        kb_docs=[],
    )

    assert "Spread tasks across these available days" in prompt or \
           "Spread tasks across these days" in prompt


def test_fathers_day_honoree_is_dad():
    assignable = ["Mom", "Dad"]

    honoree = _event_honoree("help me plan Father's Day", assignable)

    assert honoree == "Dad"


def test_mothers_day_honoree_is_mom():
    assignable = ["Mom", "Dad"]

    honoree = _event_honoree("help me plan Mother's Day", assignable)

    assert honoree == "Mom"


@pytest.mark.parametrize(
    "message",
    [
        "create a birthday plan",
        "plan Eid gathering",
        "create a wedding plan",
        "help us plan a baby shower",
    ],
)
def test_events_without_parent_honoree_do_not_exclude_assignee(message):
    assignable = ["Mom", "Dad"]

    honoree = _event_honoree(message, assignable)

    assert honoree is None


@pytest.mark.parametrize(
    "message",
    [
        "help me plan Father's Day",
        "plan Eid gathering",
        "create a trip plan",
        "plan a wedding",
    ],
)
def test_event_plans_are_not_broad_recurring_plans(sample_chat_request, message):
    sample_chat_request.message = message

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=[],
        kb_docs=[],
    )

    assert "EVENT PLAN:" in prompt
    assert "frequency='once'" in prompt
    assert "BROAD PLANNING request" not in prompt
    assert "3 daily + 4 weekly + 1 monthly" not in prompt


def test_birthday_plan_without_date_asks_for_date(sample_chat_request):
    sample_chat_request.message = "create a birthday plan"

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=[],
        kb_docs=[],
    )

    assert "BIRTHDAY/ANNIVERSARY DATE UNKNOWN" in prompt
    assert "EVENT PLAN REQUEST" not in prompt
