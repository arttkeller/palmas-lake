-- Migration 016: Sistema de Roleta de Transferencias (Round-Robin)
--
-- Adiciona infraestrutura para distribuir leads transferidos entre vendedores
-- cadastrados em rotacao sequencial (A -> B -> C -> A).
--
-- Quando nenhum vendedor esta ativo, o sistema faz fallback para o GERENTE_PHONE
-- hardcoded, mantendo o comportamento atual.
--
-- IMPORTANTE: Execute este SQL no SQL Editor do Supabase Dashboard.

-- =============================================================================
-- Part 1: Adicionar coluna assigned_to na tabela leads do schema correto
-- =============================================================================
-- A migration 001 criou assigned_to apenas em public.leads (schema abandonado).
-- A tabela "palmaslake-agno".leads nunca recebeu essa coluna.
-- Criamos a coluna e adicionamos FK para "palmaslake-agno".users.

ALTER TABLE "palmaslake-agno".leads
    ADD COLUMN IF NOT EXISTS assigned_to UUID;

ALTER TABLE "palmaslake-agno".leads
    DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;

ALTER TABLE "palmaslake-agno".leads
    ADD CONSTRAINT leads_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES "palmaslake-agno".users(id)
    ON DELETE SET NULL;

-- =============================================================================
-- Part 2: Adicionar colunas de vendedor na tabela users
-- =============================================================================

ALTER TABLE "palmaslake-agno".users
    ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

ALTER TABLE "palmaslake-agno".users
    ADD COLUMN IF NOT EXISTS is_seller BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "palmaslake-agno".users
    ADD COLUMN IF NOT EXISTS seller_active BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "palmaslake-agno".users
    ADD COLUMN IF NOT EXISTS seller_order INTEGER;

ALTER TABLE "palmaslake-agno".users
    ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;

COMMENT ON COLUMN "palmaslake-agno".users.whatsapp_number IS
    'Numero WhatsApp do vendedor para receber notificacoes de leads (formato: 55DDDNNNNNNNNN)';
COMMENT ON COLUMN "palmaslake-agno".users.is_seller IS
    'Se este usuario faz parte da equipe comercial de vendas';
COMMENT ON COLUMN "palmaslake-agno".users.seller_active IS
    'Se este vendedor esta ativo na rotacao da roleta';
COMMENT ON COLUMN "palmaslake-agno".users.seller_order IS
    'Posicao fixa na ordem de rotacao (1, 2, 3...). Controlada pelo admin.';
COMMENT ON COLUMN "palmaslake-agno".users.last_assigned_at IS
    'Timestamp do ultimo lead atribuido a este vendedor via roleta';

CREATE INDEX IF NOT EXISTS idx_users_seller_active
    ON "palmaslake-agno".users (seller_active, seller_order)
    WHERE is_seller = TRUE;

