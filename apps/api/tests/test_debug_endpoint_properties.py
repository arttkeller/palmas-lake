"""
Property-based test for debug endpoint message count and sample.

Feature: fix-chat-messages-loading, Property 5: Debug endpoint returns message count and sample
Validates: Requirements 5.1
"""

import sys
import os
from hypothesis import given, strategies as st, settings
from unittest.mock import patch, MagicMock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.debug import debug_messages, get_diagnostic_hints

# Strategy: generate valid UUIDs as strings
uuid_strategy = st.uuids().map(str)

# Strategy: generate valid sender types
sender_type_strategy = st.sampled_from(['user', 'ai', 'lead'])

# Strategy: generate valid message types
message_type_strategy = st.sampled_from(['text', 'image', 'audio', 'video', 'document'])

# Strategy: generate ISO format timestamps
timestamp_strategy = st.datetimes().map(lambda dt: dt.isoformat())

# Strategy: generate content
content_strategy = st.text(min_size=0, max_size=200)


def generate_mock_message(conversation_id: str, msg_id: str = None):
    """Generate a mock message dict for testing."""
    return {
        'id': msg_id or str(__import__('uuid').uuid4()),
        'conversation_id': conversation_id,
        'sender_type': 'user',
        'content': 'Test message',
        'message_type': 'text',
        'created_at': '2024-01-01T00:00:00',
        'metadata': None
    }


# Strategy: generate a list of messages (0 to 10)
def messages_list_strategy(conversation_id: str):
    """Generate a list of mock messages for a conversation."""
    return st.integers(min_value=0, max_value=10).map(
        lambda n: [generate_mock_message(conversation_id) for _ in range(n)]
    )


# Feature: fix-chat-messages-loading, Property 5: Debug endpoint returns message count and sample
@given(
    conversation_id=uuid_strategy,
    num_messages=st.integers(min_value=0, max_value=10)
)
@settings(max_examples=100)
def test_debug_endpoint_returns_count_and_sample(conversation_id, num_messages):
    """
    Property 5: Debug endpoint returns message count and sample

    *For any* conversation_id passed to the debug endpoint, the response 
    should contain a 'count' field matching the actual number of messages, 
    and a 'sample' field containing at most 3 messages.

    Validates: Requirements 5.1
    """
    # Generate mock messages
    mock_messages = [generate_mock_message(conversation_id) for _ in range(num_messages)]
    
    # Mock conversation data
    mock_conversation = {
        'id': conversation_id,
        'lead_id': str(__import__('uuid').uuid4()),
        'platform': 'whatsapp',
        'last_message': 'Test'
    }
    
    # Create mock Supabase client
    mock_client = MagicMock()
    
    # Mock conversation query
    mock_conv_result = MagicMock()
    mock_conv_result.data = [mock_conversation]
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_conv_result
    
    # Mock messages query - need to chain properly
    mock_msg_table = MagicMock()
    mock_msg_select = MagicMock()
    mock_msg_eq = MagicMock()
    mock_msg_order = MagicMock()
    mock_msg_result = MagicMock()
    mock_msg_result.data = mock_messages
    
    mock_msg_table.select.return_value = mock_msg_select
    mock_msg_select.eq.return_value = mock_msg_eq
    mock_msg_eq.order.return_value = mock_msg_order
    mock_msg_order.execute.return_value = mock_msg_result
    
    # Configure table() to return different mocks based on table name
    def table_side_effect(table_name):
        if table_name == "conversations":
            conv_mock = MagicMock()
            conv_select = MagicMock()
            conv_eq = MagicMock()
            conv_eq.execute.return_value = mock_conv_result
            conv_select.eq.return_value = conv_eq
            conv_mock.select.return_value = conv_select
            return conv_mock
        elif table_name == "messages":
            return mock_msg_table
        return MagicMock()
    
    mock_client.table.side_effect = table_side_effect
    
    with patch('routers.debug.create_client', return_value=mock_client):
        result = debug_messages(conversation_id)
    
    # Property assertions
    # 1. Response contains 'count' field
    assert 'count' in result, "Response must contain 'count' field"
    
    # 2. Count matches actual number of messages
    assert result['count'] == num_messages, \
        f"Count should be {num_messages}, got {result['count']}"
    
    # 3. Response contains 'sample' field
    assert 'sample' in result, "Response must contain 'sample' field"
    
    # 4. Sample contains at most 3 messages
    assert len(result['sample']) <= 3, \
        f"Sample should contain at most 3 messages, got {len(result['sample'])}"
    
    # 5. Sample contains min(num_messages, 3) messages
    expected_sample_size = min(num_messages, 3)
    assert len(result['sample']) == expected_sample_size, \
        f"Sample should contain {expected_sample_size} messages, got {len(result['sample'])}"
    
    # 6. Response contains conversation_id
    assert result['conversation_id'] == conversation_id, \
        f"Response conversation_id should match input"
    
    # 7. Response contains schema info
    assert result['schema'] == 'palmaslake-agno', \
        "Response should indicate schema is palmaslake-agno"


# Feature: fix-chat-messages-loading, Property 5: Debug endpoint returns message count and sample
@given(
    conversation_id=uuid_strategy,
    conversation_exists=st.booleans(),
    message_count=st.integers(min_value=0, max_value=5)
)
@settings(max_examples=100)
def test_diagnostic_hints_generated_correctly(conversation_id, conversation_exists, message_count):
    """
    Property 5 (sub-property): Diagnostic hints generation

    *For any* conversation_id, when zero messages are found or conversation 
    doesn't exist, the get_diagnostic_hints function should return appropriate hints.

    Validates: Requirements 5.3
    """
    hints = get_diagnostic_hints(conversation_id, message_count, conversation_exists)
    
    # If conversation doesn't exist, hints should mention it
    if not conversation_exists:
        assert len(hints) > 0, "Should have hints when conversation doesn't exist"
        assert any(conversation_id in hint for hint in hints), \
            "Hints should reference the conversation_id"
    
    # If conversation exists but has zero messages, hints should be provided
    elif message_count == 0:
        assert len(hints) > 0, "Should have hints when zero messages found"
        assert any("No messages" in hint or "messages" in hint.lower() for hint in hints), \
            "Hints should mention messages"
    
    # If conversation exists and has messages, no hints needed
    else:
        assert len(hints) == 0, "Should have no hints when messages exist"
