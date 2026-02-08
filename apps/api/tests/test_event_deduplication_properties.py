"""
Property-Based Tests for Event Deduplication.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-agent-bugfixes, Property 2: Event creation idempotence**
**Validates: Requirements 2.1, 2.2**
"""

import sys
import os
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest
import pytz
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.maria_tools import MariaTools, BRASILIA_TZ

# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for valid phone numbers (Brazilian format: 10-13 digits)
phone_st = st.from_regex(r"55[1-9][0-9]{9,10}", fullmatch=True)

# Strategy for valid dates
dates_st = st.dates(
    min_value=datetime(2024, 1, 1).date(),
    max_value=datetime(2027, 12, 31).date(),
)

hours_st = st.integers(min_value=0, max_value=23)
minutes_st = st.integers(min_value=0, max_value=59)

# Strategy for offsets within the 30-min window (in minutes)
within_window_offset_st = st.integers(min_value=-29, max_value=29)

# Strategy for offsets outside the 30-min window (in minutes)
outside_window_offset_st = st.one_of(
    st.integers(min_value=31, max_value=180),
    st.integers(min_value=-180, max_value=-31),
)


def _build_brasilia_iso(date, hour, minute):
    """Build a Brasília-offset ISO 8601 string."""
    dt = datetime(date.year, date.month, date.day, hour, minute, 0)
    dt_brt = BRASILIA_TZ.localize(dt)
    return dt_brt.isoformat()


def _fake_supabase_with_event(event_start_iso: str, event_phone: str):
    """
    Create a fake Supabase client that simulates an events table
    containing exactly one event with the given start_time and lead_phone.

    The fake applies the same gte/lte/eq filtering logic that PostgREST would.
    """
    mock_client = MagicMock()

    class FakeResponse:
        def __init__(self, data):
            self.data = data

    class FakeQueryBuilder:
        def __init__(self):
            self._phone_filter = None
            self._gte_filter = None
            self._lte_filter = None

        def select(self, columns):
            return self

        def eq(self, column, value):
            if column == "lead_phone":
                self._phone_filter = value
            return self

        def gte(self, column, value):
            if column == "start_time":
                self._gte_filter = value
            return self

        def lte(self, column, value):
            if column == "start_time":
                self._lte_filter = value
            return self

        def execute(self):
            # Simulate PostgREST filtering
            phone_match = (self._phone_filter == event_phone)
            time_match = True
            if self._gte_filter:
                time_match = time_match and (event_start_iso >= self._gte_filter)
            if self._lte_filter:
                time_match = time_match and (event_start_iso <= self._lte_filter)

            if phone_match and time_match:
                return FakeResponse([{"id": "existing-event-id"}])
            return FakeResponse([])

    mock_client.table.return_value = FakeQueryBuilder()
    return mock_client


def _fake_supabase_empty():
    """Create a fake Supabase client with no events."""
    mock_client = MagicMock()

    class FakeResponse:
        def __init__(self, data):
            self.data = data

    class FakeQueryBuilder:
        def select(self, columns):
            return self
        def eq(self, column, value):
            return self
        def gte(self, column, value):
            return self
        def lte(self, column, value):
            return self
        def execute(self):
            return FakeResponse([])

    mock_client.table.return_value = FakeQueryBuilder()
    return mock_client


# =============================================================================
# Property Tests
# =============================================================================

