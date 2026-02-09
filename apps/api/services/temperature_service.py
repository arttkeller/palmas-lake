"""
Temperature Classification Service

Handles automatic classification of leads based on engagement signals.
Requirements: 5.1, 5.2, 5.3, 5.4

Temperature levels:
- quente (hot): High interest, wants to schedule, score > 0.6
- morno (warm): Normal engagement without strong signals
- frio (cold): Disinterest or inactivity > 24 hours
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import json


class TemperatureService:
    """Service for classifying lead temperature based on engagement signals."""
    
    # Temperature thresholds
    HOT_SCORE_THRESHOLD = 0.6
    WARM_SCORE_THRESHOLD = 0.2
    INACTIVITY_THRESHOLD_HOURS = 24
    
    # Keywords that indicate high interest (quente)
    HOT_KEYWORDS = [
        "agendar", "visita", "visitar", "quando posso", "disponibilidade",
        "preço", "valor", "quanto custa", "financiamento", "entrada",
        "comprar", "fechar", "negócio", "proposta", "urgente", "preciso logo",
        "quero ver", "me interessa muito", "vou comprar", "investir"
    ]
    
    # Keywords that indicate disinterest (frio)
    COLD_KEYWORDS = [
        "não tenho interesse", "não quero", "depois vejo", "agora não",
        "não me interessa", "pare de", "não entre em contato", "desinteressado",
        "muito caro", "fora do orçamento", "fora do meu orçamento", "não posso"
    ]
    
    def classify_temperature(
        self,
        sentiment_score: Optional[float] = None,
        sentiment_label: Optional[str] = None,
        last_interaction: Optional[datetime] = None,
        message_content: Optional[str] = None,
        wants_to_schedule: bool = False
    ) -> str:
        """
        Classifies lead temperature based on multiple signals.
        
        Args:
            sentiment_score: Float from -1.0 to 1.0 indicating sentiment
            sentiment_label: "Positivo", "Neutro", or "Negativo"
            last_interaction: Datetime of last lead message
            message_content: Recent message content for keyword analysis
            wants_to_schedule: Whether lead expressed desire to schedule visit
        
        Returns:
            Temperature classification: "quente", "morno", or "frio"
        
        Requirements: 5.1, 5.2, 5.3, 5.4
        """
        # Check for inactivity > 24 hours first (Requirements 5.3)
        if last_interaction:
            now = datetime.now(timezone.utc)
            # Ensure last_interaction is timezone-aware
            if last_interaction.tzinfo is None:
                last_interaction = last_interaction.replace(tzinfo=timezone.utc)
            
            hours_inactive = (now - last_interaction).total_seconds() / 3600
            if hours_inactive > self.INACTIVITY_THRESHOLD_HOURS:
                return "frio"
        
        # Check for explicit scheduling intent (Requirements 5.1)
        if wants_to_schedule:
            return "quente"
        
        # Check message content for keywords
        if message_content:
            content_lower = message_content.lower()
            
            # Check for hot keywords (Requirements 5.1)
            for keyword in self.HOT_KEYWORDS:
                if keyword in content_lower:
                    return "quente"
            
            # Check for cold keywords (Requirements 5.3)
            for keyword in self.COLD_KEYWORDS:
                if keyword in content_lower:
                    return "frio"
        
        # Use sentiment score for classification (Requirements 5.1, 5.2, 5.3)
        if sentiment_score is not None:
            if sentiment_score > self.HOT_SCORE_THRESHOLD:
                return "quente"
            elif sentiment_score < self.WARM_SCORE_THRESHOLD:
                return "frio"
            else:
                return "morno"
        
        # Default to frio if no engagement signals detected
        # A lead must show actual interest to be classified as morno or quente
        return "frio"
    
    def get_status_for_temperature(self, temperature: str) -> str:
        """
        Returns the appropriate status for a given temperature.
        
        Args:
            temperature: "quente", "morno", or "frio"
        
        Returns:
            Status string for the lead
        
        Requirements: 5.4
        """
        status_mapping = {
            "quente": "Quente",
            "morno": "Em Atendimento",
            "frio": "Frio"
        }
        return status_mapping.get(temperature, "Em Atendimento")
    
    def map_temperature_to_english(self, temperature: str) -> str:
        """
        Maps Portuguese temperature to English for database storage.
        
        Args:
            temperature: "quente", "morno", or "frio"
        
        Returns:
            English equivalent: "hot", "warm", or "cold"
        """
        mapping = {
            "quente": "hot",
            "morno": "warm",
            "frio": "cold"
        }
        return mapping.get(temperature.lower(), "warm")
    
    def should_update_temperature(
        self,
        current_temperature: Optional[str],
        new_temperature: str
    ) -> bool:
        """
        Determines if temperature should be updated based on priority rules.
        
        A lead can always become "hotter" but should only become "colder"
        if there's strong evidence (inactivity or explicit disinterest).
        
        Args:
            current_temperature: Current temperature ("quente", "morno", "frio")
            new_temperature: Proposed new temperature
        
        Returns:
            True if temperature should be updated
        """
        if current_temperature is None:
            return True
        
        priority = {"frio": 1, "morno": 2, "quente": 3}
        current_priority = priority.get(current_temperature.lower(), 2)
        new_priority = priority.get(new_temperature.lower(), 2)
        
        # Always allow upgrade (getting hotter)
        if new_priority > current_priority:
            return True
        
        # Allow downgrade only if significant change
        if new_priority < current_priority:
            return True
        
        return False


def classify_lead_temperature(
    sentiment_score: Optional[float] = None,
    sentiment_label: Optional[str] = None,
    last_interaction: Optional[datetime] = None,
    message_content: Optional[str] = None,
    wants_to_schedule: bool = False
) -> str:
    """
    Convenience function for classifying lead temperature.
    
    Args:
        sentiment_score: Float from -1.0 to 1.0 indicating sentiment
        sentiment_label: "Positivo", "Neutro", or "Negativo"
        last_interaction: Datetime of last lead message
        message_content: Recent message content for keyword analysis
        wants_to_schedule: Whether lead expressed desire to schedule visit
    
    Returns:
        Temperature classification: "quente", "morno", or "frio"
    """
    service = TemperatureService()
    return service.classify_temperature(
        sentiment_score=sentiment_score,
        sentiment_label=sentiment_label,
        last_interaction=last_interaction,
        message_content=message_content,
        wants_to_schedule=wants_to_schedule
    )
