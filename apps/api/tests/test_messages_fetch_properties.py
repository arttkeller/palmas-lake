"""
Property-based test for messages fetch functionality.

Feature: fix-chat-messages-loading, Property 1: Messages fetch returns all messages for a conversation
Validates: Requirements 1.1, 1.2
"""

import sys
import os
from hypothesis import given, strategies as st, settings
from unittest.mock import patch, MagicMock
import uuid

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.message_service import MessageService

# Strategy: generate valid UUIDs as strings
uuid_strategy = st.uuids().map(str)

# Strategy: generate valid sender types
sender_type_strategy = st.sampled_from(['user', 'ai', 'lead'])

# Strategy: generate valid message types
message_type_strategy = st.sampled_from(['text', 'image', 'audio', 'video', 'document'])

# Strategy: generate ISO format timestamps
timestamp_strategy = st.datetimes().map(lambda dt: dt.isoformat())

# Strategy: generate content
content_strategy = st.text(min_size=1, max_size=200)


def generate_mock_message(conversation_id: str, msg_id: str = None, sender_type: str = 'user', 
                          content: str = 'Test message', message_type: str = 'text',
                          created_at: str = '2024-01-01T00:00:00'):
    """Generate a mock message dict for testing."""
    return {
        'id': msg_id or str(uuid.uuid4()),
        'conversation_id': conversation_id,
        'sender_type': sender_type,
        'content': content,
        'message_type': message_type,
        'created_at': created_at,
        'metadata': None
    }


# Feature: fix-chat-messages-loading, Property 1: Messages fetch returns all messages for a conversation
@given(
    conversation_id=uuid_strategy,
    num_messages=st.integers(min_value=0, max_value=20),
    sender_types=st.lists(sender_type_strategy, min_size=0, max_size=20),
    message_types=st.lists(message_type_strategy, min_size=0, max_size=20)
)
@settings(max_examples=100)
def test_messages_fetch_returns_all_messages_for_conversation(
    conversation_id, num_messages, sender_types, message_types
):
    """
    Property 1: Messages fetch returns all messages for a conversation

    *For any* valid conversation_id that has messages in the database, 
    fetching messages via the API endpoint /api/chat/messages/{conversation_id} 
    should return all messages belonging to that conversation, and every 
    returned message should have conversation_id equal to the requested id.

    Validates: Requirements 1.1, 1.2
    """
    # Generate mock messages for this conversation
    mock_messages = []
    for i in range(num_messages):
        sender = sender_types[i] if i < len(sender_types) else 'user'
        msg_type = message_types[i] if i < len(message_types) else 'text'
        mock_messages.append(generate_mock_message(
            conversation_id=conversation_id,
            sender_type=sender,
            message_type=msg_type,
            created_at=f'2024-01-01T{i:02d}:00:00'
        ))
    
    # Create mock Supabase client
    mock_client = MagicMock()
    
    # Mock messages query result
    mock_result = MagicMock()
    mock_result.data = mock_messages
    
    # Configure the mock chain: table().select().eq().execute()
    mock_table = MagicMock()
    mock_select = MagicMock()
    mock_eq = MagicMock()
    
    mock_table.select.return_value = mock_select
    mock_select.eq.return_value = mock_eq
    mock_eq.execute.return_value = mock_result
    
    mock_client.table.return_value = mock_table
    
    # Patch create_client to return our mock
    with patch('services.message_service.create_client', return_value=mock_client):
        service = MessageService()
        result = service.get_messages(conversation_id)
    
    # Property assertions
    
    # 1. Result should be a list
    assert isinstance(result, list), "Result should be a list"
    
    # 2. Result should contain exactly the same number of messages
    assert len(result) == num_messages, \
        f"Should return {num_messages} messages, got {len(result)}"
    
    # 3. Every returned message should have conversation_id equal to the requested id
    for msg in result:
        assert msg['conversation_id'] == conversation_id, \
            f"Message conversation_id should be {conversation_id}, got {msg['conversation_id']}"
    
    # 4. All messages should have required fields
    required_fields = ['id', 'conversation_id', 'sender_type', 'content', 'message_type', 'created_at']
    for msg in result:
        for field in required_fields:
            assert field in msg, f"Message missing required field: {field}"
    
    # 5. Messages should be sorted by created_at
    if len(result) > 1:
        for i in range(len(result) - 1):
            assert result[i]['created_at'] <= result[i + 1]['created_at'], \
                "Messages should be sorted by created_at"


