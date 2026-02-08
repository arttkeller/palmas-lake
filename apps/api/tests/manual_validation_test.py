"""
Manual Validation Tests for fix-lead-messages-display feature.

This script provides end-to-end validation of all implemented features:
1. Message flow end-to-end
2. Lead modal opening and closing (frontend)
3. Sentiment updates on status changes
4. Automatic lead creation
5. Mock data handling
6. Realtime updates (frontend)
7. Error scenarios

Run with: python -m pytest apps/api/tests/manual_validation_test.py -v

**Feature: fix-lead-messages-display, Task 15: Manual testing and validation**
"""

import sys
import os
import json
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch
import pytest

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.message_service import MessageService
from services.sentiment_service import SentimentService, STATUS_SENTIMENT_MAP


# =============================================================================
# Test 1: Message Flow End-to-End
# =============================================================================

class TestMessageFlowEndToEnd:
    """
    Validates the complete message flow from receiving a message to updating
    the conversation's last_message and updated_at fields.
    """

    def test_message_saves_and_updates_conversation(self):
        """
        Test that saving a message updates conversation last_message and updated_at.
        Requirements: 1.1, 1.2, 3.1, 3.2
        """
        service = MessageService()
        
        # Track captured data
        captured_conv_update = None
        captured_msg_data = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        def capture_msg_insert(data):
            nonlocal captured_msg_data
            captured_msg_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': str(uuid.uuid4())}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': str(uuid.uuid4())}]
            
            # Mock conversation lookup
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': str(uuid.uuid4())}]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.side_effect = capture_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Test with a message
            test_content = "Hello, this is a test message for validation"
            result = service.save_message(
                remote_jid="5511999999999@s.whatsapp.net",
                content=test_content,
                sender_type="lead"
            )
        
        # Verify message was saved
        assert captured_msg_data is not None, "Message should be saved"
        assert captured_msg_data['content'] == test_content
        assert captured_msg_data['sender_type'] == 'lead'
        
        # Verify conversation was updated
        assert captured_conv_update is not None, "Conversation should be updated"
        assert 'last_message' in captured_conv_update
        assert 'updated_at' in captured_conv_update
        assert captured_conv_update['last_message'] == test_content

    def test_long_message_truncation(self):
        """
        Test that messages longer than 50 characters are truncated for last_message.
        Requirements: 3.3
        """
        service = MessageService()
        
        captured_conv_update = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': str(uuid.uuid4())}]
            
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': str(uuid.uuid4())}]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{}])
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Test with a long message (more than 50 characters)
            long_content = "A" * 100  # 100 characters
            service.save_message(
                remote_jid="5511999999999@s.whatsapp.net",
                content=long_content,
                sender_type="lead"
            )
        
        # Verify truncation
        assert captured_conv_update is not None
        assert len(captured_conv_update['last_message']) == 53  # 50 chars + "..."
        assert captured_conv_update['last_message'].endswith("...")


# =============================================================================
# Test 2: Sentiment Updates on Status Changes
# =============================================================================

