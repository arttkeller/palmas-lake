"""
Property-based test for message serialization round-trip.

Feature: fix-chat-messages-loading, Property 6: Message serialization round-trip
Validates: Requirements 6.1, 6.2, 6.3
"""

import sys
import os
from hypothesis import given, strategies as st, settings
import uuid

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.message_serializer import (
    serialize_message,
    deserialize_message,
    REQUIRED_FIELDS
)

# Strategy: generate valid UUIDs as strings
uuid_strategy = st.uuids().map(str)

# Strategy: generate valid sender types
sender_type_strategy = st.sampled_from(['user', 'ai', 'lead'])

# Strategy: generate valid message types
message_type_strategy = st.sampled_from(['text', 'image', 'audio', 'video', 'document'])

# Strategy: generate ISO format timestamps
timestamp_strategy = st.datetimes().map(lambda dt: dt.isoformat())

# Strategy: generate content with special characters
content_strategy = st.text(
    alphabet=st.characters(
        whitelist_categories=('L', 'N', 'P', 'S', 'Z'),
        whitelist_characters='\n\t\r'
    ),
    min_size=0,
    max_size=500
)

# Strategy: generate metadata with special characters (optional field)
metadata_value_strategy = st.one_of(
    st.text(min_size=0, max_size=100),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.booleans(),
    st.none()
)

metadata_strategy = st.one_of(
    st.none(),
    st.dictionaries(
        keys=st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('L', 'N'))),
        values=metadata_value_strategy,
        min_size=0,
        max_size=5
    )
)

# Strategy: generate a complete valid message dict
message_strategy = st.fixed_dictionaries({
    'id': uuid_strategy,
    'conversation_id': uuid_strategy,
    'sender_type': sender_type_strategy,
    'content': content_strategy,
    'message_type': message_type_strategy,
    'created_at': timestamp_strategy,
}).flatmap(lambda msg: st.fixed_dictionaries({
    **{k: st.just(v) for k, v in msg.items()},
    'metadata': metadata_strategy
}))


# Feature: fix-chat-messages-loading, Property 6: Message serialization round-trip
@given(msg=message_strategy)
@settings(max_examples=100)
def test_message_serialization_round_trip(msg):
    """
    Property 6: Message serialization round-trip

    *For any* valid message dict containing all required fields 
    (id, conversation_id, sender_type, content, message_type, created_at) 
    and optional metadata with arbitrary characters, serializing to JSON 
    and then deserializing should produce a dict equivalent to the original.

    Validates: Requirements 6.1, 6.2, 6.3
    """
    # Remove None metadata to match expected behavior
    original = {k: v for k, v in msg.items() if v is not None}
    
    # Serialize to JSON string
    json_str = serialize_message(original)
    
    # Verify it's a valid string
    assert isinstance(json_str, str)
    assert len(json_str) > 0
    
    # Deserialize back to dict
    result = deserialize_message(json_str)
    
    # Verify all required fields are present
    for field in REQUIRED_FIELDS:
        assert field in result, f"Missing required field: {field}"
    
    # Verify round-trip produces equivalent dict
    assert result == original, f"Round-trip mismatch:\nOriginal: {original}\nResult: {result}"


# Feature: fix-chat-messages-loading, Property 6: Message serialization round-trip
@given(msg=message_strategy)
@settings(max_examples=100)
def test_metadata_with_special_characters_preserved(msg):
    """
    Property 6 (sub-property): Metadata with special characters preserved

    *For any* message with metadata containing special characters,
    the serialization round-trip SHALL preserve all metadata fields exactly.

    Validates: Requirements 6.3
    """
    # Remove None metadata
    original = {k: v for k, v in msg.items() if v is not None}
    
    # Serialize and deserialize
    json_str = serialize_message(original)
    result = deserialize_message(json_str)
    
    # If original had metadata, verify it's preserved exactly
    if 'metadata' in original:
        assert 'metadata' in result
        assert result['metadata'] == original['metadata'], \
            f"Metadata mismatch:\nOriginal: {original['metadata']}\nResult: {result['metadata']}"
