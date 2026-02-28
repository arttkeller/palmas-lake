"""
SentimentService - Automatic sentiment calculation and updates for leads.

This service calculates sentiment scores based on lead status and notes content,
and automatically updates sentiment when status changes.

Implements comprehensive error handling (Requirements 3.4, 7.4, 9.5):
- Try-catch blocks for all database operations
- Detailed error logging for schema mismatches
- Retry logic for failed operations
"""

from services.supabase_client import create_client
from typing import Dict, Optional
import re
import logging
import traceback


# Configure logging for SentimentService (Requirements 3.4, 7.4)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Create console handler if not already present
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)


class SentimentServiceError(Exception):
    """Custom exception for SentimentService errors."""
    pass


class SchemaError(SentimentServiceError):
    """Exception for schema-related errors (Requirements 7.4)."""
    pass


# Status to sentiment score mapping
# Scores range from -100 (very negative) to 100 (very positive)
STATUS_SENTIMENT_MAP = {
    'vendido': 100,           # Sold - maximum positive
    'transferido': 80,        # Transferred to human - positive (lead qualificado avançou no funil)
    'qualificado': 80,        # Qualified (legacy) - highly positive
    'visita_agendada': 70,    # Visit scheduled - very positive
    'proposta_enviada': 60,   # Proposal sent - positive
    'visita_realizada': 50,   # Visit completed - moderately positive
    'contatado': 30,          # Contacted - slightly positive
    'contacted': 30,          # English variant
    'novo_lead': 0,           # New lead - neutral
    'new': 0,                 # English variant - neutral
    'perdido': -60,           # Lost - very negative
    'arquivado': -40,         # Archived - negative
}