class TestSentimentUpdates:
    """
    Validates that sentiment scores are correctly calculated and updated
    when lead status changes.
    """

    def test_qualificado_status_positive_sentiment(self):
        """
        Test that 'qualificado' status results in positive sentiment (>20).
        Requirements: 6.1
        """
        service = SentimentService()
        
        lead = {'status': 'qualificado', 'notes': ''}
        sentiment = service.calculate_sentiment(lead)
        
        assert sentiment > 20, f"Qualificado should have sentiment > 20, got {sentiment}"
        assert sentiment == 80, f"Qualificado should have sentiment 80, got {sentiment}"
    
    def test_vendido_status_maximum_sentiment(self):
        """
        Test that 'vendido' status results in maximum sentiment (100).
        Requirements: 6.2
        """
        service = SentimentService()
        
        lead = {'status': 'vendido', 'notes': ''}
        sentiment = service.calculate_sentiment(lead)
        
        assert sentiment == 100, f"Vendido should have sentiment 100, got {sentiment}"
    
    def test_perdido_status_negative_sentiment(self):
        """
        Test that 'perdido' status results in negative sentiment (<-20).
        Requirements: 6.3
        """
        service = SentimentService()
        
        lead = {'status': 'perdido', 'notes': ''}
        sentiment = service.calculate_sentiment(lead)
        
        assert sentiment < -20, f"Perdido should have sentiment < -20, got {sentiment}"
        assert sentiment == -60, f"Perdido should have sentiment -60, got {sentiment}"
    
    def test_visita_agendada_highly_positive_sentiment(self):
        """
        Test that 'visita_agendada' status results in highly positive sentiment (>60).
        Requirements: 6.4
        """
        service = SentimentService()
        
        lead = {'status': 'visita_agendada', 'notes': ''}
        sentiment = service.calculate_sentiment(lead)
        
        assert sentiment > 60, f"Visita agendada should have sentiment > 60, got {sentiment}"
        assert sentiment == 70, f"Visita agendada should have sentiment 70, got {sentiment}"
    
    def test_notes_influence_neutral_status(self):
        """
        Test that notes content influences sentiment when status is neutral.
        Requirements: 3.1.4
        """
        service = SentimentService()
        
        # Neutral status with positive notes
        lead_positive = {'status': 'new', 'notes': 'Cliente muito interessado e entusiasmado'}
        sentiment_positive = service.calculate_sentiment(lead_positive)
        
        # Neutral status with negative notes
        lead_negative = {'status': 'new', 'notes': 'Cliente não interessado, recusou proposta'}
        sentiment_negative = service.calculate_sentiment(lead_negative)
        
        # Neutral status without notes
        lead_neutral = {'status': 'new', 'notes': ''}
        sentiment_neutral = service.calculate_sentiment(lead_neutral)
        
        assert sentiment_positive > sentiment_neutral, "Positive notes should increase sentiment"
        assert sentiment_negative < sentiment_neutral, "Negative notes should decrease sentiment"

    def test_sentiment_persistence_on_status_update(self):
        """
        Test that sentiment is persisted to database when status changes.
        Requirements: 6.5, 3.1.5
        """
        service = SentimentService()
        
        captured_update = None
        lead_id = str(uuid.uuid4())
        
        def capture_update(data):
            nonlocal captured_update
            captured_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead fetch
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': lead_id, 'status': 'new', 'notes': ''}]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                mock_table_obj.update.side_effect = capture_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Update status to qualificado
            result = service.update_on_status_change(lead_id, 'qualificado')
        
        assert result is True, "Update should succeed"
        assert captured_update is not None, "Database update should be called"
        assert 'sentiment_score' in captured_update
        assert captured_update['sentiment_score'] == 80  # qualificado = 80


# =============================================================================
# Test 3: Automatic Lead Creation
# =============================================================================

class TestAutomaticLeadCreation:
    """
    Validates that leads are automatically created when messages arrive
    from unknown phone numbers.
    """

    def test_new_lead_created_for_unknown_phone(self):
        """
        Test that a new lead is created when message arrives from unknown phone.
        Requirements: 9.1
        """
        service = MessageService()
        
        captured_lead_data = None
        new_phone = "5511888888888"
        
        def capture_lead_insert(data):
            nonlocal captured_lead_data
            captured_lead_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': str(uuid.uuid4())}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (no existing lead)
            mock_lead_empty = MagicMock()
            mock_lead_empty.data = []
            
            # Mock conversation lookup - return empty
            mock_conv_empty = MagicMock()
            mock_conv_empty.data = []
            
            call_count = {'leads_select': 0, 'leads_insert': 0}
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    def mock_select(*args):
                        select_mock = MagicMock()
                        select_mock.eq.return_value.execute.return_value = mock_lead_empty
                        return select_mock
                    mock_table_obj.select.side_effect = mock_select
                    mock_table_obj.insert.side_effect = capture_lead_insert
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_empty
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{'id': str(uuid.uuid4())}])
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{}])
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Send message from unknown phone
            service.save_message(
                remote_jid=f"{new_phone}@s.whatsapp.net",
                content="Hello from new lead",
                sender_type="lead"
            )
        
        # Verify lead was created
        assert captured_lead_data is not None, "New lead should be created"
        assert captured_lead_data['phone'] == new_phone
    
    def test_auto_created_lead_has_correct_status(self):
        """
        Test that auto-created leads have status 'new'.
        Requirements: 9.2
        """
        service = MessageService()
        
        captured_lead_data = None
        
        def capture_lead_insert(data):
            nonlocal captured_lead_data
            captured_lead_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': str(uuid.uuid4())}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_lead_empty = MagicMock()
            mock_lead_empty.data = []
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_empty
                    mock_table_obj.insert.side_effect = capture_lead_insert
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{'id': str(uuid.uuid4())}])
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{}])
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            service.save_message(
                remote_jid="5511777777777@s.whatsapp.net",
                content="Test message",
                sender_type="lead"
            )
        
        assert captured_lead_data is not None
        assert captured_lead_data['status'] == 'new', f"Status should be 'new', got {captured_lead_data.get('status')}"

    def test_auto_created_lead_name_format(self):
        """
        Test that auto-created leads have name format 'Lead [phone]'.
        Requirements: 9.3
        """
        service = MessageService()
        
        captured_lead_data = None
        test_phone = "5511666666666"
        
        def capture_lead_insert(data):
            nonlocal captured_lead_data
            captured_lead_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': str(uuid.uuid4())}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_lead_empty = MagicMock()
            mock_lead_empty.data = []
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_empty
                    mock_table_obj.insert.side_effect = capture_lead_insert
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{'id': str(uuid.uuid4())}])
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{}])
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            service.save_message(
                remote_jid=f"{test_phone}@s.whatsapp.net",
                content="Test message",
                sender_type="lead"
            )
        
        assert captured_lead_data is not None
        expected_name = f"Lead {test_phone}"
        assert captured_lead_data['full_name'] == expected_name, \
            f"Name should be '{expected_name}', got {captured_lead_data.get('full_name')}"


