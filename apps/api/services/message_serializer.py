"""
Message Serializer Service

Provides serialization, deserialization, and pretty-printing for message dicts.
Implements Requirements 6.1, 6.2, 6.3 for the fix-chat-messages-loading spec.

Feature: fix-chat-messages-loading, Property 6: Message serialization round-trip
"""

import json
from typing import Any, Dict, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Required fields for a valid message
REQUIRED_FIELDS = ['id', 'conversation_id', 'sender_type', 'content', 'message_type', 'created_at']


class MessageSerializerError(Exception):
    """Custom exception for serialization errors."""
    pass


def serialize_message(msg: dict) -> str:
    """
    Serializes a message dict to a JSON string.
    
    Implements Requirement 6.1: Produces a valid JSON string containing all 
    required fields (id, conversation_id, sender_type, content, message_type, created_at).
    
    Args:
        msg: A dictionary containing message data with required fields
        
    Returns:
        A valid JSON string representation of the message
        
    Raises:
        MessageSerializerError: If required fields are missing or serialization fails
    """
    if not isinstance(msg, dict):
        raise MessageSerializerError(f"Expected dict, got {type(msg).__name__}")
    
    # Validate required fields
    missing_fields = [field for field in REQUIRED_FIELDS if field not in msg]
    if missing_fields:
        raise MessageSerializerError(f"Missing required fields: {missing_fields}")
    
    try:
        # Use ensure_ascii=False to preserve special characters in metadata
        # Use sort_keys=True for consistent output
        return json.dumps(msg, ensure_ascii=False, default=_json_serializer)
    except (TypeError, ValueError) as e:
        raise MessageSerializerError(f"Serialization failed: {e}")


def deserialize_message(json_str: str) -> dict:
    """
    Deserializes a JSON string to a message dict.
    
    Implements Requirement 6.2: Produces a Message dict equivalent to the original.
    
    Args:
        json_str: A valid JSON string representing a message
        
    Returns:
        A dictionary containing the message data
        
    Raises:
        MessageSerializerError: If deserialization fails or required fields are missing
    """
    if not isinstance(json_str, str):
        raise MessageSerializerError(f"Expected str, got {type(json_str).__name__}")
    
    if not json_str.strip():
        raise MessageSerializerError("Empty JSON string")
    
    try:
        msg = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise MessageSerializerError(f"Invalid JSON: {e}")
    
    if not isinstance(msg, dict):
        raise MessageSerializerError(f"Expected JSON object, got {type(msg).__name__}")
    
    # Validate required fields
    missing_fields = [field for field in REQUIRED_FIELDS if field not in msg]
    if missing_fields:
        raise MessageSerializerError(f"Missing required fields: {missing_fields}")
    
    return msg


def pretty_print_message(msg: dict) -> str:
    """
    Pretty-prints a message dict for debugging and display.
    
    Implements Requirement 6.3: Preserves all metadata fields exactly,
    including special characters.
    
    Args:
        msg: A dictionary containing message data
        
    Returns:
        A formatted, human-readable string representation of the message
        
    Raises:
        MessageSerializerError: If the message is invalid
    """
    if not isinstance(msg, dict):
        raise MessageSerializerError(f"Expected dict, got {type(msg).__name__}")
    
    # Validate required fields
    missing_fields = [field for field in REQUIRED_FIELDS if field not in msg]
    if missing_fields:
        raise MessageSerializerError(f"Missing required fields: {missing_fields}")
    
    try:
        # Build pretty output
        lines = [
            "=" * 60,
            f"Message ID: {msg.get('id')}",
            f"Conversation: {msg.get('conversation_id')}",
            f"Sender: {msg.get('sender_type')}",
            f"Type: {msg.get('message_type')}",
            f"Created: {msg.get('created_at')}",
            "-" * 60,
            f"Content: {msg.get('content')}",
        ]
        
        # Add metadata if present
        metadata = msg.get('metadata')
        if metadata:
            lines.append("-" * 60)
            lines.append("Metadata:")
            if isinstance(metadata, dict):
                for key, value in metadata.items():
                    lines.append(f"  {key}: {value}")
            else:
                lines.append(f"  {metadata}")
        
        lines.append("=" * 60)
        
        return "\n".join(lines)
        
    except Exception as e:
        raise MessageSerializerError(f"Pretty print failed: {e}")


def _json_serializer(obj: Any) -> Any:
    """
    Custom JSON serializer for objects not serializable by default json code.
    
    Handles datetime objects and other special types.
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def validate_message(msg: dict) -> bool:
    """
    Validates that a message dict contains all required fields.
    
    Args:
        msg: A dictionary to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not isinstance(msg, dict):
        return False
    
    return all(field in msg for field in REQUIRED_FIELDS)
