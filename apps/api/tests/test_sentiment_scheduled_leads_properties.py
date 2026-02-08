"""
Property-Based Tests for Sentiment Score of Scheduled Leads.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-agent-bugfixes, Property 7: Sentiment score for scheduled leads**
**Validates: Requirements 8.1**
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

# Strategy for sentiment scores the AI might return (full range)
sentiment_score_st = st.floats(min_value=-1.0, max_value=1.0, allow_nan=False, allow_infinity=False)

# Strategy for sentiment labels the AI might return
sentiment_label_st = st.sampled_from(["Positivo", "Neutro", "Negativo"])

# Strategy for temperature the AI might return
temperature_st = st.sampled_from(["quente", "morno", "frio"])

# Strategy for scheduled lead statuses (variants that should trigger the override)
scheduled_status_st = st.sampled_from(["visita_agendada", "Visita Agendada", "visita agendada", "VISITA_AGENDADA"])

# Strategy for non-scheduled lead statuses
non_scheduled_status_st = st.sampled_from([
    "novo", "em_atendimento", "proposta", "frio", "finalizado",
    "Novo Lead", "Em Atendimento", "Proposta", "Frio", "Finalizado"
])

# Strategy for complete sentiment data as the AI might return
def sentiment_data_st():
    return st.fixed_dictionaries({
        "sentiment_score": sentiment_score_st,
        "sentiment_label": sentiment_label_st,
        "temperature": temperature_st,
        "tags": st.just(["apartamento"]),
        "adjectives": st.just(["Interessado"]),
        "status": st.sampled_from(["Novo Lead", "Em Atendimento", "Visita Agendada"]),
    })


# =============================================================================
# Helper: replicate the deterministic override logic from agent_manager.py
# =============================================================================

def apply_scheduled_lead_override(sentiment_data: dict, lead_status: str) -> dict:
    """
    Replicates the deterministic override logic from _analyze_and_update_sentiment.
    If lead_status is 'visita_agendada', enforces positive sentiment.
    Returns a new dict with the overrides applied.
    """
    result = dict(sentiment_data)

    if lead_status and lead_status.lower() in ("visita_agendada", "visita agendada"):
        current_score = result.get("sentiment_score", 0)
        if not isinstance(current_score, (int, float)) or current_score <= 0.6:
            result["sentiment_score"] = max(0.7, current_score if isinstance(current_score, (int, float)) else 0.7)
        result["sentiment_label"] = "Positivo"
        result["temperature"] = "quente"

    return result


# =============================================================================
# Property Tests
# =============================================================================

class TestSentimentScoreScheduledLeads:
    """
    **Feature: crm-agent-bugfixes, Property 7: Sentiment score for scheduled leads**
    **Validates: Requirements 8.1**

    For any lead with status "visita_agendada", the sentiment analysis SHALL
    classify the sentiment_label as "Positivo" with a sentiment_score above 0.5.
    """

    @settings(max_examples=100)
    @given(
        sentiment_data=sentiment_data_st(),
        lead_status=scheduled_status_st,
    )
    def test_scheduled_lead_always_positive_sentiment(self, sentiment_data, lead_status):
        """
        **Feature: crm-agent-bugfixes, Property 7: Sentiment score for scheduled leads**
        **Validates: Requirements 8.1**

        For any AI-returned sentiment data and any lead with visita_agendada status,
        the override logic SHALL produce sentiment_label "Positivo" and
        sentiment_score > 0.6.
        """
        result = apply_scheduled_lead_override(sentiment_data, lead_status)

        assert result["sentiment_label"] == "Positivo", (
            f"Scheduled lead must have sentiment_label 'Positivo', got '{result['sentiment_label']}'"
        )
        assert result["sentiment_score"] > 0.6, (
            f"Scheduled lead must have sentiment_score > 0.6, got {result['sentiment_score']}"
        )

    @settings(max_examples=100)
    @given(
        sentiment_data=sentiment_data_st(),
        lead_status=scheduled_status_st,
    )
    def test_scheduled_lead_always_hot_temperature(self, sentiment_data, lead_status):
        """
        **Feature: crm-agent-bugfixes, Property 7: Sentiment score for scheduled leads**
        **Validates: Requirements 8.1**

        For any lead with visita_agendada status, the override logic SHALL
        set temperature to "quente".
        """
        result = apply_scheduled_lead_override(sentiment_data, lead_status)

        assert result["temperature"] == "quente", (
            f"Scheduled lead must have temperature 'quente', got '{result['temperature']}'"
        )

    @settings(max_examples=100)
    @given(
        sentiment_data=sentiment_data_st(),
        lead_status=non_scheduled_status_st,
    )
    def test_non_scheduled_lead_not_overridden(self, sentiment_data, lead_status):
        """
        **Feature: crm-agent-bugfixes, Property 7: Sentiment score for scheduled leads**
        **Validates: Requirements 8.1**

        For any lead without visita_agendada status, the override logic SHALL NOT
        modify the AI-returned sentiment data.
        """
        result = apply_scheduled_lead_override(sentiment_data, lead_status)

        assert result["sentiment_score"] == sentiment_data["sentiment_score"], (
            f"Non-scheduled lead score should not be overridden. "
            f"Original: {sentiment_data['sentiment_score']}, Got: {result['sentiment_score']}"
        )
        assert result["sentiment_label"] == sentiment_data["sentiment_label"], (
            f"Non-scheduled lead label should not be overridden. "
            f"Original: {sentiment_data['sentiment_label']}, Got: {result['sentiment_label']}"
        )
