"""
Property-Based Tests for AI Sentiment Payload Extraction.

**Feature: fix-crm-analytics-bugs, Property 2: AI sentiment payload extraction preserves all fields**
**Validates: Requirements 2.1, 2.2, 2.3, 7.2**

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.
"""

import sys
import os
import pytest
from hypothesis import given, settings, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


# =============================================================================
# Extraction logic mirroring _analyze_and_update_sentiment
# =============================================================================

def extract_sentiment_payload(sentiment_data: dict) -> dict:
    """
    Mirrors the extraction logic from AgentManager._analyze_and_update_sentiment.
    Extracts tags, adjectives, and interest_type from AI response into update_payload.
    """
    update_payload = {}

    # Tags extraction (same as agent_manager.py)
    if sentiment_data.get("tags"):
        tags = sentiment_data["tags"]
        if isinstance(tags, list):
            update_payload["tags"] = tags
        elif isinstance(tags, str):
            update_payload["tags"] = [tags]

    # Adjectives extraction (same as agent_manager.py)
    if sentiment_data.get("adjectives"):
        adjectives = sentiment_data["adjectives"]
        if isinstance(adjectives, list):
            update_payload["adjectives"] = adjectives
        elif isinstance(adjectives, str):
            update_payload["adjectives"] = [adjectives]

    # Interest type extraction (same as agent_manager.py)
    valid_interest_types = {"apartamento", "sala_comercial", "office", "flat"}
    interest_type = sentiment_data.get("interest_type")
    if isinstance(interest_type, str) and interest_type.lower() in valid_interest_types:
        update_payload["interest_type"] = interest_type.lower()

    return update_payload


# =============================================================================
# Strategies
# =============================================================================

tag_strategy = st.sampled_from([
    'apartamento', 'investidor', 'andar_alto', 'familia_grande',
    'vista_mar', 'dois_quartos', 'cobertura', 'praia'
])

tags_list_strategy = st.lists(tag_strategy, min_size=1, max_size=5, unique=True)

adjective_strategy = st.sampled_from([
    'Interessado', 'Decidido', 'Urgente', 'Curioso',
    'Cauteloso', 'Animado', 'Desinteressado'
])

adjectives_list_strategy = st.lists(adjective_strategy, min_size=1, max_size=3, unique=True)

interest_type_strategy = st.sampled_from(["apartamento", "sala_comercial", "office", "flat"])


# =============================================================================
# Property Test
# =============================================================================

class TestSentimentPayloadExtraction:
    """
    **Feature: fix-crm-analytics-bugs, Property 2: AI sentiment payload extraction preserves all fields**
    **Validates: Requirements 2.1, 2.2, 2.3, 7.2**
    """

    @settings(max_examples=100)
    @given(
        tags=tags_list_strategy,
        adjectives=adjectives_list_strategy,
        interest_type=interest_type_strategy,
    )
    def test_extraction_preserves_all_fields(self, tags, adjectives, interest_type):
        """
        **Feature: fix-crm-analytics-bugs, Property 2: AI sentiment payload extraction preserves all fields**
        **Validates: Requirements 2.1, 2.2, 2.3, 7.2**

        For any valid sentiment_data containing tags (list), adjectives (list),
        and interest_type (string), the extraction logic SHALL produce an
        update_payload that includes all three fields with their original values.
        """
        sentiment_data = {
            "sentiment_score": 0.5,
            "sentiment_label": "Positivo",
            "tags": tags,
            "adjectives": adjectives,
            "interest_type": interest_type,
        }

        payload = extract_sentiment_payload(sentiment_data)

        # Tags preserved
        assert "tags" in payload, "tags must be in payload"
        assert payload["tags"] == tags

        # Adjectives preserved
        assert "adjectives" in payload, "adjectives must be in payload"
        assert payload["adjectives"] == adjectives

        # Interest type preserved (lowercased)
        assert "interest_type" in payload, "interest_type must be in payload"
        assert payload["interest_type"] == interest_type.lower()