class SentimentService:
    """
    Service for calculating and updating lead sentiment scores.
    
    Implements comprehensive error handling as per Requirements 3.4, 7.4.
    """
    
    def __init__(self):
        """Initialize SentimentService with Supabase client."""
        try:
            self.supabase = create_client()
            logger.debug("SentimentService initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize SentimentService: {e}")
            raise SentimentServiceError(f"Initialization failed: {e}")
    
    def calculate_sentiment(self, lead: Dict) -> int:
        """
        Calculates sentiment score (-100 to 100) based on:
        1. Status (primary indicator)
        2. Notes content (secondary indicator)
        
        Implements error handling (Requirements 3.4).
        
        Args:
            lead: Dictionary containing lead data with 'status' and optionally 'notes'
        
        Returns:
            Sentiment score as integer between -100 and 100
        """
        try:
            status = lead.get('status', 'new')
            notes = lead.get('notes', '')
            
            # Primary indicator: status-based sentiment
            base_sentiment = STATUS_SENTIMENT_MAP.get(status, 0)
            
            # Log unknown status values
            if status and status not in STATUS_SENTIMENT_MAP:
                logger.warning(f"Unknown status '{status}' - using default sentiment 0")
            
            # Secondary indicator: notes content analysis
            # Only apply notes adjustment if status is neutral (0)
            if base_sentiment == 0 and notes:
                notes_adjustment = self._analyze_notes_sentiment(notes)
                final_sentiment = max(-100, min(100, base_sentiment + notes_adjustment))
                logger.debug(f"Calculated sentiment for status '{status}': base={base_sentiment}, notes_adj={notes_adjustment}, final={final_sentiment}")
                return final_sentiment
            
            logger.debug(f"Calculated sentiment for status '{status}': {base_sentiment}")
            return base_sentiment
            
        except Exception as e:
            logger.error(f"Error calculating sentiment: {e}")
            # Return neutral sentiment on error
            return 0
    
    def _analyze_notes_sentiment(self, notes: str) -> int:
        """
        Analyzes notes content for sentiment indicators.
        
        Args:
            notes: Text content of notes
        
        Returns:
            Sentiment adjustment value (-30 to +30)
        """
        try:
            if not notes:
                return 0
            
            notes_lower = notes.lower()
            
            # Positive indicators
            positive_keywords = [
                'interessado', 'interested', 'positivo', 'positive', 
                'entusiasmado', 'enthusiastic', 'ótimo', 'great',
                'excelente', 'excellent', 'animado', 'excited'
            ]
            
            # Negative indicators
            negative_keywords = [
                'não interessado', 'not interested', 'negativo', 'negative',
                'desinteressado', 'uninterested', 'recusou', 'refused',
                'rejeitou', 'rejected', 'sem interesse', 'no interest'
            ]
            
            positive_count = sum(1 for keyword in positive_keywords if keyword in notes_lower)
            negative_count = sum(1 for keyword in negative_keywords if keyword in notes_lower)
            
            # Calculate adjustment (max ±30 points)
            adjustment = (positive_count - negative_count) * 15
            return max(-30, min(30, adjustment))
            
        except Exception as e:
            logger.error(f"Error analyzing notes sentiment: {e}")
            return 0
    
    def update_on_status_change(self, lead_id: str, new_status: str) -> bool:
        """
        Updates sentiment when status changes.
        Called automatically by lead update endpoints.
        
        Implements error handling with retry logic (Requirements 3.4, 7.4, 9.5).
        
        Args:
            lead_id: UUID of the lead
            new_status: New status value
        
        Returns:
            True if updated successfully, False otherwise
        """
        max_retries = 1
        last_error = None
        
        for attempt in range(max_retries + 1):
            try:
                # Fetch current lead data
                lead_res = self.supabase.table("leads").select("*").eq("id", lead_id).execute()
                
                if not lead_res.data:
                    logger.warning(f"Lead not found: {lead_id}")
                    return False
                
                lead = lead_res.data[0]
                
                # Update status in lead dict for calculation
                lead['status'] = new_status
                
                # Calculate new sentiment
                new_sentiment = self.calculate_sentiment(lead)
                
                # Derive sentiment_label from score
                if new_sentiment > 20:
                    new_label = "Positivo"
                elif new_sentiment < -20:
                    new_label = "Negativo"
                else:
                    new_label = "Neutro"
                
                # Update both score and label in database
                update_res = self.supabase.table("leads").update({
                    "sentiment_score": new_sentiment,
                    "sentiment_label": new_label
                }).eq("id", lead_id).execute()
                
                if update_res.data:
                    logger.info(f"Updated sentiment for lead {lead_id}: {new_sentiment} (status: {new_status})")
                    return True
                else:
                    logger.warning(f"No data returned from sentiment update for lead {lead_id}")
                    # Retry on empty response
                    if attempt < max_retries:
                        logger.info(f"Retrying sentiment update (attempt {attempt + 2})")
                        continue
                    return False
                    
            except Exception as e:
                last_error = e
                logger.error(f"Error updating sentiment (attempt {attempt + 1}): {e}")
                
                # Check for schema-related errors (Requirements 7.4)
                if "schema" in str(e).lower() or "not found" in str(e).lower():
                    logger.error(f"[SCHEMA ERROR] Sentiment update failed - verify schema 'palmaslake-agno' is correct")
                
                if attempt < max_retries:
                    logger.info(f"Retrying sentiment update (attempt {attempt + 2})")
                    continue
                    
                logger.error(f"Failed to update sentiment after {max_retries + 1} attempts: {last_error}")
                logger.error(traceback.format_exc())
                return False
        
        return False
    
    def recalculate_all_sentiments(self) -> int:
        """
        Recalculates sentiment for all leads in the database.
        Useful for batch updates or migrations.
        
        Implements error handling (Requirements 3.4, 7.4).
        
        Returns:
            Number of leads updated
        """
        try:
            # Fetch all leads
            leads_res = self.supabase.table("leads").select("*").execute()
            
            if not leads_res.data:
                logger.info("No leads found for sentiment recalculation")
                return 0
            
            updated_count = 0
            error_count = 0
            
            for lead in leads_res.data:
                try:
                    # Calculate sentiment
                    new_sentiment = self.calculate_sentiment(lead)
                    
                    # Derive sentiment_label from score
                    if new_sentiment > 20:
                        new_label = "Positivo"
                    elif new_sentiment < -20:
                        new_label = "Negativo"
                    else:
                        new_label = "Neutro"
                    
                    # Update both score and label in database
                    self.supabase.table("leads").update({
                        "sentiment_score": new_sentiment,
                        "sentiment_label": new_label
                    }).eq("id", lead['id']).execute()
                    
                    updated_count += 1
                    
                except Exception as lead_error:
                    error_count += 1
                    logger.error(f"Error updating sentiment for lead {lead.get('id')}: {lead_error}")
                    # Check for schema-related errors (Requirements 7.4)
                    if "schema" in str(lead_error).lower():
                        logger.error(f"[SCHEMA ERROR] Lead update failed - verify schema 'palmaslake-agno' is correct")
                    # Continue with other leads
                    continue
            
            logger.info(f"Recalculated sentiment for {updated_count} leads ({error_count} errors)")
            return updated_count
            
        except Exception as e:
            logger.error(f"Error recalculating sentiments: {e}")
            logger.error(traceback.format_exc())
            # Check for schema-related errors (Requirements 7.4)
            if "schema" in str(e).lower():
                logger.error(f"[SCHEMA ERROR] Leads query failed - verify schema 'palmaslake-agno' is correct")
            return 0
