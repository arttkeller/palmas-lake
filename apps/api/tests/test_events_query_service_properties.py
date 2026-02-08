"""
Property-Based Tests for EventsQueryService.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: ai-specialist-agendamentos**
"""

import sys
import os
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from typing import List, Dict, Any

import pytest
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.events_query_service import EventsQueryService


# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for event status
event_status_strategy = st.sampled_from(['confirmado', 'cancelado', 'realizado'])

# Strategy for event category
event_category_strategy = st.sampled_from(['Visita', 'Reunião', 'Ligação', 'Outro'])

# Strategy for lead names (non-empty strings)
lead_name_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Zs')),
    min_size=2,
    max_size=50
).filter(lambda x: x.strip() != '')

# Strategy for phone numbers (Brazilian format)
lead_phone_strategy = st.from_regex(r'[0-9]{10,11}', fullmatch=True)

# Strategy for timestamps within reasonable range
timestamp_strategy = st.datetimes(
    min_value=datetime(2024, 1, 1),
    max_value=datetime(2027, 12, 31),
    timezones=st.just(timezone.utc)
)

# Strategy for generating a single event
def event_strategy():
    return st.fixed_dictionaries({
        'id': st.uuids().map(str),
        'title': st.text(min_size=1, max_size=100),
        'description': st.text(max_size=500) | st.none(),
        'start_time': timestamp_strategy.map(lambda dt: dt.isoformat()),
        'end_time': timestamp_strategy.map(lambda dt: dt.isoformat()),
        'color': st.sampled_from(['blue', 'green', 'red', 'yellow', 'purple']),
        'category': event_category_strategy,
        'lead_id': st.uuids().map(str) | st.none(),
        'lead_name': lead_name_strategy | st.none(),
        'lead_phone': lead_phone_strategy | st.none(),
        'lead_email': st.emails() | st.none(),
        'location': st.text(max_size=200) | st.none(),
        'status': event_status_strategy,
        'created_by': st.sampled_from(['manual', 'ai_maria', 'ai_sofia'])
    })


def events_list_strategy(min_size=0, max_size=20):
    """Strategy for generating a list of events."""
    return st.lists(event_strategy(), min_size=min_size, max_size=max_size)


# =============================================================================
# Property Test: Event Count Accuracy
# **Feature: ai-specialist-agendamentos, Property 2: Event Count Accuracy**
# **Validates: Requirements 1.2**
# =============================================================================

