"""
Property-Based Tests for Temperature Classification.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: fix-reaction-persistence**
"""

import sys
import os
from datetime import datetime, timedelta, timezone

import pytest
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.temperature_service import (
    TemperatureService,
    classify_lead_temperature
)


# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for sentiment scores
sentiment_score_strategy = st.floats(min_value=-1.0, max_value=1.0, allow_nan=False)

# Strategy for high interest scores (> 0.6)
high_interest_score_strategy = st.floats(min_value=0.61, max_value=1.0, allow_nan=False)

# Strategy for moderate interest scores (0.2 to 0.6)
moderate_interest_score_strategy = st.floats(min_value=0.2, max_value=0.6, allow_nan=False)

# Strategy for low interest scores (< 0.2)
low_interest_score_strategy = st.floats(min_value=-1.0, max_value=0.19, allow_nan=False)

# Strategy for sentiment labels
sentiment_label_strategy = st.sampled_from(['Positivo', 'Neutro', 'Negativo'])

# Strategy for hot keywords in messages
hot_keyword_strategy = st.sampled_from([
    "quero agendar uma visita",
    "qual o valor do apartamento?",
    "quanto custa?",
    "preciso logo de um apartamento",
    "quando posso visitar?",
    "quero comprar",
    "vou investir",
    "me interessa muito esse empreendimento"
])

# Strategy for cold keywords in messages
cold_keyword_strategy = st.sampled_from([
    "não tenho interesse",
    "não quero mais informações",
    "depois vejo isso",
    "agora não posso",
    "não me interessa",
    "pare de me enviar mensagens",
    "muito caro para mim",
    "fora do meu orçamento"
])

# Strategy for neutral messages
neutral_message_strategy = st.sampled_from([
    "interessante",
    "me conta mais",
    "quantos quartos tem?",
    "ok, entendi",
    "legal",
    "vou pensar"
])

# Strategy for datetime within last 24 hours (recent interaction)
recent_interaction_strategy = st.integers(min_value=0, max_value=23).map(
    lambda hours: datetime.now(timezone.utc) - timedelta(hours=hours)
)

# Strategy for datetime older than 24 hours (inactive)
inactive_interaction_strategy = st.integers(min_value=25, max_value=168).map(
    lambda hours: datetime.now(timezone.utc) - timedelta(hours=hours)
)


# =============================================================================
# Property Test: Temperature Classification
# **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
# **Validates: Requirements 5.1**
# =============================================================================

