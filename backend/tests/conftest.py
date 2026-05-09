import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from models import ChatRequest, LiveContext, FamilyMember


@pytest.fixture
def sample_chat_request():
    return ChatRequest(
        message="",
        live_context=LiveContext(
            members=[
                FamilyMember(name="Mom"),
                FamilyMember(name="Dad"),
                FamilyMember(name="Zayd"),
            ],
        ),
    )
