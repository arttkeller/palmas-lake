-- Migration: Add follow-up system fields to leads table and create follow_up_queue table
-- Requirements: 4.3, 4.4, 6.1, 6.2, 6.3
-- Feature: fix-reaction-persistence

-- =============================================================================
-- Part 1: Add new columns to leads table
-- Requirements: 4.3, 4.4, 6.1
-- =============================================================================

-- Add tags field as JSONB for AI-generated tags (Requirements 4.3)
-- Note: Migration 003 added tags as text[], this converts to JSONB for better querying
ALTER TABLE "palmaslake-agno".leads ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Add adjectives field as JSONB for sentiment adjectives (Requirements 4.4)
ALTER TABLE "palmaslake-agno".leads ADD COLUMN IF NOT EXISTS adjectives JSONB DEFAULT '[]'::jsonb;

-- Add last_interaction timestamp for tracking lead activity (Requirements 6.1)
ALTER TABLE "palmaslake-agno".leads ADD COLUMN IF NOT EXISTS last_interaction TIMESTAMP WITH TIME ZONE;

-- Add follow_up_stage to track which follow-up stage the lead is at (Requirements 6.1)
ALTER TABLE "palmaslake-agno".leads ADD COLUMN IF NOT EXISTS follow_up_stage INTEGER DEFAULT 0;

-- Add next_follow_up timestamp for scheduling (Requirements 6.1)
ALTER TABLE "palmaslake-agno".leads ADD COLUMN IF NOT EXISTS next_follow_up TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_last_interaction ON "palmaslake-agno".leads(last_interaction);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_stage ON "palmaslake-agno".leads(follow_up_stage);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON "palmaslake-agno".leads(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_leads_tags ON "palmaslake-agno".leads USING GIN (tags);

-- Comments for documentation
COMMENT ON COLUMN "palmaslake-agno".leads.tags IS 'AI-generated tags as JSON array (e.g., ["apartamento", "investidor"])';
COMMENT ON COLUMN "palmaslake-agno".leads.adjectives IS 'Sentiment adjectives as JSON array (e.g., ["Interessado", "Decidido"])';
COMMENT ON COLUMN "palmaslake-agno".leads.last_interaction IS 'Timestamp of last lead interaction for follow-up tracking';
COMMENT ON COLUMN "palmaslake-agno".leads.follow_up_stage IS 'Current follow-up stage: 0=none, 1=2h, 2=24h, 3=72h';
COMMENT ON COLUMN "palmaslake-agno".leads.next_follow_up IS 'Scheduled timestamp for next follow-up message';

-- =============================================================================
-- Part 2: Create follow_up_queue table
-- Requirements: 6.1, 6.2, 6.3
-- =============================================================================

CREATE TABLE IF NOT EXISTS "palmaslake-agno".follow_up_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES "palmaslake-agno".leads(id) ON DELETE CASCADE NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    stage INTEGER NOT NULL DEFAULT 1 CHECK (stage >= 1 AND stage <= 3),
    message_template VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for follow_up_queue
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_lead_id ON "palmaslake-agno".follow_up_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_status ON "palmaslake-agno".follow_up_queue(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_scheduled_at ON "palmaslake-agno".follow_up_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_status_scheduled ON "palmaslake-agno".follow_up_queue(status, scheduled_at);

-- Comments for documentation
COMMENT ON TABLE "palmaslake-agno".follow_up_queue IS 'Queue for scheduling proactive follow-up messages to inactive leads';
COMMENT ON COLUMN "palmaslake-agno".follow_up_queue.lead_id IS 'Reference to the lead receiving the follow-up';
COMMENT ON COLUMN "palmaslake-agno".follow_up_queue.scheduled_at IS 'When the follow-up should be sent';
COMMENT ON COLUMN "palmaslake-agno".follow_up_queue.stage IS 'Follow-up stage: 1=2h gentle reminder, 2=24h different approach, 3=72h final';
COMMENT ON COLUMN "palmaslake-agno".follow_up_queue.message_template IS 'Template identifier for the follow-up message';
COMMENT ON COLUMN "palmaslake-agno".follow_up_queue.status IS 'Status: pending, executed, cancelled, or failed';
COMMENT ON COLUMN "palmaslake-agno".follow_up_queue.executed_at IS 'When the follow-up was actually sent';

-- Enable Row Level Security
ALTER TABLE "palmaslake-agno".follow_up_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy for follow_up_queue
CREATE POLICY "Enable all access for authenticated users" ON "palmaslake-agno".follow_up_queue 
    FOR ALL USING (auth.role() = 'authenticated');

-- Enable realtime for follow-up updates
ALTER PUBLICATION supabase_realtime ADD TABLE "palmaslake-agno".follow_up_queue;
