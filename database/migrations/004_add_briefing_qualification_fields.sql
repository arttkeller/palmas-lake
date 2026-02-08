-- Migration: Add qualification fields from briefing técnico
-- Adds fields for complete lead qualification as specified in briefing

-- Add qualification fields to leads table
ALTER TABLE "palmaslake-agno".leads 
ADD COLUMN IF NOT EXISTS interest_type text CHECK (interest_type IN ('apartamento', 'sala_comercial', 'office', 'flat', 'loft')),
ADD COLUMN IF NOT EXISTS objective text CHECK (objective IN ('morar', 'investir', 'morar_investir')),
ADD COLUMN IF NOT EXISTS purchase_timeline text,
ADD COLUMN IF NOT EXISTS knows_region boolean,
ADD COLUMN IF NOT EXISTS city_origin text,
ADD COLUMN IF NOT EXISTS preferred_tower text CHECK (preferred_tower IN ('sky', 'garden', 'park', 'torre_d')),
ADD COLUMN IF NOT EXISTS budget_range text,
ADD COLUMN IF NOT EXISTS visit_preference text CHECK (visit_preference IN ('manha', 'tarde')),
ADD COLUMN IF NOT EXISTS visit_scheduled_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS visit_reminder_sent boolean DEFAULT false;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_leads_interest_type ON "palmaslake-agno".leads(interest_type);
CREATE INDEX IF NOT EXISTS idx_leads_objective ON "palmaslake-agno".leads(objective);
CREATE INDEX IF NOT EXISTS idx_leads_visit_scheduled ON "palmaslake-agno".leads(visit_scheduled_date);

-- Comments
COMMENT ON COLUMN "palmaslake-agno".leads.interest_type IS 'Tipo de imóvel de interesse: apartamento, sala_comercial, office, flat, loft';
COMMENT ON COLUMN "palmaslake-agno".leads.objective IS 'Objetivo: morar, investir ou ambos';
COMMENT ON COLUMN "palmaslake-agno".leads.purchase_timeline IS 'Prazo planejado para aquisição';
COMMENT ON COLUMN "palmaslake-agno".leads.knows_region IS 'Se o lead já conhece a região da Orla 14';
COMMENT ON COLUMN "palmaslake-agno".leads.city_origin IS 'Cidade de origem do lead';
COMMENT ON COLUMN "palmaslake-agno".leads.preferred_tower IS 'Torre de preferência';
COMMENT ON COLUMN "palmaslake-agno".leads.budget_range IS 'Faixa de orçamento (opcional)';
COMMENT ON COLUMN "palmaslake-agno".leads.visit_preference IS 'Preferência de horário para visita';
COMMENT ON COLUMN "palmaslake-agno".leads.visit_scheduled_date IS 'Data/hora agendada para visita';
COMMENT ON COLUMN "palmaslake-agno".leads.visit_reminder_sent IS 'Se o lembrete de visita foi enviado';
