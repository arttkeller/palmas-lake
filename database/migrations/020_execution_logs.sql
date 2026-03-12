-- Migration 020: Execution Logs
-- Stores individual pipeline execution events (IN → PROCESS → OUT) for the
-- monitoring dashboard. Enables clickable request inspection similar to an
-- APM tool.
--
-- Data is inserted fire-and-forget from the Python backend; reads come from
-- the /api/executions endpoint with cursor-based pagination.

-- 1. Create execution_logs table
CREATE TABLE IF NOT EXISTS "palmaslake-agno".execution_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp timestamptz NOT NULL DEFAULT now(),
    type text NOT NULL,            -- 'IN', 'OUT', 'PROCESS', 'TOOL', 'ERROR'
    method text,                   -- 'WEBHOOK', 'POST', 'GET', etc.
    path text NOT NULL,            -- 'maria/received', 'maria/response', tool name, etc.
    status_code int DEFAULT 200,
    duration_ms float DEFAULT 0,
    lead_id text,
    channel text,                  -- 'whatsapp', 'instagram'
    model text,                    -- AI model used (gpt-5.4, gpt-5-mini)
    tokens_in int DEFAULT 0,
    tokens_out int DEFAULT 0,
    routing_decision text,         -- 'heavy', 'light'
    payload jsonb,                 -- request/response body (truncated)
    metadata jsonb,                -- extra context (tool args, error message, etc.)
    created_at timestamptz DEFAULT now()
);

-- 2. Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_exec_logs_timestamp
    ON "palmaslake-agno".execution_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_exec_logs_lead_id
    ON "palmaslake-agno".execution_logs (lead_id)
    WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exec_logs_type
    ON "palmaslake-agno".execution_logs (type);

-- 3. RLS: allow service_role full access (API backend uses service_role key)
ALTER TABLE "palmaslake-agno".execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "palmaslake-agno".execution_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. Auto-cleanup: delete logs older than 7 days
-- If pg_cron is available, uncomment:
-- SELECT cron.schedule(
--     'cleanup_execution_logs',
--     '0 3 * * *',  -- daily at 3am
--     $$DELETE FROM "palmaslake-agno".execution_logs WHERE timestamp < now() - interval '7 days'$$
-- );

-- Manual cleanup (run periodically if pg_cron is not available):
-- DELETE FROM "palmaslake-agno".execution_logs WHERE timestamp < now() - interval '7 days';
