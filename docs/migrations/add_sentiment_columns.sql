-- ============================================
-- MIGRATION: Adicionar colunas de sentimento
-- EXECUTE ESSE SQL NO SUPABASE SQL EDITOR AGORA!
-- ============================================

-- Adicionar colunas de sentimento à tabela leads
ALTER TABLE "palmaslake-agno".leads 
ADD COLUMN IF NOT EXISTS sentiment_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sentiment_label VARCHAR(50) DEFAULT 'neutro';

-- Comentários para documentação
COMMENT ON COLUMN "palmaslake-agno".leads.sentiment_score IS 'Score de sentimento de -100 (negativo) a +100 (positivo), calculado por IA';
COMMENT ON COLUMN "palmaslake-agno".leads.sentiment_label IS 'Label do sentimento: positivo, neutro, negativo';

-- Verificar se as colunas foram criadas
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'palmaslake-agno' 
AND table_name = 'leads'
AND column_name IN ('sentiment_score', 'sentiment_label');

-- Depois de executar, envie uma nova mensagem no WhatsApp para testar a análise automática