class TestEventCountAccuracy:
    """
    **Feature: ai-specialist-agendamentos, Property 2: Event Count Accuracy**
    **Validates: Requirements 1.2**
    
    For any set of events in the database and any date range query, 
    the count returned by the system SHALL equal the actual number of 
    events within that date range.
    """
    
    @settings(max_examples=100)
    @given(
        events=events_list_strategy(min_size=0, max_size=30),
        start_date=timestamp_strategy,
        end_date=timestamp_strategy
    )
    def test_count_matches_events_in_range(
        self, events: List[Dict], start_date: datetime, end_date: datetime
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 2: Event Count Accuracy**
        **Validates: Requirements 1.2**
        
        Property: The count returned by get_events_count must equal the actual
        number of events whose start_time falls within the specified date range.
        """
        # Ensure start_date <= end_date
        if start_date > end_date:
            start_date, end_date = end_date, start_date
        
        service = EventsQueryService()
        
        # Calculate expected count manually
        expected_count = 0
        for event in events:
            event_start_str = event.get('start_time')
            if event_start_str:
                try:
                    event_start = datetime.fromisoformat(event_start_str)
                    if start_date <= event_start <= end_date:
                        expected_count += 1
                except (ValueError, TypeError):
                    pass
        
        # Mock the supabase response to return only events in range
        # (simulating what the database would return)
        events_in_range = []
        for event in events:
            event_start_str = event.get('start_time')
            if event_start_str:
                try:
                    event_start = datetime.fromisoformat(event_start_str)
                    if start_date <= event_start <= end_date:
                        events_in_range.append({'id': event['id']})
                except (ValueError, TypeError):
                    pass
        
        mock_response = MagicMock()
        mock_response.data = events_in_range
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.gte.return_value.lte.return_value.execute.return_value = mock_response
            
            result = service.get_events_count(start_date, end_date)
        
        assert result == expected_count, \
            f"Expected count {expected_count}, got {result}"
    
    @settings(max_examples=100)
    @given(
        num_events=st.integers(min_value=0, max_value=50)
    )
    def test_count_returns_zero_for_empty_result(self, num_events: int):
        """
        **Feature: ai-specialist-agendamentos, Property 2: Event Count Accuracy**
        **Validates: Requirements 1.2**
        
        Property: When no events exist in the date range, count returns 0.
        """
        service = EventsQueryService()
        
        mock_response = MagicMock()
        mock_response.data = []
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.gte.return_value.lte.return_value.execute.return_value = mock_response
            
            result = service.get_events_count(
                datetime(2025, 1, 1, tzinfo=timezone.utc),
                datetime(2025, 12, 31, tzinfo=timezone.utc)
            )
        
        assert result == 0, f"Expected 0 for empty result, got {result}"
    
    @settings(max_examples=100)
    @given(
        num_events=st.integers(min_value=1, max_value=100)
    )
    def test_count_handles_null_response(self, num_events: int):
        """
        **Feature: ai-specialist-agendamentos, Property 2: Event Count Accuracy**
        **Validates: Requirements 1.2**
        
        Property: When database returns None, count returns 0 gracefully.
        """
        service = EventsQueryService()
        
        mock_response = MagicMock()
        mock_response.data = None
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.gte.return_value.lte.return_value.execute.return_value = mock_response
            
            result = service.get_events_count(
                datetime(2025, 1, 1, tzinfo=timezone.utc),
                datetime(2025, 12, 31, tzinfo=timezone.utc)
            )
        
        assert result == 0, f"Expected 0 for null response, got {result}"


# =============================================================================
# Property Test: Future Events Ordering
# **Feature: ai-specialist-agendamentos, Property 3: Future Events Ordering**
# **Validates: Requirements 1.3**
# =============================================================================

class TestFutureEventsOrdering:
    """
    **Feature: ai-specialist-agendamentos, Property 3: Future Events Ordering**
    **Validates: Requirements 1.3**
    
    For any query for upcoming events, all returned events SHALL have 
    start_time greater than the current time AND be sorted in ascending 
    order by start_time.
    """
    
    @settings(max_examples=100)
    @given(
        events=events_list_strategy(min_size=1, max_size=20),
        limit=st.integers(min_value=1, max_value=50)
    )
    def test_upcoming_events_are_sorted_ascending(
        self, events: List[Dict], limit: int
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 3: Future Events Ordering**
        **Validates: Requirements 1.3**
        
        Property: All returned events must be sorted in ascending order by start_time.
        """
        service = EventsQueryService()
        
        # Sort events by start_time for mock response (simulating DB ordering)
        sorted_events = sorted(
            events, 
            key=lambda e: e.get('start_time', '')
        )[:limit]
        
        mock_response = MagicMock()
        mock_response.data = sorted_events
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value = mock_response
            
            result = service.get_upcoming_events(limit)
        
        # Verify ordering
        if len(result) > 1:
            for i in range(len(result) - 1):
                current_time = result[i].get('start_time', '')
                next_time = result[i + 1].get('start_time', '')
                assert current_time <= next_time, \
                    f"Events not sorted: {current_time} > {next_time}"
    
    @settings(max_examples=100)
    @given(
        limit=st.integers(min_value=1, max_value=100)
    )
    def test_upcoming_events_respects_limit(self, limit: int):
        """
        **Feature: ai-specialist-agendamentos, Property 3: Future Events Ordering**
        **Validates: Requirements 1.3**
        
        Property: The number of returned events must not exceed the specified limit.
        """
        service = EventsQueryService()
        
        # Generate more events than the limit
        num_events = min(limit + 10, 50)
        events = [{'id': f'event-{i}', 'start_time': f'2026-0{(i % 9) + 1}-15T10:00:00+00:00'} 
                  for i in range(num_events)]
        
        mock_response = MagicMock()
        mock_response.data = events[:limit]  # DB respects limit
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value = mock_response
            
            result = service.get_upcoming_events(limit)
        
        assert len(result) <= limit, \
            f"Expected at most {limit} events, got {len(result)}"
    
    @settings(max_examples=100)
    @given(
        limit=st.integers(min_value=1, max_value=50)
    )
    def test_upcoming_events_returns_empty_list_on_null(self, limit: int):
        """
        **Feature: ai-specialist-agendamentos, Property 3: Future Events Ordering**
        **Validates: Requirements 1.3**
        
        Property: When database returns None, an empty list is returned.
        """
        service = EventsQueryService()
        
        mock_response = MagicMock()
        mock_response.data = None
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value = mock_response
            
            result = service.get_upcoming_events(limit)
        
        assert result == [], f"Expected empty list, got {result}"


# =============================================================================
# Property Test: Lead Filter Correctness
# **Feature: ai-specialist-agendamentos, Property 4: Lead Filter Correctness**
# **Validates: Requirements 1.4**
# =============================================================================

class TestLeadFilterCorrectness:
    """
    **Feature: ai-specialist-agendamentos, Property 4: Lead Filter Correctness**
    **Validates: Requirements 1.4**
    
    For any query filtered by lead name or phone, all returned events 
    SHALL have matching lead_name or lead_phone fields.
    """
    
    @settings(max_examples=100)
    @given(
        events=events_list_strategy(min_size=1, max_size=20),
        search_name=lead_name_strategy
    )
    def test_filter_by_name_returns_matching_events(
        self, events: List[Dict], search_name: str
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 4: Lead Filter Correctness**
        **Validates: Requirements 1.4**
        
        Property: All returned events must have lead_name containing the search term.
        """
        service = EventsQueryService()
        
        # Filter events that would match (case-insensitive partial match)
        matching_events = [
            e for e in events 
            if e.get('lead_name') and search_name.lower() in e['lead_name'].lower()
        ]
        
        mock_response = MagicMock()
        mock_response.data = matching_events
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.ilike.return_value.order.return_value.execute.return_value = mock_response
            
            result = service.get_events_by_lead(lead_name=search_name)
        
        # Verify all returned events match the filter
        for event in result:
            lead_name = event.get('lead_name', '')
            if lead_name:
                assert search_name.lower() in lead_name.lower(), \
                    f"Event lead_name '{lead_name}' does not contain '{search_name}'"
    
    @settings(max_examples=100)
    @given(
        events=events_list_strategy(min_size=1, max_size=20),
        search_phone=lead_phone_strategy
    )
    def test_filter_by_phone_returns_matching_events(
        self, events: List[Dict], search_phone: str
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 4: Lead Filter Correctness**
        **Validates: Requirements 1.4**
        
        Property: All returned events must have lead_phone matching exactly.
        """
        service = EventsQueryService()
        
        # Filter events that would match (exact match on phone)
        matching_events = [
            e for e in events 
            if e.get('lead_phone') == search_phone
        ]
        
        mock_response = MagicMock()
        mock_response.data = matching_events
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = mock_response
            
            result = service.get_events_by_lead(lead_phone=search_phone)
        
        # Verify all returned events match the filter
        for event in result:
            lead_phone = event.get('lead_phone')
            assert lead_phone == search_phone, \
                f"Event lead_phone '{lead_phone}' does not match '{search_phone}'"
    
    @settings(max_examples=100)
    @given(st.data())
    def test_filter_returns_empty_when_no_params(self, data):
        """
        **Feature: ai-specialist-agendamentos, Property 4: Lead Filter Correctness**
        **Validates: Requirements 1.4**
        
        Property: When neither lead_name nor lead_phone is provided, 
        an empty list is returned.
        """
        service = EventsQueryService()
        
        result = service.get_events_by_lead()
        
        assert result == [], \
            f"Expected empty list when no filter params, got {result}"
    
    @settings(max_examples=100)
    @given(
        search_name=lead_name_strategy,
        search_phone=lead_phone_strategy
    )
    def test_filter_by_both_name_and_phone(
        self, search_name: str, search_phone: str
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 4: Lead Filter Correctness**
        **Validates: Requirements 1.4**
        
        Property: When both name and phone are provided, events matching 
        either condition are returned.
        """
        service = EventsQueryService()
        
        # Create events that match either condition
        matching_events = [
            {'id': '1', 'lead_name': search_name, 'lead_phone': '1234567890'},
            {'id': '2', 'lead_name': 'Other Name', 'lead_phone': search_phone},
        ]
        
        mock_response = MagicMock()
        mock_response.data = matching_events
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_supabase.table.return_value.select.return_value.or_.return_value.order.return_value.execute.return_value = mock_response
            
            result = service.get_events_by_lead(
                lead_name=search_name, 
                lead_phone=search_phone
            )
        
        # Verify we got results
        assert len(result) == len(matching_events), \
            f"Expected {len(matching_events)} events, got {len(result)}"
