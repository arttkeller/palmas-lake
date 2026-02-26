-- Migration 017: Atualizar trigger para salvar whatsapp_number no cadastro
--
-- O formulário de registro agora envia whatsapp_number nos metadados do usuario.
-- Atualizamos o trigger handle_new_auth_user() para extrair e salvar esse campo.
--
-- IMPORTANTE: Execute este SQL no SQL Editor do Supabase Dashboard
-- (apos ter rodado a migration 016 que adiciona a coluna whatsapp_number).

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
