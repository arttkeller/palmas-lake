"""
Property-Based Tests for SentimentService.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: fix-lead-messages-display**
"""

import sys
import os
from unittest.mock import MagicMock, patch
import uuid

import pytest
from hypothesis import given, settings, strategies as st, HealthCheck

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.sentiment_service import SentimentService, STATUS_SENTIMENT_MAP


# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for lead IDs (UUIDs)
lead_id_strategy = st.uuids().map(str)

# Strategy for valid status values
status_strategy = st.sampled_from(list(STATUS_SENTIMENT_MAP.keys()))

# Strategy for notes content
notes_strategy = st.one_of(
    st.none(),
    st.just(''),
    st.text(min_size=1, max_size=500)
)

# Strategy for lead data
def lead_data_strategy(status=None, notes=None):
    """Generate lead data with optional fixed status and notes."""
    return st.fixed_dictionaries({
        'id': lead_id_strategy,
        'full_name': st.text(min_size=1, max_size=100),
        'phone': st.text(alphabet=st.sampled_from('0123456789'), min_size=10, max_size=13),
        'status': status if status is not None else status_strategy,
        'notes': notes if notes is not None else notes_strategy,
        'sentiment_score': st.integers(min_value=-100, max_value=100)
    })


# =============================================================================
# Property Test: Sentiment Recalculation on Status Update
# **Feature: fix-lead-messages-display, Property 7: Sentiment recalculation on status update**
# **Validates: Requirements 3.1.1**
# =============================================================================