-- =============================================================================
-- Part 3: Tabela de estado da roleta (singleton - uma unica linha)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "palmaslake-agno".round_robin_state (
    id                  INTEGER PRIMARY KEY DEFAULT 1
                            CHECK (id = 1),
    current_seller_id   UUID REFERENCES "palmaslake-agno".users(id) ON DELETE SET NULL,
    total_assignments   INTEGER NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE "palmaslake-agno".round_robin_state IS
    'Tabela singleton que rastreia a posicao atual da roleta. id=1 sempre.';
COMMENT ON COLUMN "palmaslake-agno".round_robin_state.current_seller_id IS
    'Vendedor que recebeu a ULTIMA atribuicao. Proximo lead vai para o vendedor DEPOIS deste.';

-- Inserir a linha unica
INSERT INTO "palmaslake-agno".round_robin_state (id, current_seller_id, total_assignments)
VALUES (1, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Part 4: Tabela de log de atribuicoes (auditoria)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "palmaslake-agno".lead_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             UUID NOT NULL REFERENCES "palmaslake-agno".leads(id) ON DELETE CASCADE,
    seller_id           UUID REFERENCES "palmaslake-agno".users(id) ON DELETE SET NULL,
    seller_phone        TEXT,
    seller_name         TEXT,
    source              TEXT NOT NULL
                            CHECK (source IN ('round_robin', 'manual', 'fallback')),
    transfer_reason     TEXT,
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel             TEXT CHECK (channel IN ('whatsapp', 'instagram'))
);

COMMENT ON TABLE "palmaslake-agno".lead_assignments IS
    'Log imutavel de cada atribuicao de lead, seja via roleta, manual ou fallback.';

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id
    ON "palmaslake-agno".lead_assignments (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_seller_id
    ON "palmaslake-agno".lead_assignments (seller_id);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned_at
    ON "palmaslake-agno".lead_assignments (assigned_at DESC);

-- =============================================================================
-- Part 5: RLS policies
-- =============================================================================

ALTER TABLE "palmaslake-agno".round_robin_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE "palmaslake-agno".lead_assignments ENABLE ROW LEVEL SECURITY;

-- Permitir acesso via service_role key (como o backend usa)
DO $$ BEGIN
    CREATE POLICY "service_role_all_round_robin_state"
        ON "palmaslake-agno".round_robin_state
        FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "service_role_all_lead_assignments"
        ON "palmaslake-agno".lead_assignments
        FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Part 6: Stored procedure atomica para roleta
-- =============================================================================
-- Usa FOR UPDATE para serializar acessos concorrentes.
-- Chamada via PostgREST RPC: POST /rest/v1/rpc/assign_next_seller

CREATE OR REPLACE FUNCTION "palmaslake-agno".assign_next_seller(
    p_lead_id UUID,
    p_transfer_reason TEXT DEFAULT NULL,
    p_channel TEXT DEFAULT 'whatsapp'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_state         RECORD;
    v_next_seller   RECORD;
    v_seller_count  INTEGER;
    v_found_next    BOOLEAN := FALSE;
BEGIN
    -- 1. Lock a linha da roleta (previne race conditions entre Maria e Sofia)
    SELECT * INTO v_state
    FROM "palmaslake-agno".round_robin_state
    WHERE id = 1
    FOR UPDATE;

    -- 2. Contar vendedores ativos com WhatsApp configurado
    SELECT count(*) INTO v_seller_count
    FROM "palmaslake-agno".users
    WHERE is_seller = TRUE
      AND seller_active = TRUE
      AND whatsapp_number IS NOT NULL
      AND whatsapp_number <> '';

    -- Sem vendedores ativos: retornar sinal de fallback
    IF v_seller_count = 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'reason', 'no_active_sellers',
            'seller', NULL
        );
    END IF;

    -- 3. Encontrar proximo vendedor DEPOIS do current_seller_id
    -- Ordenado por seller_order ASC, created_at ASC como desempate
    IF v_state.current_seller_id IS NOT NULL THEN
        -- Tentar pegar o proximo na ordem DEPOIS do atual
        SELECT * INTO v_next_seller
        FROM "palmaslake-agno".users
        WHERE is_seller = TRUE
          AND seller_active = TRUE
          AND whatsapp_number IS NOT NULL
          AND whatsapp_number <> ''
          AND (
              seller_order > (
                  SELECT COALESCE(seller_order, 0)
                  FROM "palmaslake-agno".users
                  WHERE id = v_state.current_seller_id
              )
              OR (
                  seller_order = (
                      SELECT COALESCE(seller_order, 0)
                      FROM "palmaslake-agno".users
                      WHERE id = v_state.current_seller_id
                  )
                  AND created_at > (
                      SELECT created_at
                      FROM "palmaslake-agno".users
                      WHERE id = v_state.current_seller_id
                  )
              )
          )
        ORDER BY seller_order ASC NULLS LAST, created_at ASC
        LIMIT 1;

        IF v_next_seller.id IS NOT NULL THEN
            v_found_next := TRUE;
        END IF;
    END IF;

    -- 4. Se nao encontrou (wrap around ou primeira atribuicao), pegar o primeiro
    IF NOT v_found_next THEN
        SELECT * INTO v_next_seller
        FROM "palmaslake-agno".users
        WHERE is_seller = TRUE
          AND seller_active = TRUE
          AND whatsapp_number IS NOT NULL
          AND whatsapp_number <> ''
        ORDER BY seller_order ASC NULLS LAST, created_at ASC
        LIMIT 1;
    END IF;

    -- Seguranca: se ainda nao encontrou, retornar fallback
    IF v_next_seller.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'reason', 'no_active_sellers',
            'seller', NULL
        );
    END IF;

    -- 5. Atualizar ponteiro da roleta
    UPDATE "palmaslake-agno".round_robin_state
    SET current_seller_id = v_next_seller.id,
        total_assignments = total_assignments + 1,
        updated_at = now()
    WHERE id = 1;

    -- 6. Atualizar last_assigned_at do vendedor
    UPDATE "palmaslake-agno".users
    SET last_assigned_at = now()
    WHERE id = v_next_seller.id;

    -- 7. Atualizar assigned_to do lead
    UPDATE "palmaslake-agno".leads
    SET assigned_to = v_next_seller.id
    WHERE id = p_lead_id;

    -- 8. Registrar no log de auditoria
    INSERT INTO "palmaslake-agno".lead_assignments
        (lead_id, seller_id, seller_phone, seller_name, source, transfer_reason, channel)
    VALUES
        (p_lead_id, v_next_seller.id, v_next_seller.whatsapp_number,
         v_next_seller.full_name, 'round_robin', p_transfer_reason, p_channel);

    -- 9. Retornar dados do vendedor selecionado
    RETURN jsonb_build_object(
        'success', TRUE,
        'seller', jsonb_build_object(
            'id',               v_next_seller.id,
            'full_name',        v_next_seller.full_name,
            'whatsapp_number',  v_next_seller.whatsapp_number,
            'seller_order',     v_next_seller.seller_order
        ),
        'total_assignments', v_state.total_assignments + 1
    );
END;
$$;

COMMENT ON FUNCTION "palmaslake-agno".assign_next_seller IS
    'Avanca atomicamente o ponteiro da roleta e retorna o proximo vendedor. Usa FOR UPDATE para prevenir race conditions.';

-- Garantir que roles do Supabase podem chamar a funcao
GRANT EXECUTE ON FUNCTION "palmaslake-agno".assign_next_seller TO postgres, anon, authenticated, service_role;

-- =============================================================================
-- Part 7: Verificacao
-- =============================================================================

-- Para verificar que tudo foi criado:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'palmaslake-agno' AND table_name = 'users'
--   ORDER BY ordinal_position;
--
-- SELECT * FROM "palmaslake-agno".round_robin_state;
--
-- Para testar a funcao (sem vendedores ativos, deve retornar fallback):
-- SELECT "palmaslake-agno".assign_next_seller('00000000-0000-0000-0000-000000000000'::uuid);
