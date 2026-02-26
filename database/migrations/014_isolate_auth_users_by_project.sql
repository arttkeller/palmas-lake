-- =============================================================================
-- Migration 014: Isolate auth.users sync by project
-- =============================================================================
-- Prevents users from other schemas/projects in the same Supabase Auth project
-- from being inserted into "palmaslake-agno".users.
-- =============================================================================

-- Recreate function with strict project filter
CREATE OR REPLACE FUNCTION "palmaslake-agno".handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    registration_project TEXT;
BEGIN
    registration_project := lower(trim(COALESCE(
        NEW.raw_app_meta_data->>'registration_project',
        NEW.raw_app_meta_data->>'project_schema',
        NEW.raw_user_meta_data->>'registration_project',
        NEW.raw_user_meta_data->>'project_schema',
        NEW.raw_user_meta_data->>'project',
        ''
    )));

    IF registration_project <> 'palmaslake-agno' THEN
        RETURN NEW;
    END IF;

    INSERT INTO "palmaslake-agno".users (id, email, full_name, whatsapp_number, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'whatsapp_number', '')), ''),
        'user'
    )
    ON CONFLICT (id) DO UPDATE SET
        whatsapp_number = COALESCE(
            NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'whatsapp_number', '')), ''),
            "palmaslake-agno".users.whatsapp_number
        );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure a dedicated trigger exists for this project when permissions allow.
-- We avoid ALTER/DROP on auth.users triggers because some Supabase setups run
-- with roles that are not table owners, which causes migration failures.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        WHERE t.tgrelid = 'auth.users'::regclass
          AND t.tgname = 'on_auth_user_created_palmaslake_agno'
    ) THEN
        BEGIN
            CREATE TRIGGER on_auth_user_created_palmaslake_agno
                AFTER INSERT ON auth.users
                FOR EACH ROW
                EXECUTE FUNCTION "palmaslake-agno".handle_new_auth_user();
        EXCEPTION
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Could not create dedicated trigger on auth.users due to privilege restrictions. Existing trigger(s) continue using updated function.';
        END;
    END IF;
END;
$$;

-- Backfill only users explicitly tagged for this project
INSERT INTO "palmaslake-agno".users (id, email, full_name, role)
SELECT
    au.id,
    COALESCE(au.email, ''),
    COALESCE(au.raw_user_meta_data->>'full_name', ''),
    'user'
FROM auth.users au
WHERE lower(trim(COALESCE(
    au.raw_app_meta_data->>'registration_project',
    au.raw_app_meta_data->>'project_schema',
    au.raw_user_meta_data->>'registration_project',
    au.raw_user_meta_data->>'project_schema',
    au.raw_user_meta_data->>'project',
    ''
))) = 'palmaslake-agno'
AND NOT EXISTS (
    SELECT 1 FROM "palmaslake-agno".users u WHERE u.id = au.id
)
ON CONFLICT (id) DO NOTHING;
