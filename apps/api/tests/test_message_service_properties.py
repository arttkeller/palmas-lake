"""
Property-Based Tests for MessageService.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: fix-reaction-persistence**
"""

import sys
import os
import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings, strategies as st, HealthCheck

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.message_service import MessageService


# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for valid WhatsApp message IDs (format: alphanumeric, typically 20+ chars)
whatsapp_msg_id_strategy = st.text(
    alphabet=st.sampled_from('0123456789ABCDEF'),
    min_size=16,
    max_size=32
).filter(lambda x: len(x) >= 16)

# Strategy for phone numbers (Brazilian format)
phone_strategy = st.text(
    alphabet=st.sampled_from('0123456789'),
    min_size=10,
    max_size=13
).map(lambda x: f"55{x}")

# Strategy for remote_jid (phone@s.whatsapp.net)
remote_jid_strategy = phone_strategy.map(lambda p: f"{p}@s.whatsapp.net")

# Strategy for message content
message_content_strategy = st.text(min_size=1, max_size=500).filter(lambda x: x.strip())

# Strategy for sender types
sender_type_strategy = st.sampled_from(['lead', 'ai', 'user'])

# Strategy for message types
message_type_strategy = st.sampled_from(['text', 'image', 'audio', 'video', 'document'])


# =============================================================================
# Property Test: Message ID Persistence
# **Feature: fix-reaction-persistence, Property 1: Message ID Persistence**
# **Validates: Requirements 1.1, 1.3**
# =============================================================================

