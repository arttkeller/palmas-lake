"""
Test to verify mock mode logging works correctly.

This test verifies Requirement 10.5: Add logging to indicate mock mode.
"""

import sys
import os
import logging
from io import StringIO
from unittest.mock import patch

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.message_service import MessageService


def test_mock_mode_logging(caplog):
    """
    Verify that MessageService logs when mock mode is active.
    
    **Validates: Requirement 10.5**
    """
    # Set up log capture
    with caplog.at_level(logging.INFO):
        # Create service with mock mode enabled
        service = MessageService(use_mock=True)
    
    # Get the log output
    log_output = caplog.text
    
    # Verify mock mode message was logged
    assert "MOCK MODE ACTIVE" in log_output, \
        "Should log mock mode status when use_mock=True"
    assert "Using mocked data for testing" in log_output, \
        "Should indicate that mocked data is being used"


def test_normal_mode_no_logging(caplog):
    """
    Verify that MessageService does not log mock mode when in normal mode.
    
    **Validates: Requirement 10.5**
    """
    # Set up log capture
    with caplog.at_level(logging.INFO):
        # Create service without mock mode (default)
        service = MessageService()
    
    # Get the log output
    log_output = caplog.text
    
    # Verify no mock mode message was logged
    assert "MOCK MODE ACTIVE" not in log_output, \
        "Should not log mock mode status when use_mock=False"


def test_explicit_normal_mode(caplog):
    """
    Verify that MessageService does not log mock mode when explicitly set to False.
    
    **Validates: Requirement 10.5**
    """
    # Set up log capture
    with caplog.at_level(logging.INFO):
        # Create service with mock mode explicitly disabled
        service = MessageService(use_mock=False)
    
    # Get the log output
    log_output = caplog.text
    
    # Verify no mock mode message was logged
    assert "MOCK MODE ACTIVE" not in log_output, \
        "Should not log mock mode status when use_mock=False"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
