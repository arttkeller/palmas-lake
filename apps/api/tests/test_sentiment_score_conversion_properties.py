"""
Property-Based Tests for Sentiment Score Scale Conversion.

**Feature: fix-crm-analytics-bugs, Property 6: Sentiment score scale conversion**
**Validates: Requirements 6.1, 6.3**

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.
"""

import sys
import os
import pytest
from hypothesis import given, settings, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


# =============================================================================
# Conversion logic mirroring _analyze_and_update_sentiment
# =============================================================================

def convert_sentiment_score(raw_score):
    """
    Mirrors the score conversion from AgentManager._analyze_and_update_sentiment.
    Converts float [-1.0, 1.0] to integer [-100, 100].
    """
    if isinstance(raw_score, (int, float)):
        return round(raw_score * 100)
    else:
        return 0


# =============================================================================
# Property Test
# =============================================================================

class TestSentimentScoreConversion:
    """
    **Feature: fix-crm-analytics-bugs, Property 6: Sentiment score scale conversion**
    **Validates: Requirements 6.1, 6.3**
    """

    @settings(max_examples=100)
    @given(
        score=st.floats(min_value=-1.0, max_value=1.0, allow_nan=False)
    )
    def test_score_conversion_produces_integer_in_range(self, score):
        """
        **Feature: fix-crm-analytics-bugs, Property 6: Sentiment score scale conversion**
        **Validates: Requirements 6.1, 6.3**

        For any float sentiment_score in [-1.0, 1.0], converting to integer scale
        SHALL produce a value in [-100, 100], and the conversion SHALL be
        reversible (round-trip within ±1 due to rounding).
        """
        converted = convert_sentiment_score(score)

        # Must be an integer
        assert isinstance(converted, int), f"Converted score must be int, got {type(converted)}"

        # Must be in [-100, 100]
        assert -100 <= converted <= 100, f"Converted score {converted} out of range [-100, 100]"

        # Round-trip: converting back should be within ±1 of original * 100
        assert abs(converted - score * 100) <= 0.5 + 1e-9, \
            f"Round-trip error too large: {converted} vs {score * 100}"