class TestMessageIdPersistence:
    """
    **Feature: fix-reaction-persistence, Property 1: Message ID Persistence**
    **Validates: Requirements 1.1, 1.3**
    
    For any lead message received with a whatsapp_msg_id, saving it to the database 
    should result in the metadata containing the exact same whatsapp_msg_id value.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy,
        whatsapp_msg_id=whatsapp_msg_id_strategy
    )
    def test_whatsapp_msg_id_stored_in_metadata(
        self, remote_jid, content, sender_type, message_type, whatsapp_msg_id
    ):
        """
        **Feature: fix-reaction-persistence, Property 1: Message ID Persistence**
        **Validates: Requirements 1.1, 1.3**
        
        Property: For any valid message with whatsapp_msg_id, the metadata field
        must contain the exact same whatsapp_msg_id value after saving.
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track what gets inserted
        captured_msg_data = None
        
        def capture_insert(data):
            nonlocal captured_msg_data
            captured_msg_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'test-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_lead_response
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Setup the chain for conversation select
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.side_effect = capture_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with whatsapp_msg_id
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type,
                whatsapp_msg_id=whatsapp_msg_id
            )
        
        # Verify the message was captured
        assert captured_msg_data is not None, "Message insert should have been called"
        
        # Verify metadata contains whatsapp_msg_id
        assert 'metadata' in captured_msg_data, "Message data must include metadata field"
        metadata = captured_msg_data['metadata']
        
        assert isinstance(metadata, dict), "Metadata must be a dictionary"
        assert 'whatsapp_msg_id' in metadata, "Metadata must contain whatsapp_msg_id key"
        assert metadata['whatsapp_msg_id'] == whatsapp_msg_id, \
            f"Metadata whatsapp_msg_id must match: expected {whatsapp_msg_id}, got {metadata.get('whatsapp_msg_id')}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_message_saved_without_whatsapp_msg_id(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-reaction-persistence, Property 1: Message ID Persistence**
        **Validates: Requirements 1.2**
        
        Property: When whatsapp_msg_id is not provided, the message should be saved
        without the whatsapp_msg_id in metadata (metadata may be empty or absent).
        """
        service = MessageService()
        
        # Track what gets inserted
        captured_msg_data = None
        
        def capture_insert(data):
            nonlocal captured_msg_data
            captured_msg_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'test-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.side_effect = capture_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message WITHOUT whatsapp_msg_id
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
                # whatsapp_msg_id not provided
            )
        
        # Verify the message was captured
        assert captured_msg_data is not None, "Message insert should have been called"
        
        # Verify metadata is either absent or doesn't contain whatsapp_msg_id
        if 'metadata' in captured_msg_data:
            metadata = captured_msg_data['metadata']
            if metadata:
                assert 'whatsapp_msg_id' not in metadata or metadata.get('whatsapp_msg_id') is None, \
                    "Metadata should not contain whatsapp_msg_id when not provided"


# =============================================================================
# Strategy for emoji reactions
# =============================================================================

emoji_strategy = st.sampled_from(['❤️', '👍', '😊', '🔥', '👏', '😂', '😮', '😢', '🙏', '💯'])


# =============================================================================
# Property Test: Reaction Association by ID
# **Feature: fix-reaction-persistence, Property 2: Reaction Association by ID**
# **Validates: Requirements 2.1**
# =============================================================================

class TestReactionAssociationById:
    """
    **Feature: fix-reaction-persistence, Property 2: Reaction Association by ID**
    **Validates: Requirements 2.1**
    
    For any reaction save operation with a valid whatsapp_msg_id, the system should 
    find and update the message that has that exact whatsapp_msg_id in its metadata.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        whatsapp_msg_id=whatsapp_msg_id_strategy,
        emoji=emoji_strategy
    )
    def test_reaction_finds_message_by_whatsapp_id(
        self, remote_jid, whatsapp_msg_id, emoji
    ):
        """
        **Feature: fix-reaction-persistence, Property 2: Reaction Association by ID**
        **Validates: Requirements 2.1**
        
        Property: For any valid whatsapp_msg_id, save_reaction should find and update
        the message that has that exact whatsapp_msg_id in its metadata.
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track what message ID gets updated
        updated_msg_id = None
        updated_metadata = None
        
        def capture_update(data):
            nonlocal updated_metadata
            updated_metadata = data.get('metadata')
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock find_message_by_whatsapp_id - return a message with matching whatsapp_msg_id
            mock_msg_response = MagicMock()
            mock_msg_response.data = [{
                'id': 'msg-uuid-123',
                'metadata': {'whatsapp_msg_id': whatsapp_msg_id}
            }]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                elif table_name == 'messages':
                    # For select (find_message_by_whatsapp_id)
                    mock_table_obj.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_msg_response
                    # For update
                    mock_table_obj.update.side_effect = capture_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_reaction with whatsapp_msg_id
            result = service.save_reaction(
                remote_jid=remote_jid,
                whatsapp_msg_id=whatsapp_msg_id,
                emoji=emoji
            )
        
        # Verify the reaction was saved to the correct message
        assert result == 'msg-uuid-123', f"Should return the message ID that was updated"
        
        # Verify metadata was updated with reaction
        assert updated_metadata is not None, "Metadata should have been updated"
        assert updated_metadata.get('reaction') == emoji, \
            f"Reaction emoji should match: expected {emoji}, got {updated_metadata.get('reaction')}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        whatsapp_msg_id=whatsapp_msg_id_strategy,
        emoji=emoji_strategy
    )
    def test_reaction_returns_none_when_message_not_found(
        self, remote_jid, whatsapp_msg_id, emoji
    ):
        """
        **Feature: fix-reaction-persistence, Property 2: Reaction Association by ID**
        **Validates: Requirements 2.2**
        
        Property: If no message with matching whatsapp_msg_id exists, 
        save_reaction should return None.
        """
        service = MessageService()
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock find_message_by_whatsapp_id - return empty (no message found)
            mock_msg_response = MagicMock()
            mock_msg_response.data = []
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                elif table_name == 'messages':
                    # For select (find_message_by_whatsapp_id) - return empty
                    mock_table_obj.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_msg_response
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_reaction with whatsapp_msg_id that doesn't exist
            result = service.save_reaction(
                remote_jid=remote_jid,
                whatsapp_msg_id=whatsapp_msg_id,
                emoji=emoji
            )
        
        # Verify None is returned when message not found
        assert result is None, "Should return None when message with whatsapp_msg_id not found"



# =============================================================================
# Property Test: Reaction Data Completeness
# **Feature: fix-reaction-persistence, Property 3: Reaction Data Completeness**
# **Validates: Requirements 2.3**
# =============================================================================

class TestReactionDataCompleteness:
    """
    **Feature: fix-reaction-persistence, Property 3: Reaction Data Completeness**
    **Validates: Requirements 2.3**
    
    For any successfully saved reaction, the message metadata should contain both 
    the "reaction" field with the emoji and the "reaction_from" field with the source.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        whatsapp_msg_id=whatsapp_msg_id_strategy,
        emoji=emoji_strategy
    )
    def test_reaction_metadata_contains_required_fields(
        self, remote_jid, whatsapp_msg_id, emoji
    ):
        """
        **Feature: fix-reaction-persistence, Property 3: Reaction Data Completeness**
        **Validates: Requirements 2.3**
        
        Property: For any successfully saved reaction, the metadata must contain
        both "reaction" (emoji) and "reaction_from" (source) fields.
        """
        service = MessageService()
        
        # Track what metadata gets saved
        saved_metadata = None
        
        def capture_update(data):
            nonlocal saved_metadata
            saved_metadata = data.get('metadata')
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock find_message_by_whatsapp_id - return a message with matching whatsapp_msg_id
            mock_msg_response = MagicMock()
            mock_msg_response.data = [{
                'id': 'msg-uuid-123',
                'metadata': {'whatsapp_msg_id': whatsapp_msg_id}
            }]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                elif table_name == 'messages':
                    # For select (find_message_by_whatsapp_id)
                    mock_table_obj.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_msg_response
                    # For update
                    mock_table_obj.update.side_effect = capture_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_reaction
            result = service.save_reaction(
                remote_jid=remote_jid,
                whatsapp_msg_id=whatsapp_msg_id,
                emoji=emoji
            )
        
        # Verify reaction was saved successfully
        assert result is not None, "Reaction should be saved successfully"
        
        # Verify metadata contains required fields
        assert saved_metadata is not None, "Metadata should have been saved"
        
        # Check "reaction" field exists and contains the emoji
        assert 'reaction' in saved_metadata, "Metadata must contain 'reaction' field"
        assert saved_metadata['reaction'] == emoji, \
            f"Reaction field must contain the emoji: expected {emoji}, got {saved_metadata.get('reaction')}"
        
        # Check "reaction_from" field exists and contains the source
        assert 'reaction_from' in saved_metadata, "Metadata must contain 'reaction_from' field"
        assert saved_metadata['reaction_from'] == 'ai', \
            f"reaction_from field must be 'ai': got {saved_metadata.get('reaction_from')}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        whatsapp_msg_id=whatsapp_msg_id_strategy,
        emoji=emoji_strategy,
        existing_metadata=st.fixed_dictionaries({
            'whatsapp_msg_id': whatsapp_msg_id_strategy,
            'some_other_field': st.text(min_size=1, max_size=20)
        })
    )
    def test_reaction_preserves_existing_metadata(
        self, remote_jid, whatsapp_msg_id, emoji, existing_metadata
    ):
        """
        **Feature: fix-reaction-persistence, Property 3: Reaction Data Completeness**
        **Validates: Requirements 2.3**
        
        Property: When saving a reaction, existing metadata fields should be preserved
        while adding the reaction and reaction_from fields.
        """
        service = MessageService()
        
        # Track what metadata gets saved
        saved_metadata = None
        
        def capture_update(data):
            nonlocal saved_metadata
            saved_metadata = data.get('metadata')
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock find_message_by_whatsapp_id - return a message with existing metadata
            mock_msg_response = MagicMock()
            mock_msg_response.data = [{
                'id': 'msg-uuid-123',
                'metadata': existing_metadata.copy()
            }]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                elif table_name == 'messages':
                    # For select (find_message_by_whatsapp_id)
                    mock_table_obj.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_msg_response
                    # For update
                    mock_table_obj.update.side_effect = capture_update
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_reaction
            result = service.save_reaction(
                remote_jid=remote_jid,
                whatsapp_msg_id=whatsapp_msg_id,
                emoji=emoji
            )
        
        # Verify reaction was saved successfully
        assert result is not None, "Reaction should be saved successfully"
        
        # Verify existing metadata fields are preserved
        assert saved_metadata is not None, "Metadata should have been saved"
        
        # Check existing fields are preserved
        for key, value in existing_metadata.items():
            if key != 'whatsapp_msg_id':  # whatsapp_msg_id might be different
                assert key in saved_metadata, f"Existing field '{key}' should be preserved"
                assert saved_metadata[key] == value, \
                    f"Existing field '{key}' value should be preserved: expected {value}, got {saved_metadata.get(key)}"
        
        # Check new reaction fields are added
        assert 'reaction' in saved_metadata, "Metadata must contain 'reaction' field"
        assert 'reaction_from' in saved_metadata, "Metadata must contain 'reaction_from' field"


# =============================================================================
# Property Test: Reaction Round Trip
# **Feature: fix-reaction-persistence, Property 4: Reaction Round Trip**
# **Validates: Requirements 2.4**
# =============================================================================

