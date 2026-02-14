-- ============================================
-- MIGRATION: Criar tabela de eventos/agendamentos
-- Execute no SQL Editor do Supabase
-- ============================================

-- Criar tabela de eventos
CREATE TABLE IF NOT EXISTS "palmaslake-agno".events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    color VARCHAR(50) DEFAULT 'blue',
    category VARCHAR(100) DEFAULT 'Visita',
    
    -- Relacionamento com lead (opcional)
    lead_id UUID REFERENCES "palmaslake-agno".leads(id) ON DELETE SET NULL,
    lead_name VARCHAR(255),
    lead_phone VARCHAR(50),
    lead_email VARCHAR(255),
    
    -- Metadados
    created_by VARCHAR(100) DEFAULT 'ai_sofia',
    location VARCHAR(255),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'confirmado',
    reminder_1h_sent BOOLEAN DEFAULT false,
    reminder_1h_sent_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_events_start_time ON "palmaslake-agno".events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_lead_id ON "palmaslake-agno".events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON "palmaslake-agno".events(status);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION "palmaslake-agno".update_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_updated_at ON "palmaslake-agno".events;
CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON "palmaslake-agno".events
    FOR EACH ROW
    EXECUTE FUNCTION "palmaslake-agno".update_events_timestamp();

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE "palmaslake-agno".events;

-- Comentários
COMMENT ON TABLE "palmaslake-agno".events IS 'Tabela de agendamentos de visitas e eventos';
COMMENT ON COLUMN "palmaslake-agno".events.created_by IS 'Quem criou: ai_sofia, manual, system';
COMMENT ON COLUMN "palmaslake-agno".events.status IS 'confirmado, cancelado, realizado, pendente';
COMMENT ON COLUMN "palmaslake-agno".events.reminder_1h_sent IS 'Se o lembrete de confirmacao 1h antes foi enviado';
COMMENT ON COLUMN "palmaslake-agno".events.reminder_1h_sent_at IS 'Quando o lembrete 1h antes foi enviado';
