"""
Property-Based Tests for Tags and Adjectives Serialization Round-Trip.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-agent-bugfixes, Property 3: Tags and adjectives serialization round-trip**
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 10.2**
"""

import sys
import os
import json

import pytest
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for non-empty tag strings (realistic CRM tags)
tag_st = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Pd"), whitelist_characters="_"),
    min_size=1,
    max_size=30,
).filter(lambda s: s.strip() != "")

# Strategy for lists of tags (1 to 10 tags)
tags_list_st = st.lists(tag_st, min_size=1, max_size=10)

# Strategy for adjective strings
adjective_st = st.text(
    alphabet=st.characters(whitelist_categories=("L",), whitelist_characters=" "),
    min_size=1,
    max_size=30,
).filter(lambda s: s.strip() != "")

# Strategy for lists of adjectives (1 to 5)
adjectives_list_st = st.lists(adjective_st, min_size=1, max_size=5)


# =============================================================================
# Helper: simulate the update_payload building logic from agent_manager.py
# =============================================================================

def build_update_payload_tags(sentiment_data: dict) -> dict:
    """
    Replicates the FIXED logic from _analyze_and_update_sentiment
    for building the tags/adjectives portion of the update payload.
    This is the corrected version that sends lists directly.
    """
    update_payload = {}

    if sentiment_data.get("tags"):
        tags = sentiment_data["tags"]
        if isinstance(tags, list):
            update_payload["tags"] = tags
        elif isinstance(tags, str):
            update_payload["tags"] = [tags]

    if sentiment_data.get("adjectives"):
        adjectives = sentiment_data["adjectives"]
        if isinstance(adjectives, list):
            update_payload["adjectives"] = adjectives
        elif isinstance(adjectives, str):
            update_payload["adjectives"] = [adjectives]

    return update_payload


def build_update_payload_tags_BROKEN(sentiment_data: dict) -> dict:
    """
    Replicates the BROKEN logic (pre-fix) that used json.dumps().
    Used to demonstrate the bug.
    """
    update_payload = {}

    if sentiment_data.get("tags"):
        tags = sentiment_data["tags"]
        if isinstance(tags, list):
            update_payload["tags"] = json.dumps(tags)
        elif isinstance(tags, str):
            update_payload["tags"] = json.dumps([tags])

    if sentiment_data.get("adjectives"):
        adjectives = sentiment_data["adjectives"]
        if isinstance(adjectives, list):
            update_payload["adjectives"] = json.dumps(adjectives)
        elif isinstance(adjectives, str):
            update_payload["adjectives"] = json.dumps([adjectives])

    return update_payload


# =============================================================================
# Property Tests
# =============================================================================

class TestTagsSerializationRoundTrip:
    """
    **Feature: crm-agent-bugfixes, Property 3: Tags and adjectives serialization round-trip**
    **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 10.2**

    For any list of non-empty strings representing tags or adjectives,
    serializing the list for database storage and then deserializing it
    SHALL produce a list equal to the original input.
    """

    @settings(max_examples=100)
    @given(tags=tags_list_st)
    def test_tags_round_trip_fixed(self, tags):
        """
        **Feature: crm-agent-bugfixes, Property 3: Tags and adjectives serialization round-trip**
        **Validates: Requirements 3.1, 3.3, 10.2**

        For any list of tags, the fixed payload builder should produce a value
        that, when serialized to JSON and deserialized back, equals the original list.
        This simulates the Supabase jsonb round-trip.
        """
        sentiment_data = {"tags": tags}
        payload = build_update_payload_tags(sentiment_data)

        # Simulate jsonb round-trip: Supabase serializes the Python object to JSON
        # and deserializes it back when reading
        serialized = json.dumps(payload["tags"])
        deserialized = json.loads(serialized)

        assert deserialized == tags, (
            f"Tags round-trip failed. Original: {tags}, Got: {deserialized}"
        )

    @settings(max_examples=100)
    @given(adjectives=adjectives_list_st)
    def test_adjectives_round_trip_fixed(self, adjectives):
        """
        **Feature: crm-agent-bugfixes, Property 3: Tags and adjectives serialization round-trip**
        **Validates: Requirements 3.2, 3.4, 10.2**

        For any list of adjectives, the fixed payload builder should produce a value
        that, when serialized to JSON and deserialized back, equals the original list.
        """
        sentiment_data = {"adjectives": adjectives}
        payload = build_update_payload_tags(sentiment_data)

        serialized = json.dumps(payload["adjectives"])
        deserialized = json.loads(serialized)

        assert deserialized == adjectives, (
            f"Adjectives round-trip failed. Original: {adjectives}, Got: {deserialized}"
        )

    @settings(max_examples=100)
    @given(tags=tags_list_st)
    def test_fixed_payload_is_list_not_string(self, tags):
        """
        **Feature: crm-agent-bugfixes, Property 3: Tags and adjectives serialization round-trip**
        **Validates: Requirements 3.1, 3.3**

        For any list of tags, the fixed payload value must be a Python list,
        not a JSON string. This is the core of the bug fix — jsonb columns
        expect native Python objects, not pre-serialized strings.
        """
        sentiment_data = {"tags": tags}
        payload = build_update_payload_tags(sentiment_data)

        assert isinstance(payload["tags"], list), (
            f"Payload tags should be a list, got {type(payload['tags']).__name__}: {payload['tags']}"
        )

    @settings(max_examples=100)
    @given(tags=tags_list_st)
    def test_broken_payload_produces_string_not_list(self, tags):
        """
        **Feature: crm-agent-bugfixes, Property 3: Tags and adjectives serialization round-trip**
        **Validates: Requirements 3.1, 3.3**

        Demonstrates the bug: the old json.dumps() approach produces a string,
        which when stored in jsonb becomes a double-encoded JSON string instead
        of a native array.
        """
        sentiment_data = {"tags": tags}
        payload = build_update_payload_tags_BROKEN(sentiment_data)

        # The broken version produces a string
        assert isinstance(payload["tags"], str), (
            f"Broken payload should produce a string, got {type(payload['tags']).__name__}"
        )
        # Double-decoding is needed to get the original list back (the bug)
        first_decode = json.loads(payload["tags"])
        assert first_decode == tags, (
            "Even the broken version should decode to original with one json.loads"
        )