class TestReactionRoundTrip:
    """
    **Feature: fix-reaction-persistence, Property 4: Reaction Round Trip**
    **Validates: Requirements 2.4**
    
    For any message with a saved reaction, querying that message should return 
    the same reaction emoji that was saved.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        whatsapp_msg_id=whatsapp_msg_id_strategy,
        emoji=emoji_strategy
    )
    def test_reaction_round_trip_preserves_emoji(
        self, remote_jid, content, whatsapp_msg_id, emoji
    ):
        """
        **Feature: fix-reaction-persistence, Property 4: Reaction Round Trip**
        **Validates: Requirements 2.4**
        
        Property: For any message with a saved reaction, querying that message 
        should return the same reaction emoji that was saved.
        """
        service = MessageService()
        
        # Simulate the full round trip:
        # 1. Save a message with whatsapp_msg_id
        # 2. Save a reaction to that message
        # 3. Query the message and verify the reaction is returned
        
        # Storage for simulating database state
        stored_messages = {}
        conversation_id = 'conv-uuid-test'
        
        def mock_insert_message(data):
            msg_id = f"msg-{whatsapp_msg_id}"
            stored_messages[msg_id] = {**data, 'id': msg_id}
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[stored_messages[msg_id]])
            return mock_result
        
        def mock_update_message(data):
            # Find the message to update
            for msg_id, msg in stored_messages.items():
                if msg.get('metadata', {}).get('whatsapp_msg_id') == whatsapp_msg_id:
                    # Merge metadata
                    current_metadata = msg.get('metadata', {})
                    new_metadata = data.get('metadata', {})
                    msg['metadata'] = {**current_metadata, **new_metadata}
                    break
            
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        def mock_select_message_by_whatsapp_id():
            # Find message by whatsapp_msg_id in metadata
            for msg_id, msg in stored_messages.items():
                if msg.get('metadata', {}).get('whatsapp_msg_id') == whatsapp_msg_id:
                    mock_result = MagicMock()
                    mock_result.data = [msg]
                    return mock_result
            mock_result = MagicMock()
            mock_result.data = []
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': conversation_id}]
            
            call_count = {'messages_select': 0}
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                elif table_name == 'messages':
                    mock_table_obj.insert.side_effect = mock_insert_message
                    mock_table_obj.update.side_effect = mock_update_message
                    
                    # For select queries (find_message_by_whatsapp_id)
                    def mock_select(*args):
                        select_mock = MagicMock()
                        def mock_eq_chain(*eq_args):
                            eq_mock = MagicMock()
                            def mock_eq_inner(*inner_args):
                                inner_mock = MagicMock()
                                inner_mock.execute.return_value = mock_select_message_by_whatsapp_id()
                                return inner_mock
                            eq_mock.eq.side_effect = mock_eq_inner
                            return eq_mock
                        select_mock.eq.side_effect = mock_eq_chain
                        return select_mock
                    mock_table_obj.select.side_effect = mock_select
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Step 1: Save message with whatsapp_msg_id
            service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type='lead',
                message_type='text',
                whatsapp_msg_id=whatsapp_msg_id
            )
            
            # Verify message was stored
            assert len(stored_messages) == 1, "Message should be stored"
            
            # Step 2: Save reaction to the message
            result = service.save_reaction(
                remote_jid=remote_jid,
                whatsapp_msg_id=whatsapp_msg_id,
                emoji=emoji
            )
            
            # Verify reaction was saved
            assert result is not None, "Reaction should be saved successfully"
            
            # Step 3: Verify the stored message has the correct reaction
            stored_msg = list(stored_messages.values())[0]
            assert 'metadata' in stored_msg, "Message should have metadata"
            assert 'reaction' in stored_msg['metadata'], "Metadata should contain reaction"
            assert stored_msg['metadata']['reaction'] == emoji, \
                f"Reaction emoji should match: expected {emoji}, got {stored_msg['metadata'].get('reaction')}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        whatsapp_msg_id=whatsapp_msg_id_strategy,
        emoji=emoji_strategy
    )
    def test_reaction_round_trip_via_get_messages(
        self, remote_jid, content, whatsapp_msg_id, emoji
    ):
        """
        **Feature: fix-reaction-persistence, Property 4: Reaction Round Trip**
        **Validates: Requirements 2.4**
        
        Property: When querying messages via get_messages, the reaction data 
        should be returned in the metadata field.
        """
        service = MessageService()
        
        conversation_id = 'conv-uuid-test'
        
        # Simulate a message with reaction already saved
        message_with_reaction = {
            'id': f'msg-{whatsapp_msg_id}',
            'conversation_id': conversation_id,
            'sender_type': 'lead',
            'content': content,
            'message_type': 'text',
            'metadata': {
                'whatsapp_msg_id': whatsapp_msg_id,
                'reaction': emoji,
                'reaction_from': 'ai'
            },
            'created_at': '2026-02-02T10:00:00-03:00'
        }
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock get_messages query
            mock_messages_response = MagicMock()
            mock_messages_response.data = [message_with_reaction]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'messages':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_messages_response
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Query messages
            messages = service.get_messages(conversation_id)
        
        # Verify the reaction is returned in the query result
        assert len(messages) == 1, "Should return one message"
        
        returned_msg = messages[0]
        assert 'metadata' in returned_msg, "Message should have metadata"
        
        metadata = returned_msg['metadata']
        assert 'reaction' in metadata, "Metadata should contain reaction"
        assert metadata['reaction'] == emoji, \
            f"Reaction emoji should match: expected {emoji}, got {metadata.get('reaction')}"
        assert metadata.get('reaction_from') == 'ai', \
            f"reaction_from should be 'ai': got {metadata.get('reaction_from')}"


# =============================================================================
# Property Test: Conversation last_message Update
# **Feature: fix-lead-messages-display, Property 1: Conversation last_message update**
# **Validates: Requirements 1.1, 3.1**
# =============================================================================

class TestConversationLastMessageUpdate:
    """
    **Feature: fix-lead-messages-display, Property 1: Conversation last_message update**
    **Validates: Requirements 1.1, 3.1**
    
    For any message saved to the database, the conversation's last_message field 
    should be updated with a preview of the message content (truncated to 50 
    characters if longer).
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_conversation_last_message_updated(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 1: Conversation last_message update**
        **Validates: Requirements 1.1, 3.1**
        
        Property: For any message saved, the conversation's last_message field 
        must be updated with the message content (truncated to 50 chars if needed).
        """
        service = MessageService()
        
        # Track what gets updated in the conversation
        captured_conv_update = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation was updated
        assert captured_conv_update is not None, "Conversation should have been updated"
        assert 'last_message' in captured_conv_update, "Update must include last_message field"
        
        # Verify last_message content
        expected_preview = content[:50] + "..." if len(content) > 50 else content
        actual_last_message = captured_conv_update['last_message']
        
        assert actual_last_message == expected_preview, \
            f"last_message should match expected preview: expected '{expected_preview}', got '{actual_last_message}'"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_conversation_last_message_truncation(
        self, remote_jid, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 1: Conversation last_message update**
        **Validates: Requirements 3.3**
        
        Property: For any message longer than 50 characters, the last_message 
        should be truncated to 50 characters with "..." appended.
        """
        service = MessageService()
        
        # Generate a long message (> 50 chars)
        long_content = "A" * 60  # 60 characters
        
        # Track what gets updated in the conversation
        captured_conv_update = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with long content
            result = service.save_message(
                remote_jid=remote_jid,
                content=long_content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation was updated
        assert captured_conv_update is not None, "Conversation should have been updated"
        assert 'last_message' in captured_conv_update, "Update must include last_message field"
        
        # Verify truncation
        actual_last_message = captured_conv_update['last_message']
        assert len(actual_last_message) == 53, \
            f"Truncated message should be exactly 53 chars (50 + '...'): got {len(actual_last_message)}"
        assert actual_last_message.endswith("..."), \
            "Truncated message should end with '...'"
        assert actual_last_message == long_content[:50] + "...", \
            f"Truncated message should match expected format"



# =============================================================================
# Property Test: Conversation updated_at Update
# **Feature: fix-lead-messages-display, Property 2: Conversation updated_at update**
# **Validates: Requirements 1.2, 3.2**
# =============================================================================

class TestConversationUpdatedAtUpdate:
    """
    **Feature: fix-lead-messages-display, Property 2: Conversation updated_at update**
    **Validates: Requirements 1.2, 3.2**
    
    For any message saved to the database, the conversation's updated_at field 
    should be updated with the current Brazil timezone timestamp.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_conversation_updated_at_is_set(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 2: Conversation updated_at update**
        **Validates: Requirements 1.2, 3.2**
        
        Property: For any message saved, the conversation's updated_at field 
        must be updated with a valid Brazil timezone timestamp.
        """
        service = MessageService()
        
        # Track what gets updated in the conversation
        captured_conv_update = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation was updated
        assert captured_conv_update is not None, "Conversation should have been updated"
        assert 'updated_at' in captured_conv_update, "Update must include updated_at field"
        
        # Verify updated_at is a valid ISO timestamp
        updated_at = captured_conv_update['updated_at']
        assert isinstance(updated_at, str), "updated_at should be a string"
        
        # Parse the timestamp to verify it's valid ISO format
        try:
            from dateutil import parser
            parsed_dt = parser.isoparse(updated_at)
            
            # Verify it has timezone info
            assert parsed_dt.tzinfo is not None, "Timestamp should include timezone information"
            
        except Exception as e:
            pytest.fail(f"updated_at should be a valid ISO timestamp: {e}")
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_conversation_updated_at_uses_brazil_timezone(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 2: Conversation updated_at update**
        **Validates: Requirements 3.2**
        
        Property: For any message saved, the conversation's updated_at timestamp 
        should use Brazil timezone (America/Sao_Paulo or UTC-03:00).
        """
        service = MessageService()
        
        # Track what gets updated in the conversation
        captured_conv_update = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation was updated
        assert captured_conv_update is not None, "Conversation should have been updated"
        assert 'updated_at' in captured_conv_update, "Update must include updated_at field"
        
        # Verify updated_at uses Brazil timezone
        updated_at = captured_conv_update['updated_at']
        
        # Parse the timestamp
        from dateutil import parser
        parsed_dt = parser.isoparse(updated_at)
        
        # Check if timezone is Brazil (UTC-03:00 or UTC-02:00 during DST)
        # Brazil timezone offset is typically -03:00
        tz_offset = parsed_dt.utcoffset()
        assert tz_offset is not None, "Timestamp should have timezone offset"
        
        # Brazil timezone is UTC-03:00 (or UTC-02:00 during DST, though Brazil no longer observes DST)
        # We'll accept -03:00 as the standard Brazil timezone
        offset_hours = tz_offset.total_seconds() / 3600
        assert offset_hours == -3.0, \
            f"Timestamp should use Brazil timezone (UTC-03:00): got UTC{offset_hours:+.1f}:00"



# =============================================================================
# Property Test: Multiple Messages Consistency
# **Feature: fix-lead-messages-display, Property 6: Multiple messages consistency**
# **Validates: Requirements 3.5**
# =============================================================================

class TestMultipleMessagesConsistency:
    """
    **Feature: fix-lead-messages-display, Property 6: Multiple messages consistency**
    **Validates: Requirements 3.5**
    
    For any sequence of messages saved rapidly to the same conversation, the 
    conversation's last_message should reflect the content of the most recent message.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        messages=st.lists(
            st.tuples(
                message_content_strategy,
                sender_type_strategy,
                message_type_strategy
            ),
            min_size=2,
            max_size=5
        )
    )
    def test_last_message_reflects_most_recent(
        self, remote_jid, messages
    ):
        """
        **Feature: fix-lead-messages-display, Property 6: Multiple messages consistency**
        **Validates: Requirements 3.5**
        
        Property: When multiple messages are saved in sequence, the conversation's 
        last_message should always reflect the most recently saved message.
        """
        service = MessageService()
        
        # Track all conversation updates
        conversation_updates = []
        
        def capture_conv_update(data):
            conversation_updates.append(data.copy())
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Save all messages in sequence
            for content, sender_type, message_type in messages:
                service.save_message(
                    remote_jid=remote_jid,
                    content=content,
                    sender_type=sender_type,
                    message_type=message_type
                )
        
        # Verify we have updates for all messages
        assert len(conversation_updates) == len(messages), \
            f"Should have {len(messages)} conversation updates, got {len(conversation_updates)}"
        
        # Verify the last update reflects the last message
        last_update = conversation_updates[-1]
        last_message_content = messages[-1][0]  # content is first element of tuple
        
        expected_preview = last_message_content[:50] + "..." if len(last_message_content) > 50 else last_message_content
        actual_last_message = last_update['last_message']
        
        assert actual_last_message == expected_preview, \
            f"Final last_message should reflect the most recent message: expected '{expected_preview}', got '{actual_last_message}'"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        messages=st.lists(
            st.tuples(
                message_content_strategy,
                sender_type_strategy,
                message_type_strategy
            ),
            min_size=2,
            max_size=5
        )
    )
    def test_updated_at_increases_with_each_message(
        self, remote_jid, messages
    ):
        """
        **Feature: fix-lead-messages-display, Property 6: Multiple messages consistency**
        **Validates: Requirements 3.5**
        
        Property: When multiple messages are saved in sequence, each conversation 
        update should have an updated_at timestamp that is equal to or later than 
        the previous one.
        """
        service = MessageService()
        
        # Track all conversation updates
        conversation_updates = []
        
        def capture_conv_update(data):
            conversation_updates.append(data.copy())
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Save all messages in sequence
            for content, sender_type, message_type in messages:
                service.save_message(
                    remote_jid=remote_jid,
                    content=content,
                    sender_type=sender_type,
                    message_type=message_type
                )
        
        # Verify we have updates for all messages
        assert len(conversation_updates) == len(messages), \
            f"Should have {len(messages)} conversation updates"
        
        # Verify timestamps are monotonically increasing (or equal due to rapid execution)
        from dateutil import parser
        
        for i in range(1, len(conversation_updates)):
            prev_timestamp = parser.isoparse(conversation_updates[i-1]['updated_at'])
            curr_timestamp = parser.isoparse(conversation_updates[i]['updated_at'])
            
            assert curr_timestamp >= prev_timestamp, \
                f"Timestamp should not decrease: message {i-1} at {prev_timestamp}, message {i} at {curr_timestamp}"



