"""
Property-Based Tests for AI Specialist Router.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: ai-specialist-agendamentos**
"""

import sys
import os
from datetime import datetime, timezone
from typing import List

import pytest
from hypothesis import given, settings, strategies as st, assume
from pydantic import ValidationError

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.ai_specialist import (
    MessageRequest,
    MessageContext,
    MessageResponse,
    validate_message,
    validate_context_type,
    VALID_CONTEXT_TYPES
)


# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for valid context types
valid_context_type_strategy = st.sampled_from(list(VALID_CONTEXT_TYPES))

# Strategy for invalid context types (strings not in valid set)
invalid_context_type_strategy = st.text(min_size=1, max_size=20).filter(
    lambda x: x not in VALID_CONTEXT_TYPES and x.strip() != ''
)

# Strategy for non-empty messages
non_empty_message_strategy = st.text(min_size=1, max_size=500).filter(
    lambda x: x.strip() != ''
)

# Strategy for empty/whitespace-only messages
empty_message_strategy = st.sampled_from([
    '',
    ' ',
    '  ',
    '\t',
    '\n',
    '\r\n',
    '   \t   ',
    '\n\n\n',
])

# Strategy for whitespace-only strings of various lengths
whitespace_only_strategy = st.text(
    alphabet=st.sampled_from([' ', '\t', '\n', '\r']),
    min_size=0,
    max_size=20
)

# Strategy for valid MessageContext
valid_context_strategy = st.builds(
    MessageContext,
    section=st.text(min_size=1, max_size=50),
    contextType=valid_context_type_strategy,
    path=st.text(min_size=1, max_size=100),
    metadata=st.none() | st.dictionaries(
        keys=st.text(min_size=1, max_size=20),
        values=st.text(max_size=50),
        max_size=5
    )
)


# =============================================================================
# Property Test: Message Validation - Non-Empty
# **Feature: ai-specialist-agendamentos, Property 5: Message Validation - Non-Empty**
# **Validates: Requirements 2.2**
# =============================================================================