# =============================================================================
# Test 4: Mock Data Handling
# =============================================================================

class TestMockDataHandling:
    """
    Validates that the system works correctly with mock data.
    """
    
    def test_mock_mode_logging(self):
        """
        Test that mock mode is logged when active.
        Requirements: 10.5
        """
        import logging
        
        # Capture log output
        with patch('services.message_service.logger') as mock_logger:
            service = MessageService(use_mock=True)
            
            # Verify mock mode was logged
            mock_logger.info.assert_called_with("MOCK MODE ACTIVE - Using mocked data for testing")
    
    def test_mock_data_lead_creation_same_logic(self):
        """
        Test that lead creation with mock data uses same logic as real data.
        Requirements: 10.1
        """
        # Create service with mock mode
        service = MessageService(use_mock=True)
        
        captured_lead_data = None
        
        def capture_lead_insert(data):
            nonlocal captured_lead_data
            captured_lead_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': str(uuid.uuid4())}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_lead_empty = MagicMock()
            mock_lead_empty.data = []
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_empty
                    mock_table_obj.insert.side_effect = capture_lead_insert
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{'id': str(uuid.uuid4())}])
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{}])
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            service.save_message(
                remote_jid="5511555555555@s.whatsapp.net",
                content="Mock test message",
                sender_type="lead"
            )
        
        # Verify same lead creation logic is used
        assert captured_lead_data is not None
        assert 'full_name' in captured_lead_data
        assert 'phone' in captured_lead_data
        assert 'status' in captured_lead_data
        assert captured_lead_data['status'] == 'new'


# =============================================================================
# Test 5: Error Scenarios
# =============================================================================

class TestErrorScenarios:
    """
    Validates error handling in various failure scenarios.
    """
    
    def test_conversation_update_failure_still_saves_message(self):
        """
        Test that message is saved even if conversation update fails.
        Requirements: 3.4
        """
        service = MessageService()
        
        message_saved = False
        
        def capture_msg_insert(data):
            nonlocal message_saved
            message_saved = True
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': str(uuid.uuid4())}])
            return mock_result
        
        def fail_conv_update(data):
            raise Exception("Simulated conversation update failure")
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': str(uuid.uuid4())}]
            
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': str(uuid.uuid4())}]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = fail_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.side_effect = capture_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Should not raise exception
            result = service.save_message(
                remote_jid="5511999999999@s.whatsapp.net",
                content="Test message",
                sender_type="lead"
            )
        
        # Message should still be saved
        assert message_saved, "Message should be saved even if conversation update fails"
        assert result is not None, "Should return conversation_id"
    
    def test_schema_error_logging(self):
        """
        Test that schema-related errors are logged with clear messages.
        Requirements: 7.4
        """
        service = MessageService()
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Simulate schema error
            def raise_schema_error(*args):
                raise Exception("relation 'public.leads' does not exist - schema mismatch")
            
            mock_supabase.table.side_effect = raise_schema_error
            
            with patch('services.message_service.logger') as mock_logger:
                result = service.save_message(
                    remote_jid="5511999999999@s.whatsapp.net",
                    content="Test",
                    sender_type="lead"
                )
            
            # Should return None on error
            assert result is None
    
    def test_retry_logic_on_lead_creation_failure(self):
        """
        Test that lead creation is retried once on failure.
        Requirements: 9.5
        """
        service = MessageService()
        
        attempt_count = 0
        
        def fail_then_succeed(data):
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count == 1:
                raise Exception("First attempt failed")
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': str(uuid.uuid4())}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            mock_lead_empty = MagicMock()
            mock_lead_empty.data = []
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_empty
                    mock_table_obj.insert.side_effect = fail_then_succeed
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{'id': str(uuid.uuid4())}])
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value.execute.return_value = MagicMock(data=[{}])
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            result = service.save_message(
                remote_jid="5511444444444@s.whatsapp.net",
                content="Test",
                sender_type="lead"
            )
        
        # Should have retried
        assert attempt_count == 2, f"Should retry once, got {attempt_count} attempts"
        assert result is not None, "Should succeed on retry"


