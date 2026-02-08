-- Migration: Create analytics_cache table for realtime analytics
-- Requirements: 3.1, 3.3 - Store metric snapshots with timestamps and preserve previous data

-- Create analytics_cache table in the palmaslake-agno schema
CREATE TABLE IF NOT EXISTS "palmaslake-agno".analytics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type VARCHAR(50) NOT NULL,  -- 'dashboard', 'funnel', 'sentiment', 'response_times'
    data JSONB NOT NULL,               -- Métricas serializadas
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    calculation_duration_ms INTEGER,
    trigger_source VARCHAR(100),       -- 'message_webhook', 'manual_refresh', 'scheduled'
    previous_data JSONB,               -- Snapshot anterior para comparação
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE "palmaslake-agno".analytics_cache IS 'Cache table for pre-calculated analytics metrics with realtime updates';
COMMENT ON COLUMN "palmaslake-agno".analytics_cache.metric_type IS 'Type of metric: dashboard, funnel, sentiment, response_times';
COMMENT ON COLUMN "palmaslake-agno".analytics_cache.data IS 'JSON serialized metrics data';
COMMENT ON COLUMN "palmaslake-agno".analytics_cache.calculated_at IS 'Timestamp when metrics were calculated';
COMMENT ON COLUMN "palmaslake-agno".analytics_cache.calculation_duration_ms IS 'Time taken to calculate metrics in milliseconds';
COMMENT ON COLUMN "palmaslake-agno".analytics_cache.trigger_source IS 'What triggered the recalculation';
COMMENT ON COLUMN "palmaslake-agno".analytics_cache.previous_data IS 'Previous metric snapshot for comparison';

-- Create index on metric_type for fast lookups
CREATE INDEX IF NOT EXISTS idx_analytics_cache_metric_type 
ON "palmaslake-agno".analytics_cache(metric_type);

-- Create index on calculated_at for stale data queries
CREATE INDEX IF NOT EXISTS idx_analytics_cache_calculated_at 
ON "palmaslake-agno".analytics_cache(calculated_at DESC);

-- Enable Row Level Security
ALTER TABLE "palmaslake-agno".analytics_cache ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Enable all access for authenticated users" 
ON "palmaslake-agno".analytics_cache 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create policy for service role (backend access)
CREATE POLICY "Enable all access for service role" 
ON "palmaslake-agno".analytics_cache 
FOR ALL 
TO service_role
USING (true);

-- Enable Realtime publication for the table
-- Note: This adds the table to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE "palmaslake-agno".analytics_cache;
