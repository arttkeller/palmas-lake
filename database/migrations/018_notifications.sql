-- Migration 018: Tabela de notificacoes para vendedores
-- Suporta dois tipos: 'transfer' (lead designado) e 'follow_up' (lembrete com sugestao IA)
-- Executar no SQL Editor do Supabase Dashboard

-- 1. Criar tabela
CREATE TABLE IF NOT EXISTS "palmaslake-agno".notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES "palmaslake-agno".users(id) ON DELETE CASCADE,
    lead_id         UUID NOT NULL REFERENCES "palmaslake-agno".leads(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('transfer', 'follow_up')),
    title           TEXT NOT NULL,
    body            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'responded')),
    read_at         TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_seller_id ON "palmaslake-agno".notifications(seller_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON "palmaslake-agno".notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON "palmaslake-agno".notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_seller_status ON "palmaslake-agno".notifications(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_lead_id ON "palmaslake-agno".notifications(lead_id);

-- 3. RLS — vendedor so ve suas proprias notificacoes
ALTER TABLE "palmaslake-agno".notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON "palmaslake-agno".notifications
    FOR SELECT
    USING (seller_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON "palmaslake-agno".notifications
    FOR UPDATE
    USING (seller_id = auth.uid());

-- Service role pode inserir (backend insere via service_role key)
CREATE POLICY "Service role can insert notifications"
    ON "palmaslake-agno".notifications
    FOR INSERT
    WITH CHECK (true);

-- 4. Habilitar Realtime para a tabela
ALTER PUBLICATION supabase_realtime ADD TABLE "palmaslake-agno".notifications;

-- 5. Adicionar responded_at ao lead_assignments (para metricas de SLA)
ALTER TABLE "palmaslake-agno".lead_assignments
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

COMMENT ON TABLE "palmaslake-agno".notifications IS 'Notificacoes real-time para vendedores (transferencias e follow-ups)';
COMMENT ON COLUMN "palmaslake-agno".notifications.responded_at IS 'Timestamp de quando o vendedor respondeu — usado para calcular tempo de resposta';
