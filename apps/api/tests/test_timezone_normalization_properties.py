"""
Property-Based Tests for Timezone Normalization.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-agent-bugfixes, Property 1: Timezone normalization preserves local hour**
**Validates: Requirements 1.1, 1.3**
"""

import sys
import os
from datetime import datetime, timezone, timedelta

import pytest
import pytz
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.maria_tools import MariaTools, BRASILIA_TZ

# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for hours (0-23) and minutes (0-59)
hours_st = st.integers(min_value=0, max_value=23)
minutes_st = st.integers(min_value=0, max_value=59)

# Strategy for valid dates
dates_st = st.dates(
    min_value=datetime(2024, 1, 1).date(),
    max_value=datetime(2027, 12, 31).date(),
)


def _build_naive_iso(date, hour, minute):
    """Build a naive ISO 8601 string (no timezone info)."""
    dt = datetime(date.year, date.month, date.day, hour, minute, 0)
    return dt.isoformat()


def _build_utc_iso(date, hour, minute, use_z=True):
    """Build a UTC ISO 8601 string (with Z or +00:00)."""
    dt = datetime(date.year, date.month, date.day, hour, minute, 0)
    if use_z:
        return dt.isoformat() + "Z"
    return dt.isoformat() + "+00:00"


# =============================================================================
# Property Test
# =============================================================================

class TestTimezoneNormalization:
    """
    **Feature: crm-agent-bugfixes, Property 1: Timezone normalization preserves local hour**
    **Validates: Requirements 1.1, 1.3**

    For any naive ISO 8601 datetime string representing a time in Brasília,
    normalizing it SHALL produce a timestamp where the local hour matches
    the input hour, and the offset is -03:00.
    """

    @settings(max_examples=100)
    @given(date=dates_st, hour=hours_st, minute=minutes_st)
    def test_naive_input_preserves_local_hour(self, date, hour, minute):
        """
        **Feature: crm-agent-bugfixes, Property 1: Timezone normalization preserves local hour**
        **Validates: Requirements 1.1, 1.3**

        For any naive datetime, the local hour in the output must equal the input hour
        because naive strings are assumed to be Brasília local time.
        """
        iso_in = _build_naive_iso(date, hour, minute)
        iso_out = MariaTools._ensure_brasilia_tz(iso_in)

        dt_out = datetime.fromisoformat(iso_out)

        assert dt_out.hour == hour, (
            f"Naive input hour {hour} was changed to {dt_out.hour}. "
            f"Input: {iso_in}, Output: {iso_out}"
        )
        assert dt_out.minute == minute
        # Offset must be -03:00 (standard) or -02:00 (DST, rare post-2019)
        offset = dt_out.utcoffset()
        assert offset in (timedelta(hours=-3), timedelta(hours=-2)), (
            f"Expected Brasília offset, got {offset}. Output: {iso_out}"
        )

    @settings(max_examples=100)
    @given(date=dates_st, hour=hours_st, minute=minutes_st, use_z=st.booleans())
    def test_utc_input_converts_correctly(self, date, hour, minute, use_z):
        """
        **Feature: crm-agent-bugfixes, Property 1: Timezone normalization preserves local hour**
        **Validates: Requirements 1.1, 1.3**

        For any UTC datetime, converting to Brasília should shift the hour by -3
        (or -2 during DST). The output offset must be -03:00 or -02:00.
        """
        iso_in = _build_utc_iso(date, hour, minute, use_z=use_z)
        iso_out = MariaTools._ensure_brasilia_tz(iso_in)

        dt_out = datetime.fromisoformat(iso_out)

        # Build the expected Brasília time from the UTC input
        dt_utc = datetime(date.year, date.month, date.day, hour, minute, 0,
                          tzinfo=timezone.utc)
        dt_expected = dt_utc.astimezone(BRASILIA_TZ)

        assert dt_out.hour == dt_expected.hour, (
            f"UTC {hour}:00 should become {dt_expected.hour}:00 in Brasília, "
            f"got {dt_out.hour}:00. Input: {iso_in}, Output: {iso_out}"
        )
        offset = dt_out.utcoffset()
        assert offset in (timedelta(hours=-3), timedelta(hours=-2))

    @settings(max_examples=100)
    @given(date=dates_st, hour=hours_st, minute=minutes_st)
    def test_output_is_valid_iso_with_offset(self, date, hour, minute):
        """
        **Feature: crm-agent-bugfixes, Property 1: Timezone normalization preserves local hour**
        **Validates: Requirements 1.3**

        For any input, the output must be a parseable ISO 8601 string with a
        timezone offset (i.e., not naive).
        """
        iso_in = _build_naive_iso(date, hour, minute)
        iso_out = MariaTools._ensure_brasilia_tz(iso_in)

        dt_out = datetime.fromisoformat(iso_out)
        assert dt_out.tzinfo is not None, (
            f"Output should have timezone info. Output: {iso_out}"
        )
