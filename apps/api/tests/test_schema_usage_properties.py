"""
Property-based tests for schema usage in Supabase queries.

These tests verify that all database queries use the correct schema (palmaslake-agno)
by checking that the SupabaseREST client includes the proper headers.
"""

import sys
import os
import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import patch, MagicMock
import requests

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.supabase_client import create_client, SupabaseREST
from services.message_service import MessageService


# Feature: fix-lead-messages-display, Property 17: Schema usage in leads queries
@given(
    lead_id=st.uuids().map(str),
    phone=st.text(min_size=10, max_size=15, alphabet=st.characters(whitelist_categories=('Nd',))),
)
@settings(max_examples=100)
def test_leads_queries_use_correct_schema(lead_id, phone):
    """
    Property 17: Schema usage in leads queries
    
    For any API query that fetches leads, the system should use the "palmaslake-agno" schema.
    
    This test verifies that:
    1. The SupabaseREST client includes Accept-Profile header with palmaslake-agno
    2. The SupabaseREST client includes Content-Profile header with palmaslake-agno
    3. All leads queries use these headers
    
    Validates: Requirements 7.1
    """
    # Create a Supabase client
    client = create_client()
    
    # Verify the client has the correct schema headers
    assert "Accept-Profile" in client.headers, "Accept-Profile header missing"
    assert "Content-Profile" in client.headers, "Content-Profile header missing"
    assert client.headers["Accept-Profile"] == "palmaslake-agno", \
        f"Accept-Profile should be 'palmaslake-agno', got '{client.headers['Accept-Profile']}'"
    assert client.headers["Content-Profile"] == "palmaslake-agno", \
        f"Content-Profile should be 'palmaslake-agno', got '{client.headers['Content-Profile']}'"
    
    # Create a query builder for leads table
    query_builder = client.table("leads")
    
    # Verify the query builder inherits the headers
    assert query_builder.headers["Accept-Profile"] == "palmaslake-agno", \
        "Query builder should inherit Accept-Profile header"
    assert query_builder.headers["Content-Profile"] == "palmaslake-agno", \
        "Query builder should inherit Content-Profile header"
    
    # Mock the requests.get to verify headers are sent
    with patch('requests.get') as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []
        mock_get.return_value = mock_response
        
        # Execute a select query
        query_builder.select("*").eq("phone", phone).execute()
        
        # Verify the request was made with correct headers
        assert mock_get.called, "Request should have been made"
        call_args = mock_get.call_args
        headers_used = call_args.kwargs.get('headers', {})
        
        assert headers_used.get("Accept-Profile") == "palmaslake-agno", \
            "Request should include Accept-Profile header with palmaslake-agno"
        assert headers_used.get("Content-Profile") == "palmaslake-agno", \
            "Request should include Content-Profile header with palmaslake-agno"


# Feature: fix-lead-messages-display, Property 18: Schema usage in conversations queries
@given(
    conversation_id=st.uuids().map(str),
    lead_id=st.uuids().map(str),
)
@settings(max_examples=100)
def test_conversations_queries_use_correct_schema(conversation_id, lead_id):
    """
    Property 18: Schema usage in conversations queries
    
    For any API query that fetches conversations, the system should use the "palmaslake-agno" schema.
    
    This test verifies that:
    1. The SupabaseREST client includes Accept-Profile header with palmaslake-agno
    2. The SupabaseREST client includes Content-Profile header with palmaslake-agno
    3. All conversations queries use these headers
    
    Validates: Requirements 7.2
    """
    # Create a Supabase client
    client = create_client()
    
    # Verify the client has the correct schema headers
    assert "Accept-Profile" in client.headers, "Accept-Profile header missing"
    assert "Content-Profile" in client.headers, "Content-Profile header missing"
    assert client.headers["Accept-Profile"] == "palmaslake-agno", \
        f"Accept-Profile should be 'palmaslake-agno', got '{client.headers['Accept-Profile']}'"
    assert client.headers["Content-Profile"] == "palmaslake-agno", \
        f"Content-Profile should be 'palmaslake-agno', got '{client.headers['Content-Profile']}'"
    
    # Create a query builder for conversations table
    query_builder = client.table("conversations")
    
    # Verify the query builder inherits the headers
    assert query_builder.headers["Accept-Profile"] == "palmaslake-agno", \
        "Query builder should inherit Accept-Profile header"
    assert query_builder.headers["Content-Profile"] == "palmaslake-agno", \
        "Query builder should inherit Content-Profile header"
    
    # Mock the requests.get to verify headers are sent
    with patch('requests.get') as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []
        mock_get.return_value = mock_response
        
        # Execute a select query
        query_builder.select("*").eq("lead_id", lead_id).execute()
        
        # Verify the request was made with correct headers
        assert mock_get.called, "Request should have been made"
        call_args = mock_get.call_args
        headers_used = call_args.kwargs.get('headers', {})
        
        assert headers_used.get("Accept-Profile") == "palmaslake-agno", \
            "Request should include Accept-Profile header with palmaslake-agno"
        assert headers_used.get("Content-Profile") == "palmaslake-agno", \
            "Request should include Content-Profile header with palmaslake-agno"


