"""
Property-Based Tests for response time computation correctness.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: realtime-lead-classification, Property 9: Response time computation correctness**
**Validates: Requirements 7.1**
"""

import sys
import os
from datetime import datetime, timezone, timedelta

import pytest
import pandas as pd
from hypothesis import given, settings, assume, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.analytics_computations import compute_response_times


# =============================================================================
# Strategies / Generators
# =============================================================================

sender_types = st.sampled_from(["lead", "ai"])


def message_strategy():
    """Generate a single message dict with valid fields."""
    return st.fixed_dictionaries({
        "sender_type": sender_types,
        "created_at": st.datetimes(
            min_value=datetime(2025, 1, 1),
            max_value=datetime(2026, 2, 1),
            timezones=st.just(timezone.utc),
        ).map(lambda d: d.isoformat()),
        "conversation_id": st.sampled_from(["conv-1", "conv-2", "conv-3"]),
    })


def messages_list_strategy(min_size=2, max_size=50):
    """Generate a list of message dicts."""
    return st.lists(message_strategy(), min_size=min_size, max_size=max_size)


def alternating_messages_strategy():
    """
    Generate messages that alternate lead→ai within a single conversation,
    guaranteeing at least one lead→ai pair exists.
    """
    return st.integers(min_value=1, max_value=10).flatmap(
        lambda n: st.lists(
            st.floats(min_value=1.0, max_value=500.0, allow_nan=False, allow_infinity=False),
            min_size=n,
            max_size=n,
        ).map(lambda deltas: _build_alternating(deltas))
    )


def _build_alternating(deltas):
    """Build alternating lead/ai messages with given time deltas."""
    base = datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    messages = []
    current = base
    for i, delta in enumerate(deltas):
        sender = "lead" if i % 2 == 0 else "ai"
        messages.append({
            "sender_type": sender,
            "created_at": current.isoformat(),
            "conversation_id": "conv-1",
        })
        current = current + timedelta(seconds=delta)
    # Ensure we end with an ai message if we have an odd count
    if len(messages) % 2 == 1:
        messages.append({
            "sender_type": "ai",
            "created_at": current.isoformat(),
            "conversation_id": "conv-1",
        })
    return messages


def _has_any_pair(messages):
    """Check if sorted messages contain at least one lead→ai or ai→lead pair."""
    df = pd.DataFrame(messages)
    df["created_at"] = pd.to_datetime(df["created_at"], format="ISO8601", utc=True)
    df = df.sort_values(["conversation_id", "created_at"])
    for conv_id, group in df.groupby("conversation_id"):
        group = group.reset_index(drop=True)
        for i in range(len(group) - 1):
            cur = group.iloc[i]["sender_type"]
            nxt = group.iloc[i + 1]["sender_type"]
            if (cur == "lead" and nxt == "ai") or (cur == "ai" and nxt == "lead"):
                return True
    return False


# =============================================================================
# Property 9: Response time computation correctness
# **Feature: realtime-lead-classification, Property 9: Response time computation correctness**
# **Validates: Requirements 7.1**
# =============================================================================

class TestResponseTimeComputationCorrectness:
    """
    **Feature: realtime-lead-classification, Property 9: Response time computation correctness**
    **Validates: Requirements 7.1**
    """

    @settings(max_examples=100)
    @given(messages=messages_list_strategy())
    def test_ai_avg_seconds_non_negative(self, messages):
        """
        **Feature: realtime-lead-classification, Property 9: Response time computation correctness**
        **Validates: Requirements 7.1**

        For any DataFrame of messages with valid sender_type, created_at,
        and conversation_id columns, ai_avg_seconds SHALL be >= 0.
        """
        df = pd.DataFrame(messages)
        result = compute_response_times(df)

        assert result["ai_avg_seconds"] >= 0, (
            f"ai_avg_seconds should be non-negative, got {result['ai_avg_seconds']}"
        )

    @settings(max_examples=100)
    @given(messages=messages_list_strategy())
    def test_lead_avg_minutes_non_negative(self, messages):
        """
        **Feature: realtime-lead-classification, Property 9: Response time computation correctness**
        **Validates: Requirements 7.1**

        For any DataFrame of messages with valid sender_type, created_at,
        and conversation_id columns, lead_avg_minutes SHALL be >= 0.
        """
        df = pd.DataFrame(messages)
        result = compute_response_times(df)

        assert result["lead_avg_minutes"] >= 0, (
            f"lead_avg_minutes should be non-negative, got {result['lead_avg_minutes']}"
        )

    @settings(max_examples=100)
    @given(messages=alternating_messages_strategy())
    def test_history_non_empty_when_pairs_exist(self, messages):
        """
        **Feature: realtime-lead-classification, Property 9: Response time computation correctness**
        **Validates: Requirements 7.1**

        For any DataFrame with valid message pairs (lead→ai or ai→lead),
        the history list SHALL contain at least one entry.
        """
        assume(len(messages) >= 2)
        df = pd.DataFrame(messages)
        assume(_has_any_pair(messages))

        result = compute_response_times(df)

        assert len(result["history"]) >= 1, (
            f"history should have at least 1 entry when valid pairs exist, "
            f"got {len(result['history'])}"
        )

    @settings(max_examples=100)
    @given(messages=messages_list_strategy())
    def test_result_has_required_keys(self, messages):
        """
        **Feature: realtime-lead-classification, Property 9: Response time computation correctness**
        **Validates: Requirements 7.1**

        For any input, the result SHALL always contain ai_avg_seconds,
        lead_avg_minutes, and history keys.
        """
        df = pd.DataFrame(messages)
        result = compute_response_times(df)

        assert "ai_avg_seconds" in result
        assert "lead_avg_minutes" in result
        assert "history" in result
        assert isinstance(result["history"], list)
