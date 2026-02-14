-- =============================================================================
-- Migration 015: Add 1-hour reminder tracking for visit events
-- =============================================================================
-- Adds flags used by the API cron webhook to send confirmation reminders
-- one hour before each visit, without duplicate sends.
-- =============================================================================

ALTER TABLE "palmaslake-agno".events
    ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false;

ALTER TABLE "palmaslake-agno".events
    ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ;

-- Backfill nulls defensively for older rows.
UPDATE "palmaslake-agno".events
SET reminder_1h_sent = false
WHERE reminder_1h_sent IS NULL;

-- Index used by the reminder processor (future events not reminded yet).
CREATE INDEX IF NOT EXISTS idx_events_start_time_pending_reminder
    ON "palmaslake-agno".events(start_time)
    WHERE reminder_1h_sent = false;

COMMENT ON COLUMN "palmaslake-agno".events.reminder_1h_sent IS
    'Whether the 1-hour attendance reminder has already been sent';

COMMENT ON COLUMN "palmaslake-agno".events.reminder_1h_sent_at IS
    'Timestamp when the 1-hour attendance reminder was sent';