class TestSentimentRecalculationOnStatusUpdate:
    """
    **Feature: fix-lead-messages-display, Property 7: Sentiment recalculation on status update**
    **Validates: Requirements 3.1.1**
    
    For any lead whose status is updated via API, the sentiment score should be 
    recalculated based on the new status.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        lead_id=lead_id_strategy,
        old_status=status_strategy,
        new_status=status_strategy,
        notes=notes_strategy
    )
    def test_sentiment_recalculated_on_status_update(
        self, lead_id, old_status, new_status, notes
    ):
        """
        **Feature: fix-lead-messages-display, Property 7: Sentiment recalculation on status update**
        **Validates: Requirements 3.1.1**
        
        Property: For any lead whose status is updated, the sentiment score 
        should be recalculated and updated in the database.
        """
        service = SentimentService()
        
        # Create lead data with old status
        lead_data = {
            'id': lead_id,
            'full_name': 'Test Lead',
            'phone': '5511999999999',
            'status': old_status,
            'notes': notes,
            'sentiment_score': 0  # Old sentiment
        }
        
        # Track what sentiment gets updated
        captured_update = None
        
        def capture_update(data):
            nonlocal captured_update
            captured_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [lead_data]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    # For select
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    # For update
                    mock_table_obj.update.side_effect = capture_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call update_on_status_change
            result = service.update_on_status_change(lead_id, new_status)
        
        # Verify update was called
        assert result is True, "update_on_status_change should return True on success"
        assert captured_update is not None, "Sentiment update should have been called"
        
        # Verify sentiment_score was updated
        assert 'sentiment_score' in captured_update, "Update must include sentiment_score field"
        
        # Calculate expected sentiment
        expected_lead = lead_data.copy()
        expected_lead['status'] = new_status
        expected_sentiment = service.calculate_sentiment(expected_lead)
        
        actual_sentiment = captured_update['sentiment_score']
        assert actual_sentiment == expected_sentiment, \
            f"Sentiment should be recalculated based on new status: expected {expected_sentiment}, got {actual_sentiment}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        lead_id=lead_id_strategy,
        new_status=status_strategy
    )
    def test_sentiment_update_returns_false_when_lead_not_found(
        self, lead_id, new_status
    ):
        """
        **Feature: fix-lead-messages-display, Property 7: Sentiment recalculation on status update**
        **Validates: Requirements 3.1.1**
        
        Property: When updating sentiment for a non-existent lead, 
        the method should return False.
        """
        service = SentimentService()
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead not found)
            mock_lead_response = MagicMock()
            mock_lead_response.data = []
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call update_on_status_change with non-existent lead
            result = service.update_on_status_change(lead_id, new_status)
        
        # Verify False is returned when lead not found
        assert result is False, "Should return False when lead not found"


# =============================================================================
# Property Test: Status as Primary Sentiment Indicator
# **Feature: fix-lead-messages-display, Property 8: Status as primary sentiment indicator**
# **Validates: Requirements 3.1.3**
# =============================================================================

class TestStatusAsPrimarySentimentIndicator:
    """
    **Feature: fix-lead-messages-display, Property 8: Status as primary sentiment indicator**
    **Validates: Requirements 3.1.3**
    
    For any sentiment calculation, the status should be the primary factor 
    determining the sentiment score.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        status=status_strategy,
        notes=notes_strategy
    )
    def test_status_determines_base_sentiment(
        self, status, notes
    ):
        """
        **Feature: fix-lead-messages-display, Property 8: Status as primary sentiment indicator**
        **Validates: Requirements 3.1.3**
        
        Property: For any lead, the sentiment score should be primarily determined 
        by the status value according to STATUS_SENTIMENT_MAP.
        """
        service = SentimentService()
        
        lead_data = {
            'id': str(uuid.uuid4()),
            'full_name': 'Test Lead',
            'phone': '5511999999999',
            'status': status,
            'notes': notes
        }
        
        # Calculate sentiment
        sentiment = service.calculate_sentiment(lead_data)
        
        # Get expected base sentiment from status
        expected_base = STATUS_SENTIMENT_MAP.get(status, 0)
        
        # If status has non-zero sentiment, it should be the primary factor
        if expected_base != 0:
            # Sentiment should equal the status-based value (notes don't affect non-neutral status)
            assert sentiment == expected_base, \
                f"For non-neutral status '{status}', sentiment should equal status-based value: expected {expected_base}, got {sentiment}"
        else:
            # For neutral status (0), notes may influence but sentiment should be in range [-30, 30]
            assert -30 <= sentiment <= 30, \
                f"For neutral status '{status}', sentiment should be in range [-30, 30]: got {sentiment}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        status=st.sampled_from(['vendido', 'qualificado', 'perdido', 'visita_agendada']),
        notes=st.text(min_size=10, max_size=500)
    )
    def test_notes_do_not_override_strong_status_sentiment(
        self, status, notes
    ):
        """
        **Feature: fix-lead-messages-display, Property 8: Status as primary sentiment indicator**
        **Validates: Requirements 3.1.3**
        
        Property: For any lead with a strong status sentiment (non-zero), 
        notes content should not override the status-based sentiment.
        """
        service = SentimentService()
        
        # Create two leads with same status but different notes
        lead_with_notes = {
            'id': str(uuid.uuid4()),
            'status': status,
            'notes': notes
        }
        
        lead_without_notes = {
            'id': str(uuid.uuid4()),
            'status': status,
            'notes': ''
        }
        
        # Calculate sentiments
        sentiment_with_notes = service.calculate_sentiment(lead_with_notes)
        sentiment_without_notes = service.calculate_sentiment(lead_without_notes)
        
        # Both should have the same sentiment (status-based)
        expected_sentiment = STATUS_SENTIMENT_MAP.get(status, 0)
        
        assert sentiment_with_notes == expected_sentiment, \
            f"Sentiment with notes should equal status-based value: expected {expected_sentiment}, got {sentiment_with_notes}"
        assert sentiment_without_notes == expected_sentiment, \
            f"Sentiment without notes should equal status-based value: expected {expected_sentiment}, got {sentiment_without_notes}"
        assert sentiment_with_notes == sentiment_without_notes, \
            "Notes should not affect sentiment for non-neutral status"


# =============================================================================
# Property Test: Notes as Secondary Sentiment Indicator
# **Feature: fix-lead-messages-display, Property 9: Notes as secondary sentiment indicator**
# **Validates: Requirements 3.1.4**
# =============================================================================