class TestMessageValidationNonEmpty:
    """
    **Feature: ai-specialist-agendamentos, Property 5: Message Validation - Non-Empty**
    **Validates: Requirements 2.2**
    
    For any message request, if the message field is empty or contains only 
    whitespace, the system SHALL reject the request with an appropriate error.
    """
    
    @settings(max_examples=100)
    @given(message=empty_message_strategy)
    def test_empty_message_is_rejected(self, message: str):
        """
        **Feature: ai-specialist-agendamentos, Property 5: Message Validation - Non-Empty**
        **Validates: Requirements 2.2**
        
        Property: Empty messages must be rejected.
        """
        result = validate_message(message)
        assert result is False, f"Empty message '{repr(message)}' should be rejected"
    
    @settings(max_examples=100)
    @given(message=whitespace_only_strategy)
    def test_whitespace_only_message_is_rejected(self, message: str):
        """
        **Feature: ai-specialist-agendamentos, Property 5: Message Validation - Non-Empty**
        **Validates: Requirements 2.2**
        
        Property: Whitespace-only messages must be rejected.
        """
        result = validate_message(message)
        assert result is False, f"Whitespace-only message '{repr(message)}' should be rejected"
    
    @settings(max_examples=100)
    @given(message=non_empty_message_strategy)
    def test_non_empty_message_is_accepted(self, message: str):
        """
        **Feature: ai-specialist-agendamentos, Property 5: Message Validation - Non-Empty**
        **Validates: Requirements 2.2**
        
        Property: Non-empty messages with content must be accepted.
        """
        result = validate_message(message)
        assert result is True, f"Non-empty message '{message[:50]}...' should be accepted"
    
    @settings(max_examples=100)
    @given(message=empty_message_strategy, context=valid_context_strategy)
    def test_message_request_rejects_empty_message(
        self, message: str, context: MessageContext
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 5: Message Validation - Non-Empty**
        **Validates: Requirements 2.2**
        
        Property: MessageRequest model must reject empty messages with ValidationError.
        """
        with pytest.raises(ValidationError) as exc_info:
            MessageRequest(message=message, context=context)
        
        # Verify the error is about the message field
        errors = exc_info.value.errors()
        assert any(
            'message' in str(e.get('loc', '')) or 'vazia' in str(e.get('msg', '')).lower()
            for e in errors
        ), f"Expected validation error for message field, got: {errors}"
    
    @settings(max_examples=100)
    @given(message=whitespace_only_strategy, context=valid_context_strategy)
    def test_message_request_rejects_whitespace_message(
        self, message: str, context: MessageContext
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 5: Message Validation - Non-Empty**
        **Validates: Requirements 2.2**
        
        Property: MessageRequest model must reject whitespace-only messages.
        """
        with pytest.raises(ValidationError) as exc_info:
            MessageRequest(message=message, context=context)
        
        errors = exc_info.value.errors()
        assert len(errors) > 0, "Expected validation error for whitespace message"


# =============================================================================
# Property Test: Context Type Validation
# **Feature: ai-specialist-agendamentos, Property 6: Context Type Validation**
# **Validates: Requirements 2.3**
# =============================================================================

class TestContextTypeValidation:
    """
    **Feature: ai-specialist-agendamentos, Property 6: Context Type Validation**
    **Validates: Requirements 2.3**
    
    For any message request, if the contextType is not one of the valid types 
    ('crm', 'chat', 'leads', 'agendamentos', 'analytics'), the system SHALL 
    reject the request.
    """
    
    @settings(max_examples=100)
    @given(context_type=valid_context_type_strategy)
    def test_valid_context_type_is_accepted(self, context_type: str):
        """
        **Feature: ai-specialist-agendamentos, Property 6: Context Type Validation**
        **Validates: Requirements 2.3**
        
        Property: Valid context types must be accepted.
        """
        result = validate_context_type(context_type)
        assert result is True, f"Valid context type '{context_type}' should be accepted"
    
    @settings(max_examples=100)
    @given(context_type=invalid_context_type_strategy)
    def test_invalid_context_type_is_rejected(self, context_type: str):
        """
        **Feature: ai-specialist-agendamentos, Property 6: Context Type Validation**
        **Validates: Requirements 2.3**
        
        Property: Invalid context types must be rejected.
        """
        result = validate_context_type(context_type)
        assert result is False, f"Invalid context type '{context_type}' should be rejected"
    
    @settings(max_examples=100)
    @given(
        message=non_empty_message_strategy,
        context_type=invalid_context_type_strategy,
        section=st.text(min_size=1, max_size=50),
        path=st.text(min_size=1, max_size=100)
    )
    def test_message_context_rejects_invalid_type(
        self, message: str, context_type: str, section: str, path: str
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 6: Context Type Validation**
        **Validates: Requirements 2.3**
        
        Property: MessageContext model must reject invalid context types.
        """
        with pytest.raises(ValidationError):
            MessageContext(
                section=section,
                contextType=context_type,
                path=path
            )
    
    def test_all_valid_context_types_are_accepted(self):
        """
        **Feature: ai-specialist-agendamentos, Property 6: Context Type Validation**
        **Validates: Requirements 2.3**
        
        Property: All defined valid context types must be accepted.
        """
        expected_types = {'crm', 'chat', 'leads', 'agendamentos', 'analytics'}
        
        for ctx_type in expected_types:
            assert validate_context_type(ctx_type) is True, \
                f"Expected context type '{ctx_type}' to be valid"
            
            # Also verify it works in MessageContext
            context = MessageContext(
                section="Test",
                contextType=ctx_type,
                path="/test"
            )
            assert context.contextType == ctx_type


# =============================================================================
# Property Test: Response Structure Completeness
# **Feature: ai-specialist-agendamentos, Property 7: Response Structure Completeness**
# **Validates: Requirements 2.4**
# =============================================================================

class TestResponseStructureCompleteness:
    """
    **Feature: ai-specialist-agendamentos, Property 7: Response Structure Completeness**
    **Validates: Requirements 2.4**
    
    For any successful response from the AI Specialist endpoint, the response 
    SHALL contain all required fields: id, content, timestamp, and success.
    """
    
    @settings(max_examples=100)
    @given(
        id=st.uuids().map(str),
        content=st.text(max_size=1000),
        success=st.booleans()
    )
    def test_response_contains_all_required_fields(
        self, id: str, content: str, success: bool
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 7: Response Structure Completeness**
        **Validates: Requirements 2.4**
        
        Property: MessageResponse must contain id, content, timestamp, and success.
        """
        response = MessageResponse(
            id=id,
            content=content,
            timestamp=datetime.now(timezone.utc),
            success=success
        )
        
        # Verify all required fields are present
        assert hasattr(response, 'id'), "Response must have 'id' field"
        assert hasattr(response, 'content'), "Response must have 'content' field"
        assert hasattr(response, 'timestamp'), "Response must have 'timestamp' field"
        assert hasattr(response, 'success'), "Response must have 'success' field"
        
        # Verify field values
        assert response.id == id
        assert response.content == content
        assert response.success == success
        assert isinstance(response.timestamp, datetime)
    
    @settings(max_examples=100)
    @given(
        id=st.uuids().map(str),
        content=st.text(max_size=500),
        error=st.text(min_size=1, max_size=200) | st.none()
    )
    def test_response_error_field_is_optional(
        self, id: str, content: str, error: str
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 7: Response Structure Completeness**
        **Validates: Requirements 2.4**
        
        Property: The error field is optional and can be None or a string.
        """
        response = MessageResponse(
            id=id,
            content=content,
            timestamp=datetime.now(timezone.utc),
            success=error is None,
            error=error
        )
        
        assert response.error == error
        
        # If error is present, success should typically be False
        # (but this is a business rule, not enforced by the model)
    
    @settings(max_examples=100)
    @given(
        id=st.uuids().map(str),
        content=st.text(max_size=500)
    )
    def test_response_serialization_contains_all_fields(
        self, id: str, content: str
    ):
        """
        **Feature: ai-specialist-agendamentos, Property 7: Response Structure Completeness**
        **Validates: Requirements 2.4**
        
        Property: Serialized response (dict) must contain all required fields.
        """
        response = MessageResponse(
            id=id,
            content=content,
            timestamp=datetime.now(timezone.utc),
            success=True
        )
        
        # Serialize to dict
        response_dict = response.model_dump()
        
        # Verify all required fields are in the serialized output
        required_fields = ['id', 'content', 'timestamp', 'success']
        for field in required_fields:
            assert field in response_dict, \
                f"Serialized response must contain '{field}' field"
    
    def test_response_missing_required_field_raises_error(self):
        """
        **Feature: ai-specialist-agendamentos, Property 7: Response Structure Completeness**
        **Validates: Requirements 2.4**
        
        Property: Creating a response without required fields must raise an error.
        """
        # Missing 'id'
        with pytest.raises(ValidationError):
            MessageResponse(
                content="test",
                timestamp=datetime.now(timezone.utc),
                success=True
            )
        
        # Missing 'content'
        with pytest.raises(ValidationError):
            MessageResponse(
                id="test-id",
                timestamp=datetime.now(timezone.utc),
                success=True
            )
        
        # Missing 'timestamp'
        with pytest.raises(ValidationError):
            MessageResponse(
                id="test-id",
                content="test",
                success=True
            )
        
        # Missing 'success'
        with pytest.raises(ValidationError):
            MessageResponse(
                id="test-id",
                content="test",
                timestamp=datetime.now(timezone.utc)
            )
