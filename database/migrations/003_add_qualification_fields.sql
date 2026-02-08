-- Migration: Add qualification fields to existing leads table
-- Requirements: 12.1, 12.2
-- Adds fields for Maria agent qualification flow

-- Add qualification fields to leads table in palmaslake-agno schema
ALTER TABLE "palmaslake-agno".leads 
ADD COLUMN IF NOT EXISTS source text CHECK (source IN ('instagram', 'facebook', 'site', 'indicacao', 'whatsapp')),
ADD COLUMN IF NOT EXISTS classification_type text CHECK (classification_type IN ('cliente_final', 'corretor', 'investidor')),
ADD COLUMN IF NOT EXISTS classification_confidence numeric(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS qualification_state jsonb DEFAULT '{"step": "name"}'::jsonb,
ADD COLUMN IF NOT EXISTS is_hot boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_interaction_at timestamp with time zone DEFAULT now();

-- Add conversation state fields to conversations table
ALTER TABLE "palmaslake-agno".conversations
ADD COLUMN IF NOT EXISTS state jsonb DEFAULT '{"phase": "greeting", "qualificationState": {"step": "name"}, "transferRequested": false}'::jsonb,
ADD COLUMN IF NOT EXISTS follow_up_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_follow_up_at timestamp with time zone;

-- Update status check constraint to include new statuses
ALTER TABLE "palmaslake-agno".leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE "palmaslake-agno".leads ADD CONSTRAINT leads_status_check 
CHECK (status IN ('new', 'contacted', 'visit_scheduled', 'sold', 'lost', 'novo_lead', 'qualificado', 'visita_agendada', 'visita_realizada', 'proposta_enviada', 'transferido'));

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_leads_is_hot ON "palmaslake-agno".leads(is_hot);
CREATE INDEX IF NOT EXISTS idx_leads_source ON "palmaslake-agno".leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_classification ON "palmaslake-agno".leads(classification_type);

-- Comments
COMMENT ON COLUMN "palmaslake-agno".leads.qualification_state IS 'Estado atual da qualificação do lead pelo agente Maria';
COMMENT ON COLUMN "palmaslake-agno".leads.is_hot IS 'Lead quente - prioridade alta para equipe comercial';