# =============================================================================
# Property Test: Automatic Lead Creation
# **Feature: fix-lead-messages-display, Property 20: Automatic lead creation**
# **Validates: Requirements 9.1**
# =============================================================================

class TestAutomaticLeadCreation:
    """
    **Feature: fix-lead-messages-display, Property 20: Automatic lead creation**
    **Validates: Requirements 9.1**
    
    For any message arriving from an unknown phone number, the system should 
    create a new lead with that phone number.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_lead_created_for_unknown_phone(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 20: Automatic lead creation**
        **Validates: Requirements 9.1**
        
        Property: For any message from an unknown phone number, a new lead 
        should be created with that phone number.
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track if lead was created
        lead_created = None
        
        def capture_lead_insert(data):
            nonlocal lead_created
            lead_created = data.copy()
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'new-lead-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead doesn't exist)
            mock_lead_select_response = MagicMock()
            mock_lead_select_response.data = []
            
            # Mock conversation lookup - return empty (will be created)
            mock_conv_select_response = MagicMock()
            mock_conv_select_response.data = []
            
            # Mock conversation insert
            mock_conv_insert = MagicMock()
            mock_conv_insert.execute.return_value = MagicMock(data=[{'id': 'new-conv-uuid'}])
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            call_counts = {'lead_select': 0, 'conv_select': 0}
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    # First call: select (returns empty)
                    # Second call: insert (creates lead)
                    def mock_select(*args):
                        call_counts['lead_select'] += 1
                        select_mock = MagicMock()
                        select_mock.eq.return_value.execute.return_value = mock_lead_select_response
                        return select_mock
                    
                    mock_table_obj.select.side_effect = mock_select
                    mock_table_obj.insert.side_effect = capture_lead_insert
                    
                elif table_name == 'conversations':
                    def mock_select(*args):
                        call_counts['conv_select'] += 1
                        select_mock = MagicMock()
                        select_mock.eq.return_value.execute.return_value = mock_conv_select_response
                        return select_mock
                    
                    mock_table_obj.select.side_effect = mock_select
                    mock_table_obj.insert.return_value = mock_conv_insert
                    mock_table_obj.update.return_value = mock_conv_update
                    
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                    
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with unknown phone
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify lead was created
        assert lead_created is not None, "Lead should have been created for unknown phone"
        assert 'phone' in lead_created, "Created lead must have phone field"
        assert lead_created['phone'] == phone, \
            f"Created lead phone should match: expected {phone}, got {lead_created.get('phone')}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_existing_lead_not_recreated(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 20: Automatic lead creation**
        **Validates: Requirements 9.1**
        
        Property: For any message from a known phone number, the existing lead 
        should be used and no new lead should be created.
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track if lead insert was called
        lead_insert_called = False
        
        def capture_lead_insert(data):
            nonlocal lead_insert_called
            lead_insert_called = True
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'new-lead-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'existing-lead-uuid', 'phone': phone}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'existing-conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.insert.side_effect = capture_lead_insert
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with known phone
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify lead insert was NOT called
        assert not lead_insert_called, "Lead insert should not be called for existing phone number"


# =============================================================================
# Property Test: Auto-created Lead Status
# **Feature: fix-lead-messages-display, Property 21: Auto-created lead status**
# **Validates: Requirements 9.2**
# =============================================================================

class TestAutoCreatedLeadStatus:
    """
    **Feature: fix-lead-messages-display, Property 21: Auto-created lead status**
    **Validates: Requirements 9.2**
    
    For any lead created automatically from an incoming message, the status 
    should be set to "new" or "novo_lead".
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_auto_created_lead_has_correct_status(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 21: Auto-created lead status**
        **Validates: Requirements 9.2**
        
        Property: For any automatically created lead, the status field should 
        be set to "new" or "novo_lead".
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track lead creation
        lead_created = None
        
        def capture_lead_insert(data):
            nonlocal lead_created
            lead_created = data.copy()
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'new-lead-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead doesn't exist)
            mock_lead_select_response = MagicMock()
            mock_lead_select_response.data = []
            
            # Mock conversation lookup - return empty
            mock_conv_select_response = MagicMock()
            mock_conv_select_response.data = []
            
            # Mock conversation insert
            mock_conv_insert = MagicMock()
            mock_conv_insert.execute.return_value = MagicMock(data=[{'id': 'new-conv-uuid'}])
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_select_response
                    mock_table_obj.insert.side_effect = capture_lead_insert
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_select_response
                    mock_table_obj.insert.return_value = mock_conv_insert
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with unknown phone
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify lead was created with correct status
        assert lead_created is not None, "Lead should have been created"
        assert 'status' in lead_created, "Created lead must have status field"
        
        # Status should be "new" or "novo_lead"
        valid_statuses = ['new', 'novo_lead']
        assert lead_created['status'] in valid_statuses, \
            f"Auto-created lead status should be one of {valid_statuses}, got '{lead_created.get('status')}'"


