"""
Property-Based Tests for response time calculation correctness.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-agent-bugfixes, Property 6: Response time calculation correctness**
**Validates: Requirements 7.1, 7.3**
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

def conversation_messages_strategy():
    """
    Generate a list of messages for a single conversation that contains
    at least one lead→ai pair.

    Messages alternate between 'lead' and 'ai' sender types with
    increasing timestamps (small positive deltas between 1s and 1000s).
    """
    return st.integers(min_value=2, max_value=20).flatmap(
        lambda n: st.lists(
            st.tuples(
                st.sampled_from(["lead", "ai"]),
                st.floats(min_value=1.0, max_value=1000.0, allow_nan=False, allow_infinity=False),
            ),
            min_size=n,
            max_size=n,
        )
    )


def build_messages_df(msg_specs, conv_id="conv-1", base_time=None):
    """
    Build a messages DataFrame from a list of (sender_type, delta_seconds) tuples.
    Each message timestamp = previous + delta.
    """
    if base_time is None:
        base_time = datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc)

    rows = []
    current_time = base_time
    for sender, delta in msg_specs:
        rows.append({
            "conversation_id": conv_id,
            "sender_type": sender,
            "created_at": current_time.isoformat(),
        })
        current_time = current_time + timedelta(seconds=delta)

    return pd.DataFrame(rows)


def has_lead_ai_pair(msg_specs):
    """Check if the message specs contain at least one lead→ai consecutive pair."""
    for i in range(len(msg_specs) - 1):
        if msg_specs[i][0] == "lead" and msg_specs[i + 1][0] == "ai":
            return True
    return False


# =============================================================================
# Property 6: Response time calculation correctness
# **Feature: crm-agent-bugfixes, Property 6: Response time calculation correctness**
# **Validates: Requirements 7.1, 7.3**
# =============================================================================

class TestResponseTimeCalculation:
    """
    **Feature: crm-agent-bugfixes, Property 6: Response time calculation correctness**
    **Validates: Requirements 7.1, 7.3**
    """

    @settings(max_examples=100)
    @given(msg_specs=conversation_messages_strategy())
    def test_ai_avg_positive_when_lead_ai_pairs_exist(self, msg_specs):
        """
        **Feature: crm-agent-bugfixes, Property 6: Response time calculation correctness**
        **Validates: Requirements 7.1, 7.3**

        For any conversation with at least one lead→ai message pair,
        the average AI response time SHALL be a positive number.
        """
        assume(has_lead_ai_pair(msg_specs))

        df = build_messages_df(msg_specs)
        result = compute_response_times(df)

        assert result["ai_avg_seconds"] > 0, (
            f"ai_avg_seconds should be positive when lead→ai pairs exist, "
            f"got {result['ai_avg_seconds']}"
        )

    @settings(max_examples=100)
    @given(msg_specs=conversation_messages_strategy())
    def test_ai_avg_equals_mean_of_deltas(self, msg_specs):
        """
        **Feature: crm-agent-bugfixes, Property 6: Response time calculation correctness**
        **Validates: Requirements 7.1, 7.3**

        For any conversation, the average AI response time SHALL equal
        the mean of all time deltas between consecutive lead→ai messages.
        """
        assume(has_lead_ai_pair(msg_specs))

        df = build_messages_df(msg_specs)
        result = compute_response_times(df)

        # Manually compute expected deltas
        expected_deltas = []
        for i in range(len(msg_specs) - 1):
            if msg_specs[i][0] == "lead" and msg_specs[i + 1][0] == "ai":
                # The time between msg[i] and msg[i+1] is msg_specs[i][1]
                # because msg[i] is placed at current_time, then current_time += delta[i],
                # so msg[i+1] is at current_time + delta[i]
                expected_deltas.append(msg_specs[i][1])

        if expected_deltas:
            expected_avg = round(sum(expected_deltas) / len(expected_deltas), 1)
            assert result["ai_avg_seconds"] == expected_avg, (
                f"ai_avg_seconds={result['ai_avg_seconds']} != expected={expected_avg}"
            )

    @settings(max_examples=100)
    @given(msg_specs=conversation_messages_strategy())
    def test_history_has_at_least_one_entry_when_pairs_exist(self, msg_specs):
        """
        **Feature: crm-agent-bugfixes, Property 6: Response time calculation correctness**
        **Validates: Requirements 7.1, 7.3**

        For any conversation with valid message pairs, the history
        SHALL contain at least one data point.
        """
        assume(has_lead_ai_pair(msg_specs))

        df = build_messages_df(msg_specs)
        result = compute_response_times(df)

        assert len(result["history"]) >= 1, (
            f"history should have at least 1 entry when pairs exist, "
            f"got {len(result['history'])}"
        )

    @settings(max_examples=100)
    @given(
        msg_specs=st.lists(
            st.tuples(
                st.just("lead"),
                st.floats(min_value=1.0, max_value=100.0, allow_nan=False, allow_infinity=False),
            ),
            min_size=2,
            max_size=10,
        )
    )
    def test_zero_when_no_lead_ai_pairs(self, msg_specs):
        """
        **Feature: crm-agent-bugfixes, Property 6: Response time calculation correctness**
        **Validates: Requirements 7.1, 7.3**

        For any conversation with only lead messages (no ai messages),
        the AI response time SHALL be zero.
        """
        df = build_messages_df(msg_specs)
        result = compute_response_times(df)

        assert result["ai_avg_seconds"] == 0.0, (
            f"ai_avg_seconds should be 0 with no ai messages, got {result['ai_avg_seconds']}"
        )
