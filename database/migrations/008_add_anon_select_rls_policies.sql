-- Migration: Add SELECT RLS policies for anon role on messages, conversations, and leads
-- Requirements: 3.1, 3.2, 3.3, 3.4
-- Feature: fix-chat-messages-loading
--
-- The frontend falls back to direct Supabase queries using the anon key when the
-- API backend is unavailable. Without these policies, RLS blocks the anon role from
-- reading messages, conversations, and leads, causing the chat to appear empty.

-- Enable RLS on tables in palmaslake-agno schema (idempotent, safe to re-run)
ALTER TABLE "palmaslake-agno".messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE "palmaslake-agno".conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE "palmaslake-agno".leads ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anon role to SELECT messages (Requirements 3.1)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'palmaslake-agno'
          AND tablename = 'messages'
          AND policyname = 'Allow anon select on messages'
    ) THEN
        CREATE POLICY "Allow anon select on messages"
        ON "palmaslake-agno".messages
        FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;

-- Policy: Allow anon role to SELECT conversations (Requirements 3.2)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'palmaslake-agno'
          AND tablename = 'conversations'
          AND policyname = 'Allow anon select on conversations'
    ) THEN
        CREATE POLICY "Allow anon select on conversations"
        ON "palmaslake-agno".conversations
        FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;

-- Policy: Allow anon role to SELECT leads (Requirements 3.3)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'palmaslake-agno'
          AND tablename = 'leads'
          AND policyname = 'Allow anon select on leads'
    ) THEN
        CREATE POLICY "Allow anon select on leads"
        ON "palmaslake-agno".leads
        FOR SELECT
        TO anon
        USING (true);
    END IF;
END $$;