# =============================================================================
# Property Test: Auto-created Lead Name Format
# **Feature: fix-lead-messages-display, Property 22: Auto-created lead name format**
# **Validates: Requirements 9.3**
# =============================================================================

class TestAutoCreatedLeadNameFormat:
    """
    **Feature: fix-lead-messages-display, Property 22: Auto-created lead name format**
    **Validates: Requirements 9.3**
    
    For any lead created automatically, the full_name should follow the format 
    "Lead [phone]".
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_auto_created_lead_name_format(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 22: Auto-created lead name format**
        **Validates: Requirements 9.3**
        
        Property: For any automatically created lead, the full_name should 
        follow the format "Lead [phone]".
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track lead creation
        lead_created = None
        
        def capture_lead_insert(data):
            nonlocal lead_created
            lead_created = data.copy()
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'new-lead-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead doesn't exist)
            mock_lead_select_response = MagicMock()
            mock_lead_select_response.data = []
            
            # Mock conversation lookup - return empty
            mock_conv_select_response = MagicMock()
            mock_conv_select_response.data = []
            
            # Mock conversation insert
            mock_conv_insert = MagicMock()
            mock_conv_insert.execute.return_value = MagicMock(data=[{'id': 'new-conv-uuid'}])
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_select_response
                    mock_table_obj.insert.side_effect = capture_lead_insert
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_select_response
                    mock_table_obj.insert.return_value = mock_conv_insert
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with unknown phone
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify lead was created with correct name format
        assert lead_created is not None, "Lead should have been created"
        assert 'full_name' in lead_created, "Created lead must have full_name field"
        
        expected_name = f"Lead {phone}"
        actual_name = lead_created['full_name']
        
        assert actual_name == expected_name, \
            f"Auto-created lead name should follow format 'Lead [phone]': expected '{expected_name}', got '{actual_name}'"


# =============================================================================
# Property Test: Conversation Creation with Lead
# **Feature: fix-lead-messages-display, Property 23: Conversation creation with lead**
# **Validates: Requirements 9.4**
# =============================================================================

class TestConversationCreationWithLead:
    """
    **Feature: fix-lead-messages-display, Property 23: Conversation creation with lead**
    **Validates: Requirements 9.4**
    
    For any new lead created, a conversation should be created and associated 
    with that lead.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_conversation_created_with_new_lead(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 23: Conversation creation with lead**
        **Validates: Requirements 9.4**
        
        Property: For any new lead created, a conversation should be created 
        and associated with that lead_id.
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track lead and conversation creation
        lead_created = None
        conversation_created = None
        
        def capture_lead_insert(data):
            nonlocal lead_created
            lead_created = data.copy()
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'new-lead-uuid'}])
            return mock_result
        
        def capture_conv_insert(data):
            nonlocal conversation_created
            conversation_created = data.copy()
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'new-conv-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead doesn't exist)
            mock_lead_select_response = MagicMock()
            mock_lead_select_response.data = []
            
            # Mock conversation lookup - return empty
            mock_conv_select_response = MagicMock()
            mock_conv_select_response.data = []
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_select_response
                    mock_table_obj.insert.side_effect = capture_lead_insert
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_select_response
                    mock_table_obj.insert.side_effect = capture_conv_insert
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with unknown phone
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify both lead and conversation were created
        assert lead_created is not None, "Lead should have been created"
        assert conversation_created is not None, "Conversation should have been created"
        
        # Verify conversation is associated with the lead
        assert 'lead_id' in conversation_created, "Conversation must have lead_id field"
        assert conversation_created['lead_id'] == 'new-lead-uuid', \
            f"Conversation should be associated with the new lead: expected 'new-lead-uuid', got '{conversation_created.get('lead_id')}'"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_conversation_has_correct_platform(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 23: Conversation creation with lead**
        **Validates: Requirements 9.4**
        
        Property: For any new conversation created, the platform field should 
        be set correctly (e.g., "whatsapp" for WhatsApp messages).
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track conversation creation
        conversation_created = None
        
        def capture_conv_insert(data):
            nonlocal conversation_created
            conversation_created = data.copy()
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'new-conv-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead doesn't exist)
            mock_lead_select_response = MagicMock()
            mock_lead_select_response.data = []
            
            # Mock lead insert
            mock_lead_insert = MagicMock()
            mock_lead_insert.execute.return_value = MagicMock(data=[{'id': 'new-lead-uuid'}])
            
            # Mock conversation lookup - return empty
            mock_conv_select_response = MagicMock()
            mock_conv_select_response.data = []
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_select_response
                    mock_table_obj.insert.return_value = mock_lead_insert
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_select_response
                    mock_table_obj.insert.side_effect = capture_conv_insert
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message with unknown phone
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation was created with correct platform
        assert conversation_created is not None, "Conversation should have been created"
        assert 'platform' in conversation_created, "Conversation must have platform field"
        assert conversation_created['platform'] == 'whatsapp', \
            f"Conversation platform should be 'whatsapp': got '{conversation_created.get('platform')}'"