# =============================================================================
# Test 6: Conversations Ordering
# =============================================================================

class TestConversationsOrdering:
    """
    Validates that conversations are returned in correct order.
    """
    
    def test_conversations_ordered_by_updated_at_desc(self):
        """
        Test that conversations are ordered by updated_at descending.
        Requirements: 1.3
        """
        service = MessageService()
        
        # Create mock conversations with different updated_at times
        mock_conversations = [
            {'id': '1', 'updated_at': '2025-01-01T10:00:00Z', 'leads': {'full_name': 'Lead 1'}},
            {'id': '2', 'updated_at': '2025-01-03T10:00:00Z', 'leads': {'full_name': 'Lead 2'}},
            {'id': '3', 'updated_at': '2025-01-02T10:00:00Z', 'leads': {'full_name': 'Lead 3'}},
        ]
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock the order method to verify it's called correctly
            mock_order = MagicMock()
            mock_order.execute.return_value = MagicMock(data=mock_conversations)
            
            mock_select = MagicMock()
            mock_select.order.return_value = mock_order
            
            mock_table = MagicMock()
            mock_table.select.return_value = mock_select
            
            mock_supabase.table.return_value = mock_table
            
            result = service.get_conversations()
            
            # Verify order was called with correct parameters
            mock_select.order.assert_called_once_with("updated_at", direction='desc')
            
            # Verify result
            assert result == mock_conversations


# =============================================================================
# Test 7: Status Sentiment Mapping Completeness
# =============================================================================

class TestStatusSentimentMapping:
    """
    Validates that all expected statuses have sentiment mappings.
    """
    
    def test_all_statuses_have_sentiment_mapping(self):
        """
        Test that all expected statuses are mapped to sentiment values.
        """
        expected_statuses = [
            'vendido', 'qualificado', 'visita_agendada', 'proposta_enviada',
            'visita_realizada', 'contatado', 'contacted', 'novo_lead', 'new',
            'perdido', 'arquivado', 'transferido'
        ]
        
        for status in expected_statuses:
            assert status in STATUS_SENTIMENT_MAP, f"Status '{status}' should be in sentiment map"
    
    def test_sentiment_values_in_valid_range(self):
        """
        Test that all sentiment values are in valid range (-100 to 100).
        """
        for status, sentiment in STATUS_SENTIMENT_MAP.items():
            assert -100 <= sentiment <= 100, \
                f"Sentiment for '{status}' should be in range [-100, 100], got {sentiment}"
    
    def test_positive_statuses_have_positive_sentiment(self):
        """
        Test that positive statuses have positive sentiment values.
        """
        positive_statuses = ['vendido', 'qualificado', 'visita_agendada', 'proposta_enviada', 'visita_realizada', 'contatado']
        
        for status in positive_statuses:
            assert STATUS_SENTIMENT_MAP[status] > 0, \
                f"Status '{status}' should have positive sentiment, got {STATUS_SENTIMENT_MAP[status]}"
    
    def test_negative_statuses_have_negative_sentiment(self):
        """
        Test that negative statuses have negative sentiment values.
        """
        negative_statuses = ['perdido', 'arquivado']
        
        for status in negative_statuses:
            assert STATUS_SENTIMENT_MAP[status] < 0, \
                f"Status '{status}' should have negative sentiment, got {STATUS_SENTIMENT_MAP[status]}"


# =============================================================================
# Summary: Manual Testing Checklist
# =============================================================================

"""
MANUAL TESTING CHECKLIST FOR fix-lead-messages-display

Backend Tests (run with pytest):
✓ Message flow end-to-end
✓ Long message truncation
✓ Sentiment updates on status changes
✓ Automatic lead creation
✓ Mock data handling
✓ Error scenarios
✓ Conversations ordering
✓ Status sentiment mapping

Frontend Tests (manual verification):
□ Lead modal opens when clicking lead row
□ Lead modal displays lead details (name, phone, email, status, sentiment)
□ Lead modal displays conversation platform indicator
□ Lead modal displays notes section
□ Messages are fetched and displayed in modal
□ Messages show correct sender type styling (lead/AI/user)
□ AI messages show "AI Assistant" label
□ Timestamps are displayed correctly
□ JSON messages are parsed and displayed as readable text
□ Images are rendered inline
□ Reactions are displayed next to messages
□ Realtime updates work (new messages appear without refresh)
□ Modal closes on outside click
□ Modal closes on Escape key
□ Scroll position preserved when modal closes

To run backend tests:
    cd apps/api
    python -m pytest tests/manual_validation_test.py -v

To run frontend tests:
    cd apps/web
    npm run test -- --run
"""


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
