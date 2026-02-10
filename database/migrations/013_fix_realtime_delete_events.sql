-- Migration: Habilitar eventos DELETE no Supabase Realtime
-- Problema: O comando #apagar deleta leads mas a UI nao atualiza em tempo real.
-- Causa: Falta REPLICA IDENTITY FULL e/ou tabelas nao estao na publicacao supabase_realtime.

-- 1. Garantir REPLICA IDENTITY FULL para eventos DELETE no Supabase Realtime
-- Sem isso, o PostgreSQL nao emite dados suficientes no WAL para DELETE events.
ALTER TABLE "palmaslake-agno".leads REPLICA IDENTITY FULL;
ALTER TABLE "palmaslake-agno".conversations REPLICA IDENTITY FULL;
ALTER TABLE "palmaslake-agno".messages REPLICA IDENTITY FULL;

-- 2. Garantir que tabelas estao na publicacao supabase_realtime
-- Usa DO block para evitar erro se a tabela ja estiver na publicacao.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "palmaslake-agno".leads;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "palmaslake-agno".conversations;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "palmaslake-agno".messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