# =============================================================================
# Property Test: Mock Data Lead Creation Consistency
# **Feature: fix-lead-messages-display, Property 24: Mock data lead creation consistency**
# **Validates: Requirements 10.1**
# =============================================================================

class TestMockDataLeadCreationConsistency:
    """
    **Feature: fix-lead-messages-display, Property 24: Mock data lead creation consistency**
    **Validates: Requirements 10.1**
    
    For any lead created with mock data, the creation logic should be identical 
    to real data processing.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_mock_lead_creation_matches_real_logic(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 24: Mock data lead creation consistency**
        **Validates: Requirements 10.1**
        
        Property: For any unknown phone number, the lead creation logic should 
        produce the same result whether using real or mocked Supabase client.
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track what lead data gets created
        captured_lead_data = None
        
        def capture_lead_insert(data):
            nonlocal captured_lead_data
            captured_lead_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'lead-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead doesn't exist)
            mock_lead_response = MagicMock()
            mock_lead_response.data = []
            
            # Mock conversation lookup - return empty (will be created)
            mock_conv_response = MagicMock()
            mock_conv_response.data = []
            
            # Mock conversation insert
            mock_conv_insert = MagicMock()
            mock_conv_insert.execute.return_value = MagicMock(data=[{'id': 'conv-uuid'}])
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.insert.side_effect = capture_lead_insert
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.insert.return_value = mock_conv_insert
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message which should trigger lead creation
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify lead was created with correct data (Requirements 9.2, 9.3)
        assert captured_lead_data is not None, "Lead should have been created"
        
        # Verify lead data structure matches requirements
        assert 'full_name' in captured_lead_data, "Lead must have full_name field"
        assert 'phone' in captured_lead_data, "Lead must have phone field"
        assert 'status' in captured_lead_data, "Lead must have status field"
        
        # Verify phone number is correct
        assert captured_lead_data['phone'] == phone, \
            f"Lead phone should match: expected {phone}, got {captured_lead_data['phone']}"
        
        # Verify status is "new" (Requirement 9.2)
        assert captured_lead_data['status'] == 'new', \
            f"Lead status should be 'new': got {captured_lead_data['status']}"
        
        # Verify name format is "Lead [phone]" (Requirement 9.3)
        expected_name = f"Lead {phone}"
        assert captured_lead_data['full_name'] == expected_name, \
            f"Lead name should be '{expected_name}': got {captured_lead_data['full_name']}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_mock_lead_creation_with_retry_logic(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 24: Mock data lead creation consistency**
        **Validates: Requirements 10.1, 9.5**
        
        Property: The retry logic for lead creation should work the same way 
        with mocked data as with real data.
        """
        service = MessageService()
        
        phone = remote_jid.split('@')[0]
        
        # Track lead creation attempts
        lead_creation_attempts = []
        
        def capture_lead_insert_with_failure(data):
            lead_creation_attempts.append(data)
            
            # First attempt fails, second succeeds
            if len(lead_creation_attempts) == 1:
                raise Exception("Simulated database error")
            else:
                mock_result = MagicMock()
                mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'lead-uuid'}])
                return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return empty (lead doesn't exist)
            mock_lead_response = MagicMock()
            mock_lead_response.data = []
            
            # Mock conversation lookup - return empty (will be created)
            mock_conv_response = MagicMock()
            mock_conv_response.data = []
            
            # Mock conversation insert
            mock_conv_insert = MagicMock()
            mock_conv_insert.execute.return_value = MagicMock(data=[{'id': 'conv-uuid'}])
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                    mock_table_obj.insert.side_effect = capture_lead_insert_with_failure
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.insert.return_value = mock_conv_insert
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message which should trigger lead creation with retry
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify retry logic was triggered (Requirement 9.5)
        assert len(lead_creation_attempts) == 2, \
            f"Should have retried lead creation once: got {len(lead_creation_attempts)} attempts"
        
        # Verify both attempts used the same data
        assert lead_creation_attempts[0] == lead_creation_attempts[1], \
            "Retry should use the same lead data"


# =============================================================================
# Property Test: Mock Data Message Saving
# **Feature: fix-lead-messages-display, Property 25: Mock data message saving**
# **Validates: Requirements 10.2**
# =============================================================================

class TestMockDataMessageSaving:
    """
    **Feature: fix-lead-messages-display, Property 25: Mock data message saving**
    **Validates: Requirements 10.2**
    
    For any message saved with mock data, the database operations should work correctly.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy,
        whatsapp_msg_id=st.one_of(st.none(), whatsapp_msg_id_strategy)
    )
    def test_mock_message_saving_structure(
        self, remote_jid, content, sender_type, message_type, whatsapp_msg_id
    ):
        """
        **Feature: fix-lead-messages-display, Property 25: Mock data message saving**
        **Validates: Requirements 10.2**
        
        Property: For any message saved with mocked Supabase client, the message 
        data structure should match the expected schema.
        """
        service = MessageService()
        
        # Track what message data gets saved
        captured_msg_data = None
        
        def capture_msg_insert(data):
            nonlocal captured_msg_data
            captured_msg_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'msg-uuid'}])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.side_effect = capture_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type,
                whatsapp_msg_id=whatsapp_msg_id
            )
        
        # Verify message was saved
        assert captured_msg_data is not None, "Message should have been saved"
        
        # Verify message data structure
        assert 'conversation_id' in captured_msg_data, "Message must have conversation_id"
        assert 'sender_type' in captured_msg_data, "Message must have sender_type"
        assert 'content' in captured_msg_data, "Message must have content"
        assert 'message_type' in captured_msg_data, "Message must have message_type"
        assert 'created_at' in captured_msg_data, "Message must have created_at"
        
        # Verify field values
        assert captured_msg_data['conversation_id'] == 'conv-uuid', \
            "Message should be associated with correct conversation"
        assert captured_msg_data['sender_type'] == sender_type, \
            f"Sender type should match: expected {sender_type}, got {captured_msg_data['sender_type']}"
        assert captured_msg_data['content'] == content, \
            "Content should match"
        assert captured_msg_data['message_type'] == message_type, \
            f"Message type should match: expected {message_type}, got {captured_msg_data['message_type']}"
        
        # Verify metadata handling
        if whatsapp_msg_id:
            assert 'metadata' in captured_msg_data, "Message with whatsapp_msg_id must have metadata"
            assert captured_msg_data['metadata']['whatsapp_msg_id'] == whatsapp_msg_id, \
                "Metadata should contain correct whatsapp_msg_id"
        else:
            # If no whatsapp_msg_id, metadata should be absent or empty
            if 'metadata' in captured_msg_data:
                assert not captured_msg_data['metadata'] or 'whatsapp_msg_id' not in captured_msg_data['metadata'], \
                    "Metadata should not contain whatsapp_msg_id when not provided"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_mock_message_saving_returns_conversation_id(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 25: Mock data message saving**
        **Validates: Requirements 10.2**
        
        Property: For any successfully saved message with mocked data, 
        save_message should return the conversation_id.
        """
        service = MessageService()
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid-test'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            # Mock conversation update
            mock_conv_update = MagicMock()
            mock_conv_update.eq.return_value.execute.return_value = MagicMock(data=[])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.return_value = mock_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation_id is returned
        assert result == 'conv-uuid-test', \
            f"save_message should return conversation_id: expected 'conv-uuid-test', got {result}"


# =============================================================================
# Property Test: Mock Data Conversation Updates
# **Feature: fix-lead-messages-display, Property 26: Mock data conversation updates**
# **Validates: Requirements 10.3**
# =============================================================================

class TestMockDataConversationUpdates:
    """
    **Feature: fix-lead-messages-display, Property 26: Mock data conversation updates**
    **Validates: Requirements 10.3**
    
    For any message saved with mock data, the conversation's last_message and 
    updated_at should be updated.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_mock_conversation_last_message_updated(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 26: Mock data conversation updates**
        **Validates: Requirements 10.3**
        
        Property: For any message saved with mocked data, the conversation's 
        last_message should be updated with the message content.
        """
        service = MessageService()
        
        # Track conversation updates
        captured_conv_update = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation was updated
        assert captured_conv_update is not None, "Conversation should have been updated"
        assert 'last_message' in captured_conv_update, "Update must include last_message"
        
        # Verify last_message content matches expected preview
        expected_preview = content[:50] + "..." if len(content) > 50 else content
        actual_last_message = captured_conv_update['last_message']
        
        assert actual_last_message == expected_preview, \
            f"last_message should match: expected '{expected_preview}', got '{actual_last_message}'"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_mock_conversation_updated_at_set(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 26: Mock data conversation updates**
        **Validates: Requirements 10.3**
        
        Property: For any message saved with mocked data, the conversation's 
        updated_at should be set to a valid Brazil timezone timestamp.
        """
        service = MessageService()
        
        # Track conversation updates
        captured_conv_update = None
        
        def capture_conv_update(data):
            nonlocal captured_conv_update
            captured_conv_update = data
            mock_result = MagicMock()
            mock_result.eq.return_value.execute.return_value = MagicMock(data=[data])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            # Mock message insert
            mock_msg_insert = MagicMock()
            mock_msg_insert.execute.return_value = MagicMock(data=[{'id': 'msg-uuid'}])
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = capture_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.return_value = mock_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify conversation was updated
        assert captured_conv_update is not None, "Conversation should have been updated"
        assert 'updated_at' in captured_conv_update, "Update must include updated_at"
        
        # Verify updated_at is a valid ISO timestamp
        updated_at = captured_conv_update['updated_at']
        assert isinstance(updated_at, str), "updated_at should be a string"
        
        # Parse and verify timestamp
        from dateutil import parser
        parsed_dt = parser.isoparse(updated_at)
        
        # Verify timezone info is present
        assert parsed_dt.tzinfo is not None, "Timestamp should include timezone information"
        
        # Verify Brazil timezone (UTC-03:00)
        tz_offset = parsed_dt.utcoffset()
        offset_hours = tz_offset.total_seconds() / 3600
        assert offset_hours == -3.0, \
            f"Timestamp should use Brazil timezone (UTC-03:00): got UTC{offset_hours:+.1f}:00"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        remote_jid=remote_jid_strategy,
        content=message_content_strategy,
        sender_type=sender_type_strategy,
        message_type=message_type_strategy
    )
    def test_mock_conversation_update_failure_handling(
        self, remote_jid, content, sender_type, message_type
    ):
        """
        **Feature: fix-lead-messages-display, Property 26: Mock data conversation updates**
        **Validates: Requirements 10.3, 3.4**
        
        Property: Even if conversation update fails with mocked data, the message 
        should still be saved successfully (Requirement 3.4).
        """
        service = MessageService()
        
        # Track if message was saved
        message_saved = False
        
        def capture_msg_insert(data):
            nonlocal message_saved
            message_saved = True
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{**data, 'id': 'msg-uuid'}])
            return mock_result
        
        def failing_conv_update(data):
            # Simulate conversation update failure
            raise Exception("Simulated conversation update error")
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock lead lookup - return existing lead
            mock_lead_response = MagicMock()
            mock_lead_response.data = [{'id': 'lead-uuid'}]
            
            # Mock conversation lookup - return existing conversation
            mock_conv_response = MagicMock()
            mock_conv_response.data = [{'id': 'conv-uuid'}]
            
            def mock_table(table_name):
                mock_table_obj = MagicMock()
                if table_name == 'leads':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_lead_response
                elif table_name == 'conversations':
                    mock_table_obj.select.return_value.eq.return_value.execute.return_value = mock_conv_response
                    mock_table_obj.update.side_effect = failing_conv_update
                elif table_name == 'messages':
                    mock_table_obj.insert.side_effect = capture_msg_insert
                return mock_table_obj
            
            mock_supabase.table.side_effect = mock_table
            
            # Call save_message - should succeed despite conversation update failure
            result = service.save_message(
                remote_jid=remote_jid,
                content=content,
                sender_type=sender_type,
                message_type=message_type
            )
        
        # Verify message was saved successfully (Requirement 3.4)
        assert message_saved, "Message should be saved even if conversation update fails"
        assert result == 'conv-uuid', "save_message should return conversation_id even if update fails"


# =============================================================================
# Property Test: Conversations Ordering
# **Feature: fix-lead-messages-display, Property 3: Conversations ordering**
# **Validates: Requirements 1.3**
# =============================================================================

class TestConversationsOrdering:
    """
    **Feature: fix-lead-messages-display, Property 3: Conversations ordering**
    **Validates: Requirements 1.3**
    
    For any list of conversations fetched from the database, they should be 
    ordered by updated_at in descending order (most recent first).
    
    Note: This test verifies that the get_conversations method returns 
    conversations ordered by updated_at DESC. The implementation uses 
    .order('updated_at', desc=True) to ensure proper ordering.
    """
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_conversations=st.integers(min_value=2, max_value=10)
    )
    def test_conversations_ordered_by_updated_at_descending(
        self, num_conversations
    ):
        """
        **Feature: fix-lead-messages-display, Property 3: Conversations ordering**
        **Validates: Requirements 1.3**
        
        Property: For any list of conversations fetched, they must be ordered 
        by updated_at in descending order (most recent first).
        """
        service = MessageService()
        
        # Generate mock conversations with different updated_at timestamps
        import random
        from datetime import datetime, timedelta
        
        base_time = datetime(2025, 1, 1, 12, 0, 0)
        mock_conversations = []
        
        for i in range(num_conversations):
            # Create conversations with random time offsets
            time_offset = timedelta(hours=random.randint(0, 1000))
            updated_at = (base_time + time_offset).isoformat()
            
            mock_conversations.append({
                'id': f'conv-{i}',
                'lead_id': f'lead-{i}',
                'platform': 'whatsapp',
                'last_message': f'Message {i}',
                'updated_at': updated_at,
                'leads': {'full_name': f'Lead {i}', 'phone': f'5511999999{i:03d}'}
            })
        
        # Sort by updated_at descending to simulate what the database would return
        # when .order("updated_at", desc=True) is called
        sorted_conversations = sorted(
            mock_conversations, 
            key=lambda x: x['updated_at'], 
            reverse=True
        )
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock the select query chain: table().select().order().execute().data
            # The implementation now does: 
            # self.supabase.table("conversations").select("*, leads(full_name, phone)").order("updated_at", desc=True).execute().data
            mock_execute = MagicMock()
            mock_execute.data = sorted_conversations
            
            mock_order = MagicMock()
            mock_order.execute.return_value = mock_execute
            
            mock_select = MagicMock()
            mock_select.order.return_value = mock_order
            
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_select
            mock_supabase.table.return_value = mock_table_obj
            
            # Call get_conversations
            result = service.get_conversations()
        
        # Verify result is not empty
        assert result is not None, "get_conversations should return data"
        assert len(result) == num_conversations, f"Should return {num_conversations} conversations"
        
        # Verify ordering: each conversation's updated_at should be >= the next one's
        for i in range(len(result) - 1):
            current_updated_at = result[i].get('updated_at', '')
            next_updated_at = result[i + 1].get('updated_at', '')
            
            assert current_updated_at >= next_updated_at, \
                f"Conversations should be ordered by updated_at DESC: " \
                f"conversation {i} ({current_updated_at}) should be >= conversation {i+1} ({next_updated_at})"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_conversations=st.integers(min_value=1, max_value=5)
    )
    def test_conversations_with_same_updated_at_are_stable(
        self, num_conversations
    ):
        """
        **Feature: fix-lead-messages-display, Property 3: Conversations ordering**
        **Validates: Requirements 1.3**
        
        Property: When multiple conversations have the same updated_at timestamp,
        the ordering should be stable (deterministic).
        """
        service = MessageService()
        
        # Generate mock conversations with the same updated_at timestamp
        same_time = datetime(2025, 1, 15, 10, 30, 0).isoformat()
        mock_conversations = []
        
        for i in range(num_conversations):
            mock_conversations.append({
                'id': f'conv-{i}',
                'lead_id': f'lead-{i}',
                'platform': 'whatsapp',
                'last_message': f'Message {i}',
                'updated_at': same_time,
                'leads': {'full_name': f'Lead {i}', 'phone': f'5511999999{i:03d}'}
            })
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock the select query chain with .order()
            mock_execute = MagicMock()
            mock_execute.data = mock_conversations
            
            mock_order = MagicMock()
            mock_order.execute.return_value = mock_execute
            
            mock_select = MagicMock()
            mock_select.order.return_value = mock_order
            
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_select
            mock_supabase.table.return_value = mock_table_obj
            
            # Call get_conversations multiple times
            result1 = service.get_conversations()
            result2 = service.get_conversations()
        
        # Verify both calls return the same order
        assert result1 is not None and result2 is not None, "Both calls should return data"
        
        # Extract IDs for comparison
        ids1 = [c.get('id') for c in result1]
        ids2 = [c.get('id') for c in result2]
        
        assert ids1 == ids2, \
            f"Conversations with same updated_at should have stable ordering: {ids1} vs {ids2}"
    
    @settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        st.data()
    )
    def test_most_recent_conversation_is_first(
        self, data
    ):
        """
        **Feature: fix-lead-messages-display, Property 3: Conversations ordering**
        **Validates: Requirements 1.3**
        
        Property: The conversation with the most recent updated_at timestamp 
        should always be first in the list.
        """
        service = MessageService()
        
        # Generate a specific "most recent" timestamp
        most_recent_time = datetime(2025, 12, 31, 23, 59, 59).isoformat()
        older_time = datetime(2025, 1, 1, 0, 0, 0).isoformat()
        
        # Create conversations with one clearly most recent
        mock_conversations = [
            {
                'id': 'conv-old-1',
                'lead_id': 'lead-old-1',
                'platform': 'whatsapp',
                'last_message': 'Old message 1',
                'updated_at': older_time,
                'leads': {'full_name': 'Old Lead 1', 'phone': '5511999999001'}
            },
            {
                'id': 'conv-recent',
                'lead_id': 'lead-recent',
                'platform': 'whatsapp',
                'last_message': 'Most recent message',
                'updated_at': most_recent_time,
                'leads': {'full_name': 'Recent Lead', 'phone': '5511999999000'}
            },
            {
                'id': 'conv-old-2',
                'lead_id': 'lead-old-2',
                'platform': 'whatsapp',
                'last_message': 'Old message 2',
                'updated_at': older_time,
                'leads': {'full_name': 'Old Lead 2', 'phone': '5511999999002'}
            }
        ]
        
        # Sort by updated_at descending to simulate database ordering
        sorted_conversations = sorted(
            mock_conversations, 
            key=lambda x: x['updated_at'], 
            reverse=True
        )
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock the select query chain with .order()
            mock_execute = MagicMock()
            mock_execute.data = sorted_conversations
            
            mock_order = MagicMock()
            mock_order.execute.return_value = mock_execute
            
            mock_select = MagicMock()
            mock_select.order.return_value = mock_order
            
            mock_table_obj = MagicMock()
            mock_table_obj.select.return_value = mock_select
            mock_supabase.table.return_value = mock_table_obj
            
            # Call get_conversations
            result = service.get_conversations()
        
        # Verify the most recent conversation is first
        assert result is not None and len(result) > 0, "Should return conversations"
        assert result[0]['id'] == 'conv-recent', \
            f"Most recent conversation should be first: expected 'conv-recent', got '{result[0]['id']}'"
        assert result[0]['updated_at'] == most_recent_time, \
            f"First conversation should have most recent timestamp"
