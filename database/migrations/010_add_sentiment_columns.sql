-- =============================================================================
-- Migration 010: Add missing sentiment columns to leads table
-- =============================================================================
-- These columns are required by the sentiment analysis in agent_manager.py
-- Without them, the entire update_payload fails and NO fields get saved
-- (including conversation_summary, tags, adjectives, etc.)
-- =============================================================================

-- 1. sentiment_label: Stores the AI sentiment classification (Positivo/Neutro/Negativo)
ALTER TABLE "palmaslake-agno".leads 
    ADD COLUMN IF NOT EXISTS sentiment_label TEXT;

COMMENT ON COLUMN "palmaslake-agno".leads.sentiment_label IS 
    'Sentiment label from AI analysis: Positivo, Neutro, or Negativo';

-- 2. sentiment_score: Stores the numeric sentiment score (-100 to 100)
ALTER TABLE "palmaslake-agno".leads 
    ADD COLUMN IF NOT EXISTS sentiment_score INTEGER DEFAULT 0;

COMMENT ON COLUMN "palmaslake-agno".leads.sentiment_score IS 
    'Numeric sentiment score from -100 (very negative) to 100 (very positive)';

-- 3. last_analysis: Stores the full AI analysis JSON for reference
ALTER TABLE "palmaslake-agno".leads 
    ADD COLUMN IF NOT EXISTS last_analysis JSONB;

COMMENT ON COLUMN "palmaslake-agno".leads.last_analysis IS 
    'Full JSON output from the last AI sentiment/temperature analysis';
