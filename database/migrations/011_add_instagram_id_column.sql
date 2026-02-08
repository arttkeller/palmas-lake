-- =============================================================================
-- Migration 011: Add instagram_id column to leads table
-- =============================================================================
-- Adds support for Instagram DM integration via Meta API.
-- Leads coming from Instagram are identified by their Instagram Scoped User ID
-- (IGSID), which is different from phone numbers used for WhatsApp.
-- =============================================================================

-- 1. instagram_id: Stores the Instagram Scoped User ID (IGSID) for leads from Instagram
ALTER TABLE "palmaslake-agno".leads 
    ADD COLUMN IF NOT EXISTS instagram_id TEXT;

COMMENT ON COLUMN "palmaslake-agno".leads.instagram_id IS 
    'Instagram Scoped User ID (IGSID) for leads coming from Instagram DMs';

-- 2. Create unique index on instagram_id (only for non-null, non-empty values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_instagram_id 
    ON "palmaslake-agno".leads (instagram_id) 
    WHERE instagram_id IS NOT NULL AND instagram_id != '';

-- 3. Create index for fast lookups by instagram_id
CREATE INDEX IF NOT EXISTS idx_leads_instagram_id_lookup 
    ON "palmaslake-agno".leads (instagram_id) 
    WHERE instagram_id IS NOT NULL;
