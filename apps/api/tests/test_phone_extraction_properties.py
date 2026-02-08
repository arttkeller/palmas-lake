"""
Property-Based Tests for Phone Extraction from JID.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-agent-bugfixes, Property 4: Phone extraction from JID**
**Validates: Requirements 4.1**
"""

import sys
import os

import pytest
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.maria_tools import MariaTools

# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for phone numbers: country code (1-3 digits) + area code (2-3 digits) + number (8-9 digits)
# This produces realistic phone strings like "5563999991234"
phone_digits_st = st.from_regex(r"[1-9][0-9]{9,14}", fullmatch=True)

# WhatsApp JID suffix
jid_suffix = "@s.whatsapp.net"


# =============================================================================
# Property Test
# =============================================================================

class TestPhoneExtractionFromJID:
    """
    **Feature: crm-agent-bugfixes, Property 4: Phone extraction from JID**
    **Validates: Requirements 4.1**

    For any valid WhatsApp JID in the format {phone}@s.whatsapp.net,
    extracting the phone number SHALL produce a string containing only
    digits that matches the phone portion of the JID.
    """

    @settings(max_examples=100)
    @given(phone=phone_digits_st)
    def test_extract_phone_from_jid_returns_digits_only(self, phone):
        """
        **Feature: crm-agent-bugfixes, Property 4: Phone extraction from JID**
        **Validates: Requirements 4.1**

        For any digit-only phone string, wrapping it in a JID and extracting
        should return the original phone string (digits only).
        """
        jid = f"{phone}{jid_suffix}"
        extracted = MariaTools.extract_phone_from_jid(jid)

        # Result must contain only digits
        assert extracted.isdigit(), (
            f"Extracted phone contains non-digit characters: '{extracted}' from JID '{jid}'"
        )
        # Result must match the original phone portion
        assert extracted == phone, (
            f"Extracted phone '{extracted}' does not match input phone '{phone}' from JID '{jid}'"
        )

    @settings(max_examples=100)
    @given(phone=phone_digits_st)
    def test_extract_phone_without_jid_suffix(self, phone):
        """
        **Feature: crm-agent-bugfixes, Property 4: Phone extraction from JID**
        **Validates: Requirements 4.1**

        For any plain phone string (no @suffix), extraction should still
        return the digits.
        """
        extracted = MariaTools.extract_phone_from_jid(phone)

        assert extracted.isdigit(), (
            f"Extracted phone contains non-digit characters: '{extracted}' from plain '{phone}'"
        )
        assert extracted == phone, (
            f"Extracted phone '{extracted}' does not match input '{phone}'"
        )
