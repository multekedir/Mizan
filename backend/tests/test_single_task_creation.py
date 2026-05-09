import json
import pytest

from assistant import _parse
from intent import is_one_off_dated_task, is_single_task_creation
from prompt import build_system_prompt


@pytest.mark.parametrize(
    "message",
    [
        "create a task for tomorrow to clean bathroom",
        "create a task for next Monday to call the doctor",
        "add a task for next Friday to pay rent",
        "make a task this Tuesday to buy groceries",
        "set a task on May 11 to order flowers",
        "create one task for tomorrow to message my sister",
    ],
)
def test_dated_single_task_creation_is_once(message):
    assert is_single_task_creation(message) is True
    assert is_one_off_dated_task(message) is True


@pytest.mark.parametrize(
    "message",
    [
        "create a weekly task to clean bathroom",
        "add a recurring task to pay rent",
        "make a daily task to read Quran",
        "set a monthly task to check filters",
        "create a routine for cleaning",
    ],
)
def test_explicit_recurring_task_creation_is_not_one_off(message):
    assert is_one_off_dated_task(message) is False


@pytest.mark.parametrize(
    "message",
    [
        "create a task for next Monday to clean bathroom",
        "create a task for next Monday to call the doctor",
        "create a task for tomorrow to buy groceries",
        "create a task for May 11 to order flowers",
    ],
)
def test_single_task_creation_does_not_trigger_broad_plan(sample_chat_request, message):
    sample_chat_request.message = message

    prompt = build_system_prompt(
        req=sample_chat_request,
        notes=[],
        kb_docs=[],
    )

    assert "BROAD PLANNING request" not in prompt
    assert "3 daily + 4 weekly + 1 monthly" not in prompt
    assert "Do NOT use 'once'" not in prompt


def test_single_task_creation_parses_as_once():
    raw = json.dumps(
        {
            "message": "Added one task for next Monday.",
            "tasks": [
                {
                    "title": "Call the doctor",
                    "assignee": "Dad",
                    "frequency": "once",
                    "day": None,
                    "time": "Mon May 11",
                    "duration": "10 min",
                }
            ],
            "memory_updates": [],
        }
    )

    _, tasks, _, _ = _parse(raw, members=["Mom", "Dad"])

    assert len(tasks) == 1
    assert tasks[0].title == "Call the doctor"
    assert tasks[0].frequency == "once"
    assert tasks[0].time == "Mon May 11"