class TestTemperatureClassification:
    """
    **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
    **Validates: Requirements 5.1**
    
    For any lead with high interest signals (sentiment_score > 0.6 or wants to schedule),
    the temperature should be set to "quente".
    """

    @settings(max_examples=100)
    @given(score=high_interest_score_strategy)
    def test_high_score_results_in_quente(self, score):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.1**
        
        Property: For any sentiment_score > 0.6, temperature should be "quente".
        """
        result = classify_lead_temperature(sentiment_score=score)
        assert result == "quente", \
            f"Score {score} > 0.6 should result in 'quente', got '{result}'"

    @settings(max_examples=100)
    @given(score=sentiment_score_strategy)
    def test_wants_to_schedule_results_in_quente(self, score):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.1**
        
        Property: When wants_to_schedule is True, temperature should always be "quente"
        regardless of sentiment score.
        """
        result = classify_lead_temperature(
            sentiment_score=score,
            wants_to_schedule=True
        )
        assert result == "quente", \
            f"wants_to_schedule=True should result in 'quente', got '{result}'"

    @settings(max_examples=100)
    @given(message=hot_keyword_strategy)
    def test_hot_keywords_result_in_quente(self, message):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.1**
        
        Property: Messages containing hot keywords should result in "quente".
        """
        result = classify_lead_temperature(message_content=message)
        assert result == "quente", \
            f"Message with hot keyword should result in 'quente', got '{result}'"

    @settings(max_examples=100)
    @given(score=moderate_interest_score_strategy)
    def test_moderate_score_results_in_morno(self, score):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.2**
        
        Property: For sentiment_score between 0.2 and 0.6, temperature should be "morno".
        """
        # Ensure score is in the moderate range
        assume(0.2 <= score <= 0.6)
        
        result = classify_lead_temperature(sentiment_score=score)
        assert result == "morno", \
            f"Score {score} in [0.2, 0.6] should result in 'morno', got '{result}'"

    @settings(max_examples=100)
    @given(last_interaction=inactive_interaction_strategy)
    def test_inactivity_over_24h_results_in_frio(self, last_interaction):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.3**
        
        Property: When last_interaction is more than 24 hours ago, temperature should be "frio".
        """
        result = classify_lead_temperature(
            last_interaction=last_interaction,
            sentiment_score=0.8  # Even with high score, inactivity should override
        )
        assert result == "frio", \
            f"Inactivity > 24h should result in 'frio', got '{result}'"

    @settings(max_examples=100)
    @given(message=cold_keyword_strategy)
    def test_cold_keywords_result_in_frio(self, message):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.3**
        
        Property: Messages containing cold keywords should result in "frio".
        """
        result = classify_lead_temperature(message_content=message)
        assert result == "frio", \
            f"Message with cold keyword should result in 'frio', got '{result}'"

    @settings(max_examples=100)
    @given(score=low_interest_score_strategy)
    def test_low_score_results_in_frio(self, score):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.3**
        
        Property: For sentiment_score < 0.2, temperature should be "frio".
        """
        # Ensure score is in the low range
        assume(score < 0.2)
        
        result = classify_lead_temperature(sentiment_score=score)
        assert result == "frio", \
            f"Score {score} < 0.2 should result in 'frio', got '{result}'"

    @settings(max_examples=100)
    @given(
        score=high_interest_score_strategy,
        last_interaction=recent_interaction_strategy
    )
    def test_recent_high_score_results_in_quente(self, score, last_interaction):
        """
        **Feature: fix-reaction-persistence, Property 6: Temperature Classification**
        **Validates: Requirements 5.1**
        
        Property: High score with recent interaction should result in "quente".
        """
        result = classify_lead_temperature(
            sentiment_score=score,
            last_interaction=last_interaction
        )
        assert result == "quente", \
            f"High score {score} with recent interaction should be 'quente', got '{result}'"


class TestTemperatureServiceMethods:
    """Additional tests for TemperatureService helper methods."""

    @settings(max_examples=100)
    @given(temperature=st.sampled_from(['quente', 'morno', 'frio']))
    def test_temperature_mapping_to_english(self, temperature):
        """
        Property: Temperature mapping should correctly convert Portuguese to English.
        """
        service = TemperatureService()
        result = service.map_temperature_to_english(temperature)
        
        expected = {
            'quente': 'hot',
            'morno': 'warm',
            'frio': 'cold'
        }
        
        assert result == expected[temperature], \
            f"'{temperature}' should map to '{expected[temperature]}', got '{result}'"

    @settings(max_examples=100)
    @given(temperature=st.sampled_from(['quente', 'morno', 'frio']))
    def test_status_for_temperature(self, temperature):
        """
        Property: Each temperature should have a corresponding status.
        """
        service = TemperatureService()
        result = service.get_status_for_temperature(temperature)
        
        expected = {
            'quente': 'Quente',
            'morno': 'Em Atendimento',
            'frio': 'Frio'
        }
        
        assert result == expected[temperature], \
            f"Temperature '{temperature}' should have status '{expected[temperature]}', got '{result}'"

    def test_default_temperature_is_morno(self):
        """
        Property: When no signals are provided, default temperature should be "morno".
        """
        result = classify_lead_temperature()
        assert result == "morno", \
            f"Default temperature should be 'morno', got '{result}'"
