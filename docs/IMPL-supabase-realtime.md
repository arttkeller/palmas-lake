# Implementação Supabase Realtime

## Data: 2026-01-31

## Problema Resolvido
O sistema não atualizava em tempo real - leads, mensagens e status do kanban só apareciam após refresh manual.

## Causa Raiz
O código anterior usava `schema: 'public'` nas subscriptions do Supabase Realtime, mas os dados reais estão no schema `palmaslake-agno`.

## Solução Implementada

### 1. Schema Correto
Todas as subscriptions foram atualizadas para usar:
```typescript
schema: 'palmaslake-agno'
```

### 2. Arquivos Criados

#### `apps/web/hooks/useRealtimeSubscription.ts`
Hook customizado para gerenciar subscriptions do Supabase Realtime:
- Suporta múltiplas tabelas
- Auto-cleanup ao desmontar componente
- Logging detalhado para debug
- Usa schema correto por padrão

#### `apps/web/components/ui/realtime-status.tsx`
Componente de indicador visual de conexão:
- Mostra status: Conectando, Conectado, Desconectado, Erro
- Animação de ping quando conectando
- Cores semânticas (verde = online, vermelho = erro)

### 3. Arquivos Modificados

#### `apps/web/app/dashboard/chat/page.tsx`
- Schema atualizado para `palmaslake-agno`
- Removido polling de fallback (realtime agora funciona)
- Adicionado indicador de status no header
- Refatorado para usar `useCallback`

#### `apps/web/app/dashboard/quadro/page.tsx`
- Schema atualizado para `palmaslake-agno`
- Adicionado indicador de status no header
- Refatorado para usar `useCallback`

## Tabelas com Realtime Habilitado

As seguintes tabelas do schema `palmaslake-agno` estão na publicação `supabase_realtime`:
- `leads` - INSERT, UPDATE, DELETE (status, dados, remoção via #apagar)
- `conversations` - INSERT, UPDATE, DELETE
- `messages` - INSERT, UPDATE, DELETE

**Importante:** As tabelas precisam de `REPLICA IDENTITY FULL` para que eventos DELETE funcionem corretamente via Supabase Realtime. Ver migration `013_fix_realtime_delete_events.sql`.

## Broadcast Fallback para DELETE

Além do `postgres_changes`, o backend envia um broadcast explícito (`lead_deleted`) após deletar um lead via comando `#apagar`. O frontend escuta este broadcast como fallback caso o `postgres_changes` DELETE não funcione.

Canal: `realtime:lead-deletions` | Evento: `lead_deleted`

## Como Funciona

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Next.js    │──────▶│  Supabase   │◀──────│  FastAPI    │
│  Frontend   │  WS   │  Realtime   │ REST  │  Backend    │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     │
       └─────── Postgres NOTIFY ──────┘
```

1. FastAPI faz operações CRUD via REST API no Supabase
2. Supabase detecta mudanças no Postgres (NOTIFY)
3. Supabase Realtime envia updates via WebSocket
4. Frontend recebe e atualiza UI automaticamente

## Uso do Hook

```typescript
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

// Em qualquer componente:
useRealtimeSubscription({
    subscriptions: [
        { table: 'leads', event: '*' },
        { table: 'messages', event: 'INSERT' }
    ],
    onMessage: (payload) => {
        console.log('Mudança detectada:', payload);
        refetchData();
    }
});
```

## Verificação

Para verificar se está funcionando:
1. Abra o console do navegador (F12)
2. Procure por logs `[Realtime]`
3. Status `SUBSCRIBED` = funcionando
4. O indicador visual deve mostrar "Tempo Real" em verde
