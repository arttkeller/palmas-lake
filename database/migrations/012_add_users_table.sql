-- =============================================================================
-- Migration 012: Add users table for role-based access control
-- =============================================================================
-- Creates a users table in the palmaslake-agno schema linked to Supabase
-- auth.users. Supports 'admin' and 'user' roles. Includes a trigger to
-- auto-create a user row when someone signs up via Supabase Auth.
-- =============================================================================

-- 1. Create users table
CREATE TABLE IF NOT EXISTS "palmaslake-agno".users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE "palmaslake-agno".users IS
    'CRM users linked to Supabase auth, with role-based access control';

COMMENT ON COLUMN "palmaslake-agno".users.role IS
    'User role: admin (full access) or user (leads-level access)';

-- 2. Create index on role for fast permission checks
CREATE INDEX IF NOT EXISTS idx_users_role
    ON "palmaslake-agno".users (role);

-- 3. Create index on email for lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON "palmaslake-agno".users (email);

-- 4. Trigger function: auto-create user row on Supabase Auth signup
CREATE OR REPLACE FUNCTION "palmaslake-agno".handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "palmaslake-agno".users (id, email, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'user'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION "palmaslake-agno".handle_new_auth_user();

-- 6. Updated_at trigger
CREATE OR REPLACE FUNCTION "palmaslake-agno".update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON "palmaslake-agno".users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON "palmaslake-agno".users
    FOR EACH ROW
    EXECUTE FUNCTION "palmaslake-agno".update_users_updated_at();

-- 7. Backfill: insert existing auth users that don't have a CRM user row yet
INSERT INTO "palmaslake-agno".users (id, email, full_name, role)
SELECT
    au.id,
    COALESCE(au.email, ''),
    COALESCE(au.raw_user_meta_data->>'full_name', ''),
    'user'
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM "palmaslake-agno".users u WHERE u.id = au.id
)
ON CONFLICT (id) DO NOTHING;
