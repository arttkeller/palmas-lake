-- Migration: Setup cron job para follow-ups automáticos
-- Usa pg_cron + pg_net (extensões nativas do Supabase)
-- 
-- O cron job roda a cada 5 minutos e faz POST para o webhook da API.
-- A API então executa os follow-ups pendentes que já passaram do scheduled_at.
--
-- IMPORTANTE: Execute este SQL no SQL Editor do Supabase Dashboard.
-- As extensões pg_cron e pg_net precisam estar habilitadas no projeto.

-- =============================================================================
-- Part 1: Extensões necessárias
-- =============================================================================

-- pg_cron e pg_net já vêm habilitadas no Supabase.
-- Se precisar habilitá-las manualmente, faça pelo Dashboard:
-- Database > Extensions > Buscar "pg_cron" e "pg_net" > Enable
--
-- NÃO use CREATE EXTENSION aqui — no Supabase isso causa erro de privilégios.
-- As extensões são gerenciadas pelo próprio Supabase.

-- =============================================================================
-- Part 2: Adicionar coluna conversation_summary à tabela leads
-- =============================================================================

ALTER TABLE "palmaslake-agno".leads 
    ADD COLUMN IF NOT EXISTS conversation_summary TEXT;

COMMENT ON COLUMN "palmaslake-agno".leads.conversation_summary IS 
    'Resumo da conversa gerado pela IA (1-2 frases)';

-- =============================================================================
-- Part 3: Atualizar comentário da coluna follow_up_stage (72h → 48h)
-- =============================================================================

COMMENT ON COLUMN "palmaslake-agno".leads.follow_up_stage IS 
    'Current follow-up stage: 0=none, 1=2h, 2=24h após Stage 1, 3=48h após Stage 2';

COMMENT ON COLUMN "palmaslake-agno".follow_up_queue.stage IS 
    'Follow-up stage: 1=2h reminder, 2=24h após Stage 1, 3=48h após Stage 2 (final)';

-- =============================================================================
-- Part 4: Adicionar RLS policy para acesso anônimo (necessário para pg_net/cron)
-- =============================================================================

-- O pg_net faz requisições como "anon", então precisamos de políticas adequadas
DO $$ BEGIN
    CREATE POLICY "Allow anon select on follow_up_queue" 
        ON "palmaslake-agno".follow_up_queue
        FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN 
    NULL;
END $$;

-- =============================================================================
-- Part 5: Criar o cron job
-- =============================================================================

-- Remover job anterior se existir (para permitir re-execução do migration)
SELECT cron.unschedule('follow-up-processor')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'follow-up-processor'
);

-- Criar o cron job que roda a cada 5 minutos
-- 
-- ATENÇÃO: Substitua 'http://SEU_IP_OU_DOMINIO:8000' pelo endereço real da API.
-- 
-- Opções:
-- 1. Se usando ngrok/túnel: https://seu-tunel.ngrok-free.app
-- 2. Se em produção: https://api.seudominio.com
-- 3. Se localhost (desenvolvimento): http://host.docker.internal:8000
--    (ou o IP da máquina na rede local)
--
-- Para alterar a URL depois:
--   SELECT cron.unschedule('follow-up-processor');
--   E re-execute o SELECT cron.schedule abaixo com a URL correta.

SELECT cron.schedule(
    'follow-up-processor',          -- nome do job
    '*/5 * * * *',                  -- a cada 5 minutos
    $$
    SELECT net.http_post(
        url := 'https://api-palmas.blackai.dev/api/webhook/follow-up-cron',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Secret', 'palmaslake-follow-up-cron-2024'
        ),
        body := jsonb_build_object(
            'source', 'supabase_cron',
            'triggered_at', now()::text
        )
    );
    $$
);

-- =============================================================================
-- Part 6: Verificar que o job foi criado
-- =============================================================================

-- Para verificar os jobs ativos:
-- SELECT * FROM cron.job;

-- Para ver logs de execução:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Para desativar temporariamente:
-- SELECT cron.unschedule('follow-up-processor');