class TestEventDeduplication:
    """
    **Feature: crm-agent-bugfixes, Property 2: Event creation idempotence**
    **Validates: Requirements 2.1, 2.2**

    For any lead phone number and time range, calling the scheduling
    deduplication check with the same parameters when an event already
    exists SHALL return True, preventing duplicate event creation.
    """

    @settings(max_examples=100)
    @given(
        phone=phone_st,
        date=dates_st,
        hour=hours_st,
        minute=minutes_st,
    )
    def test_exact_same_time_detected_as_duplicate(self, phone, date, hour, minute):
        """
        **Feature: crm-agent-bugfixes, Property 2: Event creation idempotence**
        **Validates: Requirements 2.1, 2.2**

        For any phone and timestamp, if an event already exists at that exact
        time, _event_exists SHALL return True.
        """
        iso_time = _build_brasilia_iso(date, hour, minute)
        tools = MariaTools(lead_id=f"{phone}@s.whatsapp.net")

        fake_client = _fake_supabase_with_event(iso_time, phone)
        with patch("services.maria_tools.create_client", return_value=fake_client):
            assert tools._event_exists(phone, iso_time) is True, (
                f"Exact duplicate not detected for phone={phone}, time={iso_time}"
            )

    @settings(max_examples=100)
    @given(
        phone=phone_st,
        date=dates_st,
        hour=hours_st,
        minute=minutes_st,
    )
    def test_no_event_returns_false(self, phone, date, hour, minute):
        """
        **Feature: crm-agent-bugfixes, Property 2: Event creation idempotence**
        **Validates: Requirements 2.1, 2.2**

        For any phone and timestamp, if no event exists, _event_exists
        SHALL return False.
        """
        iso_time = _build_brasilia_iso(date, hour, minute)
        tools = MariaTools(lead_id=f"{phone}@s.whatsapp.net")

        fake_client = _fake_supabase_empty()
        with patch("services.maria_tools.create_client", return_value=fake_client):
            assert tools._event_exists(phone, iso_time) is False, (
                f"False positive duplicate for phone={phone}, time={iso_time}"
            )

    @settings(max_examples=100)
    @given(
        phone=phone_st,
        date=dates_st,
        hour=hours_st,
        minute=minutes_st,
        offset_minutes=within_window_offset_st,
    )
    def test_event_within_30min_window_detected(self, phone, date, hour, minute, offset_minutes):
        """
        **Feature: crm-agent-bugfixes, Property 2: Event creation idempotence**
        **Validates: Requirements 2.1, 2.2**

        For any phone and timestamp, if an existing event's start_time is
        within 30 minutes of the query time, _event_exists SHALL return True.
        """
        query_time = _build_brasilia_iso(date, hour, minute)
        # The existing event is offset_minutes away from the query time
        dt_query = datetime.fromisoformat(query_time)
        dt_existing = dt_query + timedelta(minutes=offset_minutes)
        existing_time = dt_existing.isoformat()

        tools = MariaTools(lead_id=f"{phone}@s.whatsapp.net")

        fake_client = _fake_supabase_with_event(existing_time, phone)
        with patch("services.maria_tools.create_client", return_value=fake_client):
            assert tools._event_exists(phone, query_time) is True, (
                f"Event {offset_minutes}min away not detected as duplicate. "
                f"Query: {query_time}, Existing: {existing_time}"
            )

    @settings(max_examples=100)
    @given(
        phone=phone_st,
        date=dates_st,
        hour=hours_st,
        minute=minutes_st,
        offset_minutes=outside_window_offset_st,
    )
    def test_event_outside_30min_window_not_detected(self, phone, date, hour, minute, offset_minutes):
        """
        **Feature: crm-agent-bugfixes, Property 2: Event creation idempotence**
        **Validates: Requirements 2.1, 2.2**

        For any phone and timestamp, if an existing event's start_time is
        more than 30 minutes from the query time, _event_exists SHALL return False.
        """
        query_time = _build_brasilia_iso(date, hour, minute)
        dt_query = datetime.fromisoformat(query_time)
        dt_existing = dt_query + timedelta(minutes=offset_minutes)
        existing_time = dt_existing.isoformat()

        tools = MariaTools(lead_id=f"{phone}@s.whatsapp.net")

        fake_client = _fake_supabase_with_event(existing_time, phone)
        with patch("services.maria_tools.create_client", return_value=fake_client):
            assert tools._event_exists(phone, query_time) is False, (
                f"Event {offset_minutes}min away wrongly detected as duplicate. "
                f"Query: {query_time}, Existing: {existing_time}"
            )
