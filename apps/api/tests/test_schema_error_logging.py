"""
Test to verify schema error logging functionality.
"""

import pytest
from unittest.mock import patch, MagicMock
from services.supabase_client import create_client


def test_schema_error_logging_on_http_error():
    """
    Test that schema-related errors are logged with proper context.
    
    This test verifies that when a query fails with a schema-related error,
    the system logs a clear error message indicating the schema issue.
    
    Validates: Requirements 7.4
    """
    client = create_client()
    query_builder = client.table("leads")
    
    # Mock a failed request with schema error
    with patch('requests.get') as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "schema 'wrong-schema' does not exist"
        mock_get.return_value = mock_response
        
        # Capture print output
        with patch('builtins.print') as mock_print:
            result = query_builder.select("*").execute()
            
            # Verify error was logged
            assert mock_print.called
            
            # Check that schema error was logged
            calls = [str(call) for call in mock_print.call_args_list]
            schema_error_logged = any("[SCHEMA ERROR]" in str(call) for call in calls)
            assert schema_error_logged, "Schema error should be logged with [SCHEMA ERROR] prefix"
            
            # Verify the error message includes expected schema
            schema_info_logged = any("palmaslake-agno" in str(call) for call in calls)
            assert schema_info_logged, "Error log should mention expected schema 'palmaslake-agno'"
            
            # Verify result is None on error
            assert result.data is None


def test_schema_error_logging_on_exception():
    """
    Test that schema-related exceptions are logged with proper context.
    
    This test verifies that when a query raises an exception with schema-related content,
    the system logs a clear error message.
    
    Validates: Requirements 7.4
    """
    client = create_client()
    query_builder = client.table("leads")
    
    # Mock an exception with schema in message
    with patch('requests.get') as mock_get:
        mock_get.side_effect = Exception("Connection failed: schema not found")
        
        # Capture print output
        with patch('builtins.print') as mock_print:
            result = query_builder.select("*").execute()
            
            # Verify error was logged
            assert mock_print.called
            
            # Check that schema error was logged
            calls = [str(call) for call in mock_print.call_args_list]
            schema_error_logged = any("[SCHEMA ERROR]" in str(call) for call in calls)
            assert schema_error_logged, "Schema error should be logged with [SCHEMA ERROR] prefix"
            
            # Verify result is None on error
            assert result.data is None


def test_normal_error_logging_without_schema():
    """
    Test that non-schema errors are logged normally without schema-specific message.
    
    This test verifies that regular errors don't trigger schema-specific logging.
    
    Validates: Requirements 7.4
    """
    client = create_client()
    query_builder = client.table("leads")
    
    # Mock a failed request without schema error
    with patch('requests.get') as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal server error"
        mock_get.return_value = mock_response
        
        # Capture print output
        with patch('builtins.print') as mock_print:
            result = query_builder.select("*").execute()
            
            # Verify error was logged
            assert mock_print.called
            
            # Check that regular error was logged but not as schema error
            calls = [str(call) for call in mock_print.call_args_list]
            regular_error_logged = any("Supabase Error 500" in str(call) for call in calls)
            assert regular_error_logged, "Regular error should be logged"
            
            # Schema-specific error should NOT be logged for non-schema errors
            schema_error_logged = any("[SCHEMA ERROR]" in str(call) for call in calls)
            assert not schema_error_logged, "Schema error should not be logged for non-schema errors"
            
            # Verify result is None on error
            assert result.data is None