class TestNotesAsSecondarySentimentIndicator:
    """
    **Feature: fix-lead-messages-display, Property 9: Notes as secondary sentiment indicator**
    **Validates: Requirements 3.1.4**
    
    For any sentiment calculation where the status is neutral, the notes content 
    should influence the final sentiment score.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        neutral_status=st.sampled_from(['new', 'novo_lead', 'transferido'])
    )
    def test_positive_notes_increase_neutral_sentiment(
        self, neutral_status
    ):
        """
        **Feature: fix-lead-messages-display, Property 9: Notes as secondary sentiment indicator**
        **Validates: Requirements 3.1.4**
        
        Property: For any lead with neutral status and positive notes, 
        the sentiment should be positive.
        """
        service = SentimentService()
        
        # Lead with positive notes
        lead_positive = {
            'id': str(uuid.uuid4()),
            'status': neutral_status,
            'notes': 'Cliente muito interessado e entusiasmado com a proposta. Excelente perfil.'
        }
        
        # Lead with no notes
        lead_neutral = {
            'id': str(uuid.uuid4()),
            'status': neutral_status,
            'notes': ''
        }
        
        sentiment_positive = service.calculate_sentiment(lead_positive)
        sentiment_neutral = service.calculate_sentiment(lead_neutral)
        
        # Positive notes should increase sentiment
        assert sentiment_positive > sentiment_neutral, \
            f"Positive notes should increase sentiment: got {sentiment_positive} vs {sentiment_neutral}"
        assert sentiment_positive > 0, \
            f"Sentiment with positive notes should be positive: got {sentiment_positive}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        neutral_status=st.sampled_from(['new', 'novo_lead', 'transferido'])
    )
    def test_negative_notes_decrease_neutral_sentiment(
        self, neutral_status
    ):
        """
        **Feature: fix-lead-messages-display, Property 9: Notes as secondary sentiment indicator**
        **Validates: Requirements 3.1.4**
        
        Property: For any lead with neutral status and negative notes, 
        the sentiment should be negative.
        """
        service = SentimentService()
        
        # Lead with negative notes
        lead_negative = {
            'id': str(uuid.uuid4()),
            'status': neutral_status,
            'notes': 'Cliente não interessado. Recusou a proposta e rejeitou contato.'
        }
        
        # Lead with no notes
        lead_neutral = {
            'id': str(uuid.uuid4()),
            'status': neutral_status,
            'notes': ''
        }
        
        sentiment_negative = service.calculate_sentiment(lead_negative)
        sentiment_neutral = service.calculate_sentiment(lead_neutral)
        
        # Negative notes should decrease sentiment
        assert sentiment_negative < sentiment_neutral, \
            f"Negative notes should decrease sentiment: got {sentiment_negative} vs {sentiment_neutral}"
        assert sentiment_negative < 0, \
            f"Sentiment with negative notes should be negative: got {sentiment_negative}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        neutral_status=st.sampled_from(['new', 'novo_lead', 'transferido']),
        notes=st.text(min_size=1, max_size=500)
    )
    def test_notes_adjustment_bounded(
        self, neutral_status, notes
    ):
        """
        **Feature: fix-lead-messages-display, Property 9: Notes as secondary sentiment indicator**
        **Validates: Requirements 3.1.4**
        
        Property: For any lead with neutral status, notes-based sentiment 
        adjustment should be bounded to a reasonable range.
        """
        service = SentimentService()
        
        lead_data = {
            'id': str(uuid.uuid4()),
            'status': neutral_status,
            'notes': notes
        }
        
        sentiment = service.calculate_sentiment(lead_data)
        
        # Notes adjustment should be bounded (max ±30 from neutral base of 0)
        assert -30 <= sentiment <= 30, \
            f"Notes-based sentiment should be in range [-30, 30]: got {sentiment}"


# =============================================================================
# Property Test: Sentiment Persistence
# **Feature: fix-lead-messages-display, Property 10: Sentiment persistence**
# **Validates: Requirements 3.1.5**
# =============================================================================

class TestSentimentPersistence:
    """
    **Feature: fix-lead-messages-display, Property 10: Sentiment persistence**
    **Validates: Requirements 3.1.5**
    
    For any sentiment calculation that completes, the sentiment_score field 
    in the database should be updated immediately.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        lead_id=lead_id_strategy,
        status=status_strategy,
        notes=notes_strategy
    )
    def test_sentiment_persisted_to_database(
        self, lead_id, status, notes
    ):
        """
        **Feature: fix-lead-messages-display, Property 10: Sentiment persistence**
        **Validates: Requirements 3.1.5**
        
        Property: For any sentiment update, the sentiment_score should be 
        persisted to the database immediately.
        """
        service = SentimentService()
        
        lead_data = {
            'id': lead_id,
            'full_name': 'Test Lead',
            'phone': '5511999999999',
            'status': 'new',  # Old status
            'notes': notes,
            'sentiment_score': 0
        }
        
        # Track database update
        update_called = False
        captured_sentiment = None
        
        def capture_update(data):
            nonlocal update_called, captured_sentiment
            update_called = True
            captured_sentiment = data.get('sentiment_score')
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup
            mock_lead_response = MagicMock()
            mock_lead_response.data = [lead_data]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.update.side_effect = capture_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Update status
            result = service.update_on_status_change(lead_id, status)
        
        # Verify database update was called
        assert result is True, "update_on_status_change should succeed"
        assert update_called is True, "Database update should have been called"
        assert captured_sentiment is not None, "sentiment_score should have been updated"
        
        # Verify the persisted sentiment matches calculated value
        expected_lead = lead_data.copy()
        expected_lead['status'] = status
        expected_sentiment = service.calculate_sentiment(expected_lead)
        
        assert captured_sentiment == expected_sentiment, \
            f"Persisted sentiment should match calculated value: expected {expected_sentiment}, got {captured_sentiment}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        lead_id=lead_id_strategy,
        status=status_strategy
    )
    def test_sentiment_update_is_immediate(
        self, lead_id, status
    ):
        """
        **Feature: fix-lead-messages-display, Property 10: Sentiment persistence**
        **Validates: Requirements 3.1.5**
        
        Property: Sentiment updates should happen immediately (synchronously) 
        during the update_on_status_change call.
        """
        service = SentimentService()
        
        lead_data = {
            'id': lead_id,
            'status': 'new',
            'notes': '',
            'sentiment_score': 0
        }
        
        update_order = []
        
        def track_select(*args):
            update_order.append('select')
            mock_result = MagicMock()
            mock_result.data = [lead_data]
            return mock_result
        
        def track_update(data):
            update_order.append('update')
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.side_effect = track_select
                    mock_table_obj.update.side_effect = track_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call update
            result = service.update_on_status_change(lead_id, status)
        
        # Verify operations happened in correct order
        assert result is True, "Update should succeed"
        assert update_order == ['select', 'update'], \
            f"Operations should happen in order: select then update. Got: {update_order}"


