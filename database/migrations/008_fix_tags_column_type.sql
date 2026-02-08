-- Migration: Fix tags column type from text[] to JSONB
-- The original migration 003 created tags as text[], and migration 007's
-- ADD COLUMN IF NOT EXISTS was silently ignored since the column already existed.
-- This caused the agent_manager to fail silently when saving tags as JSON arrays.

-- Step 1: Remove the text[] default
ALTER TABLE "palmaslake-agno".leads 
  ALTER COLUMN tags DROP DEFAULT;

-- Step 2: Convert from text[] to JSONB, preserving existing data
ALTER TABLE "palmaslake-agno".leads 
  ALTER COLUMN tags TYPE JSONB 
  USING COALESCE(to_jsonb(tags), '[]'::jsonb);

-- Step 3: Set the correct JSONB default
ALTER TABLE "palmaslake-agno".leads 
  ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