# Feature: fix-chat-messages-loading, Property 1: Messages fetch returns all messages for a conversation
@given(
    conversation_id=uuid_strategy,
    other_conversation_id=uuid_strategy
)
@settings(max_examples=100)
def test_messages_fetch_only_returns_messages_for_requested_conversation(
    conversation_id, other_conversation_id
):
    """
    Property 1 (sub-property): Messages fetch filters by conversation_id

    *For any* two different conversation_ids, fetching messages for one 
    conversation should not return messages from the other conversation.

    Validates: Requirements 1.1, 1.2
    """
    # Skip if both IDs happen to be the same (very unlikely but possible)
    if conversation_id == other_conversation_id:
        return
    
    # Generate messages for the requested conversation
    requested_messages = [
        generate_mock_message(conversation_id, created_at='2024-01-01T00:00:00'),
        generate_mock_message(conversation_id, created_at='2024-01-01T01:00:00'),
    ]
    
    # Create mock Supabase client
    mock_client = MagicMock()
    
    # Mock messages query result - only return messages for requested conversation
    mock_result = MagicMock()
    mock_result.data = requested_messages
    
    # Configure the mock chain
    mock_table = MagicMock()
    mock_select = MagicMock()
    mock_eq = MagicMock()
    
    mock_table.select.return_value = mock_select
    mock_select.eq.return_value = mock_eq
    mock_eq.execute.return_value = mock_result
    
    mock_client.table.return_value = mock_table
    
    with patch('services.message_service.create_client', return_value=mock_client):
        service = MessageService()
        result = service.get_messages(conversation_id)
    
    # Property assertions
    
    # 1. All returned messages should belong to the requested conversation
    for msg in result:
        assert msg['conversation_id'] == conversation_id, \
            f"Message should belong to conversation {conversation_id}, not {msg['conversation_id']}"
    
    # 2. No messages should belong to the other conversation
    for msg in result:
        assert msg['conversation_id'] != other_conversation_id, \
            f"Message should not belong to other conversation {other_conversation_id}"


# Feature: fix-chat-messages-loading, Property 1: Messages fetch returns all messages for a conversation
@given(conversation_id=uuid_strategy)
@settings(max_examples=100)
def test_messages_fetch_returns_empty_list_for_conversation_with_no_messages(conversation_id):
    """
    Property 1 (sub-property): Empty conversation returns empty list

    *For any* valid conversation_id that has no messages in the database,
    fetching messages should return an empty list (not None or error).

    Validates: Requirements 1.1, 1.2
    """
    # Create mock Supabase client
    mock_client = MagicMock()
    
    # Mock empty result
    mock_result = MagicMock()
    mock_result.data = []
    
    # Configure the mock chain
    mock_table = MagicMock()
    mock_select = MagicMock()
    mock_eq = MagicMock()
    
    mock_table.select.return_value = mock_select
    mock_select.eq.return_value = mock_eq
    mock_eq.execute.return_value = mock_result
    
    mock_client.table.return_value = mock_table
    
    with patch('services.message_service.create_client', return_value=mock_client):
        service = MessageService()
        result = service.get_messages(conversation_id)
    
    # Property assertions
    
    # 1. Result should be a list (not None)
    assert result is not None, "Result should not be None"
    assert isinstance(result, list), "Result should be a list"
    
    # 2. Result should be empty
    assert len(result) == 0, "Result should be empty for conversation with no messages"