# =============================================================================
# Property Test: Status-Specific Sentiment Values
# **Feature: fix-lead-messages-display, Properties 12-15**
# **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
# =============================================================================

class TestStatusSpecificSentimentValues:
    """
    **Feature: fix-lead-messages-display, Properties 12-15: Status-specific sentiment values**
    **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
    
    For specific status values, the sentiment score should match expected ranges.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(notes=notes_strategy)
    def test_qualificado_status_sentiment(self, notes):
        """
        **Feature: fix-lead-messages-display, Property 12: Qualificado status sentiment**
        **Validates: Requirements 6.1**
        
        Property: For any lead with status "qualificado", the sentiment score 
        should be greater than 20 (positive).
        """
        service = SentimentService()
        
        lead_data = {
            'id': str(uuid.uuid4()),
            'status': 'qualificado',
            'notes': notes
        }
        
        sentiment = service.calculate_sentiment(lead_data)
        
        assert sentiment > 20, \
            f"Qualificado status should have sentiment > 20: got {sentiment}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(notes=notes_strategy)
    def test_vendido_status_sentiment(self, notes):
        """
        **Feature: fix-lead-messages-display, Property 13: Vendido status sentiment**
        **Validates: Requirements 6.2**
        
        Property: For any lead with status "vendido", the sentiment score 
        should be 100 (maximum).
        """
        service = SentimentService()
        
        lead_data = {
            'id': str(uuid.uuid4()),
            'status': 'vendido',
            'notes': notes
        }
        
        sentiment = service.calculate_sentiment(lead_data)
        
        assert sentiment == 100, \
            f"Vendido status should have sentiment = 100: got {sentiment}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(notes=notes_strategy)
    def test_perdido_status_sentiment(self, notes):
        """
        **Feature: fix-lead-messages-display, Property 14: Perdido status sentiment**
        **Validates: Requirements 6.3**
        
        Property: For any lead with status "perdido", the sentiment score 
        should be less than -20 (negative).
        """
        service = SentimentService()
        
        lead_data = {
            'id': str(uuid.uuid4()),
            'status': 'perdido',
            'notes': notes
        }
        
        sentiment = service.calculate_sentiment(lead_data)
        
        assert sentiment < -20, \
            f"Perdido status should have sentiment < -20: got {sentiment}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(notes=notes_strategy)
    def test_visita_agendada_status_sentiment(self, notes):
        """
        **Feature: fix-lead-messages-display, Property 15: Visita agendada status sentiment**
        **Validates: Requirements 6.4**
        
        Property: For any lead with status "visita_agendada", the sentiment score 
        should be greater than 60 (highly positive).
        """
        service = SentimentService()
        
        lead_data = {
            'id': str(uuid.uuid4()),
            'status': 'visita_agendada',
            'notes': notes
        }
        
        sentiment = service.calculate_sentiment(lead_data)
        
        assert sentiment > 60, \
            f"Visita agendada status should have sentiment > 60: got {sentiment}"


# =============================================================================
# Property Test: Sentiment Database Persistence
# **Feature: fix-lead-messages-display, Property 16: Sentiment database persistence**
# **Validates: Requirements 6.5**
# =============================================================================

class TestSentimentDatabasePersistence:
    """
    **Feature: fix-lead-messages-display, Property 16: Sentiment database persistence**
    **Validates: Requirements 6.5**
    
    For any sentiment score update, the change should be persisted to the 
    database immediately.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        lead_id=lead_id_strategy,
        old_status=status_strategy,
        new_status=status_strategy
    )
    def test_sentiment_change_persisted_immediately(
        self, lead_id, old_status, new_status
    ):
        """
        **Feature: fix-lead-messages-display, Property 16: Sentiment database persistence**
        **Validates: Requirements 6.5**
        
        Property: When sentiment is updated, the new value should be persisted 
        to the database before the method returns.
        """
        service = SentimentService()
        
        lead_data = {
            'id': lead_id,
            'status': old_status,
            'notes': '',
            'sentiment_score': 0
        }
        
        # Track if update was called and what value was persisted
        persisted_sentiment = None
        update_completed = False
        
        def capture_update(data):
            nonlocal persisted_sentiment, update_completed
            persisted_sentiment = data.get('sentiment_score')
            
            # Simulate database persistence
            def complete_update():
                nonlocal update_completed
                update_completed = True
                return MagicMock(data=[data])
            
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.side_effect = complete_update
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_lead_response = MagicMock()
            mock_lead_response.data = [lead_data]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.update.side_effect = capture_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Update status
            result = service.update_on_status_change(lead_id, new_status)
        
        # Verify persistence completed before method returned
        assert result is True, "Update should succeed"
        assert update_completed is True, "Database update should have completed"
        assert persisted_sentiment is not None, "Sentiment should have been persisted"
        
        # Verify persisted value matches expected calculation
        expected_lead = lead_data.copy()
        expected_lead['status'] = new_status
        expected_sentiment = service.calculate_sentiment(expected_lead)
        
        assert persisted_sentiment == expected_sentiment, \
            f"Persisted sentiment should match calculated value: expected {expected_sentiment}, got {persisted_sentiment}"