# Feature: fix-lead-messages-display, Property 19: Schema usage in messages queries
@given(
    message_id=st.uuids().map(str),
    conversation_id=st.uuids().map(str),
)
@settings(max_examples=100)
def test_messages_queries_use_correct_schema(message_id, conversation_id):
    """
    Property 19: Schema usage in messages queries
    
    For any API query that fetches messages, the system should use the "palmaslake-agno" schema.
    
    This test verifies that:
    1. The SupabaseREST client includes Accept-Profile header with palmaslake-agno
    2. The SupabaseREST client includes Content-Profile header with palmaslake-agno
    3. All messages queries use these headers
    
    Validates: Requirements 7.3
    """
    # Create a Supabase client
    client = create_client()
    
    # Verify the client has the correct schema headers
    assert "Accept-Profile" in client.headers, "Accept-Profile header missing"
    assert "Content-Profile" in client.headers, "Content-Profile header missing"
    assert client.headers["Accept-Profile"] == "palmaslake-agno", \
        f"Accept-Profile should be 'palmaslake-agno', got '{client.headers['Accept-Profile']}'"
    assert client.headers["Content-Profile"] == "palmaslake-agno", \
        f"Content-Profile should be 'palmaslake-agno', got '{client.headers['Content-Profile']}'"
    
    # Create a query builder for messages table
    query_builder = client.table("messages")
    
    # Verify the query builder inherits the headers
    assert query_builder.headers["Accept-Profile"] == "palmaslake-agno", \
        "Query builder should inherit Accept-Profile header"
    assert query_builder.headers["Content-Profile"] == "palmaslake-agno", \
        "Query builder should inherit Content-Profile header"
    
    # Mock the requests.get to verify headers are sent
    with patch('requests.get') as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []
        mock_get.return_value = mock_response
        
        # Execute a select query
        query_builder.select("*").eq("conversation_id", conversation_id).execute()
        
        # Verify the request was made with correct headers
        assert mock_get.called, "Request should have been made"
        call_args = mock_get.call_args
        headers_used = call_args.kwargs.get('headers', {})
        
        assert headers_used.get("Accept-Profile") == "palmaslake-agno", \
            "Request should include Accept-Profile header with palmaslake-agno"
        assert headers_used.get("Content-Profile") == "palmaslake-agno", \
            "Request should include Content-Profile header with palmaslake-agno"


# Feature: fix-lead-messages-display, Property 17-19: Schema usage in MessageService
@given(
    phone=st.text(min_size=10, max_size=15, alphabet=st.characters(whitelist_categories=('Nd',))),
)
@settings(max_examples=100)
def test_message_service_uses_correct_schema(phone):
    """
    Additional test: Verify MessageService uses client with correct schema
    
    This test verifies that the MessageService, which is used throughout the application,
    creates a Supabase client with the correct schema headers.
    
    Validates: Requirements 7.1, 7.2, 7.3
    """
    # Create a MessageService instance
    service = MessageService()
    
    # Verify the service's supabase client has the correct schema headers
    assert hasattr(service, 'supabase'), "MessageService should have supabase attribute"
    assert "Accept-Profile" in service.supabase.headers, "Accept-Profile header missing"
    assert "Content-Profile" in service.supabase.headers, "Content-Profile header missing"
    assert service.supabase.headers["Accept-Profile"] == "palmaslake-agno", \
        f"MessageService Accept-Profile should be 'palmaslake-agno', got '{service.supabase.headers['Accept-Profile']}'"
    assert service.supabase.headers["Content-Profile"] == "palmaslake-agno", \
        f"MessageService Content-Profile should be 'palmaslake-agno', got '{service.supabase.headers['Content-Profile']}'"
