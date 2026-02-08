
-- Create the schema
create schema if not exists "palmaslake-agno";

-- Grant usage on the schema to standard Supabase roles
grant usage on schema "palmaslake-agno" to postgres, anon, authenticated, service_role;

-- Grant all privileges on existing tables/sequences/functions (if any)
grant all privileges on all tables in schema "palmaslake-agno" to postgres, anon, authenticated, service_role;
grant all privileges on all sequences in schema "palmaslake-agno" to postgres, anon, authenticated, service_role;
grant all privileges on all functions in schema "palmaslake-agno" to postgres, anon, authenticated, service_role;

-- Set default privileges for future objects
alter default privileges in schema "palmaslake-agno" grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema "palmaslake-agno" grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema "palmaslake-agno" grant all on functions to postgres, anon, authenticated, service_role;
