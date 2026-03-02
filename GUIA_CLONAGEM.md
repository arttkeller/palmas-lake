# Guia de Clonagem e Adaptacao do Projeto

> Como clonar este sistema e adaptar para outra empresa, produto ou necessidade.

---

## Indice

1. [O que e este sistema](#1-o-que-e-este-sistema)
2. [Pre-requisitos](#2-pre-requisitos)
3. [Clonagem e Setup Inicial](#3-clonagem-e-setup-inicial)
4. [Configuracao do Supabase (Banco de Dados)](#4-configuracao-do-supabase-banco-de-dados)
5. [Variaveis de Ambiente](#5-variaveis-de-ambiente)
6. [Adaptacao do Schema do Banco](#6-adaptacao-do-schema-do-banco)
7. [Adaptacao da IA (Personalidade e Produto)](#7-adaptacao-da-ia-personalidade-e-produto)
8. [Adaptacao do Frontend (Branding e UI)](#8-adaptacao-do-frontend-branding-e-ui)
9. [Configuracao de Integracoes Externas](#9-configuracao-de-integracoes-externas)
10. [Deploy em Producao](#10-deploy-em-producao)
11. [Constantes Ajustaveis (Referencia Rapida)](#11-constantes-ajustaveis-referencia-rapida)
12. [Checklist Final](#12-checklist-final)

---

## 1. O que e este sistema

Um **CRM com Agente de IA** que atende leads automaticamente via WhatsApp e Instagram, qualifica-os, e transfere para um humano. O dashboard web permite gerenciar todo o pipeline de vendas.

### Arquitetura

```
                    WhatsApp (UazAPI)
                         |
Lead envia mensagem ---> API (FastAPI/Python) ---> IA (OpenAI via Agno)
                         |                              |
                    Instagram (Meta API)           Responde ao lead
                         |                              |
                    Supabase (PostgreSQL)          Salva no banco
                         |
                    Dashboard Web (Next.js/React)
```

### Estrutura do Monorepo

```
projeto/
├── apps/
│   ├── api/                 # Backend Python (FastAPI)
│   │   ├── main.py          # Entrada da API
│   │   ├── routers/         # Endpoints (webhook, leads, chat, analytics, events, users)
│   │   ├── services/        # Logica de negocio (IA, WhatsApp, Calendar, etc.)
│   │   ├── prompts/         # Prompts do agente IA (MARIA_SYSTEM.md, SOFIA_SYSTEM.md)
│   │   ├── requirements.txt # Dependencias Python
│   │   └── Dockerfile       # Container para deploy
│   │
│   └── web/                 # Frontend Next.js (React/TypeScript)
│       ├── app/             # Paginas (dashboard, login, etc.)
│       ├── components/      # Componentes UI
│       ├── services/        # Servicos frontend (agente, notificacoes, etc.)
│       ├── types/           # Tipos TypeScript
│       ├── lib/             # Utilitarios (Supabase client, status config, etc.)
│       └── public/          # Assets estaticos (logo, favicon)
│
├── database/
│   └── migrations/          # 18 arquivos SQL (executar em ordem)
│
├── start_dev.ps1            # Script para iniciar dev (Windows)
└── GUIA_CLONAGEM.md         # Este documento
```

### Funcionalidades

- **Agente IA multicanal**: Responde WhatsApp e Instagram DMs automaticamente
- **Qualificacao de leads**: Coleta nome, interesse, objetivo, prazo, regiao
- **Transferencia silenciosa**: Apos qualificacao, transfere para humano sem avisar o lead
- **Round-robin de vendedores**: Distribui leads qualificados entre vendedores ativos em rotacao
- **Deep link na transferencia**: Mensagem de transferencia inclui link direto para o lead no CRM
- **Notificacoes real-time**: Alerta o vendedor no CRM quando recebe um lead (toast + badge + historico)
- **Follow-up inteligente**: Leads com vendedor recebem notificacao de sugestao de follow-up (IA gera mensagem personalizada); leads sem vendedor recebem follow-up automatico por template
- **Auto-resolve**: Notificacoes saem de "pendente" quando vendedor envia primeira mensagem; timestamp salvo para calculo de SLA
- **CRM Kanban**: Pipeline visual (Novo Lead -> Transferido -> Visita Agendada -> ...)
- **Chat em tempo real**: Ver e responder conversas do dashboard
- **Agendamento de visitas**: Calendario com Google Calendar integrado
- **Follow-ups automaticos**: 3 estagios (2h, 24h, 48h) para leads inativos (sem vendedor)
- **Analytics**: Funil, sentimento, tempo de resposta, distribuicao de temperatura
- **Transcricao de audio**: Audio do WhatsApp transcrito via Groq Whisper
- **Analise de sentimento**: Classificacao automatica de humor do lead
- **IA Especialista no dashboard**: Assistente que responde perguntas sobre os leads

---

## 2. Pre-requisitos

### Software

| Ferramenta | Versao | Para que |
|------------|--------|----------|
| Node.js    | 18+    | Frontend (Next.js) |
| Python     | 3.11+  | Backend (FastAPI) |
| Git        | Qualquer | Controle de versao |
| ngrok      | Qualquer | Expor API local para webhooks (dev) |
| Docker     | Opcional | Deploy do backend |

### Contas necessarias

| Servico | Para que | Custo |
|---------|----------|-------|
| [Supabase](https://supabase.com) | Banco de dados + Auth + Realtime | Gratuito ate 500MB |
| [OpenAI](https://platform.openai.com) | Motor da IA (GPT) | Pago por uso |
| [UazAPI](https://uazapi.com) | Gateway WhatsApp | Pago |
| [Meta Developer](https://developers.facebook.com) | Instagram DMs | Gratuito |
| [Google Cloud](https://console.cloud.google.com) | Google Calendar | Gratuito |
| [Groq](https://groq.com) | Transcricao de audio (Whisper) | Gratuito ate X req/dia |
| [Sentry](https://sentry.io) | Monitoramento de erros (opcional) | Gratuito ate 5K eventos |

---

## 3. Clonagem e Setup Inicial

### 3.1 Clonar o repositorio

```bash
git clone <URL_DO_REPO> meu-projeto
cd meu-projeto
```

### 3.2 Setup do Backend (API)

```bash
cd apps/api

# Criar ambiente virtual Python
python -m venv venv

# Ativar (Windows)
./venv/Scripts/activate
# Ativar (Linux/Mac)
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Criar arquivo de ambiente
cp .env.example .env   # ou criar manualmente (ver secao 5)
```

### 3.3 Setup do Frontend (Web)

```bash
cd apps/web

# Instalar dependencias
npm install

# Criar arquivo de ambiente
# Criar apps/web/.env.local manualmente (ver secao 5)
```

### 3.4 Iniciar em desenvolvimento

```bash
# Terminal 1 - API
cd apps/api
./venv/Scripts/activate   # ou source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend
cd apps/web
npm run dev
```

Ou no Windows, usar o script `start_dev.ps1` na raiz.

O frontend roda em `http://localhost:3000` e a API em `http://localhost:8000`.

---

## 4. Configuracao do Supabase (Banco de Dados)

### 4.1 Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Anote a **URL do projeto** e as **chaves** (anon key e service_role key)
3. Va em **Settings > API** para encontrar essas informacoes

### 4.2 Criar o schema customizado

No **SQL Editor** do Supabase, antes de rodar as migrations:

```sql
-- Substitua 'minha-empresa' pelo nome do seu schema
CREATE SCHEMA IF NOT EXISTS "minha-empresa";
```

> **IMPORTANTE**: O nome do schema sera usado em dezenas de arquivos. Escolha algo simples, sem espacos. Exemplo: `minha-empresa`, `loja-xyz`, `construtora-abc`.

### 4.3 Executar as migrations

Execute cada arquivo SQL em ordem no **SQL Editor** do Supabase:

```
database/migrations/001_initial_schema.sql          # Tabelas base (leads, conversations, messages, events)
database/migrations/002_create_schema_access.sql    # Permissoes do schema
database/migrations/003_add_qualification_fields.sql # Campos de qualificacao
database/migrations/004_add_briefing_qualification_fields.sql
database/migrations/005_create_analytics_cache.sql  # Cache de analytics
database/migrations/006_add_lead_temperature_and_tags.sql
database/migrations/007_add_follow_up_fields.sql    # Follow-up automatico
database/migrations/008_add_anon_select_rls_policies.sql
database/migrations/008_fix_tags_column_type.sql
database/migrations/009_setup_follow_up_cron.sql    # ⚠️ ATUALIZAR URL (ver abaixo)
database/migrations/010_add_sentiment_columns.sql
database/migrations/011_add_instagram_id_column.sql
database/migrations/012_add_users_table.sql         # Tabela de usuarios do CRM
database/migrations/013_fix_realtime_delete_events.sql
database/migrations/014_isolate_auth_users_by_project.sql  # ⚠️ ATUALIZAR NOME DO PROJETO
database/migrations/015_add_event_reminder_1h_fields.sql
database/migrations/016_round_robin_assignments.sql   # Round-robin e lead_assignments
database/migrations/017_trigger_phone_after_insert.sql # Trigger para preencher phone em leads
database/migrations/018_notifications.sql              # Tabela de notificacoes + Realtime
```

> **ANTES DE EXECUTAR**: Abra cada arquivo e substitua `"palmaslake-agno"` pelo nome do seu schema.

### 4.4 Atualizar a migration 009 (cron job)

Na migration `009_setup_follow_up_cron.sql`, atualize a URL do cron job:

```sql
-- ANTES (original)
'https://api-palmas.blackai.dev/api/webhook/follow-up-cron'

-- DEPOIS (sua URL)
'https://SUA-API.dominio.com/api/webhook/follow-up-cron'
```

### 4.5 Atualizar a migration 014 (auth trigger)

Na migration `014_isolate_auth_users_by_project.sql`, atualize o nome do projeto:

```sql
-- ANTES
registration_project = 'palmaslake-agno'

-- DEPOIS
registration_project = 'minha-empresa'
```

### 4.6 Configurar Realtime

No Supabase Dashboard > **Database > Replication**:
- Habilite Realtime para as tabelas: `leads`, `messages`, `analytics_cache`, `follow_up_queue`, `notifications`

> **NOTA**: A migration `018_notifications.sql` ja executa `ALTER PUBLICATION supabase_realtime ADD TABLE` para `notifications`, mas confirme que esta ativo no dashboard.

### 4.7 Habilitar extensoes

No SQL Editor:

```sql
-- Necessario para o cron job de follow-ups
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### Tabelas criadas

| Tabela | Descricao |
|--------|-----------|
| `leads` | Leads do CRM (telefone, nome, status, temperatura, sentimento, etc.) |
| `conversations` | Conversas por lead por plataforma (WhatsApp/Instagram) |
| `messages` | Historico de mensagens (quem enviou, conteudo, metadata) |
| `events` | Eventos/visitas agendadas |
| `follow_up_queue` | Fila de follow-ups automaticos (3 estagios) |
| `analytics_cache` | Metricas pre-computadas do dashboard |
| `users` | Usuarios do CRM com roles (admin/user) e telefone |
| `round_robin_state` | Estado do round-robin (qual vendedor e o proximo) |
| `lead_assignments` | Historico de designacoes de leads a vendedores (com `responded_at` para SLA) |
| `notifications` | Notificacoes real-time para vendedores (transferencia e follow-up) |

---

## 5. Variaveis de Ambiente

### API (`apps/api/.env`)

```env
# === OBRIGATORIAS ===

# Supabase
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...  # Service Role Key (nao a anon key!)

# OpenAI (motor da IA)
OPENAI_API_KEY=sk-proj-...

# WhatsApp + Instagram (Meta Cloud API oficial)
META_ACCESS_TOKEN=EAAxxxxxxx  # System User Token (permanente)
META_PHONE_NUMBER_ID=123456789  # ID do numero de telefone no Meta Business
META_APP_SECRET=abc123  # App Secret para verificacao HMAC do webhook
META_VERIFY_TOKEN=seu-token-de-verificacao  # Token para challenge do webhook

# === OPCIONAIS ===

# Instagram (Meta)
META_PAGE_ID=123456789  # ID da pagina do Facebook (auto-detectado se omitido)
META_INSTAGRAM_ID=123456789  # Instagram Business Account ID (auto-detectado se omitido)

# Templates de follow-up (nomes dos templates aprovados no Meta Business)
WA_TEMPLATE_FOLLOWUP_24H=followup_24h  # Template para follow-up de 24h (fora da janela)
WA_TEMPLATE_FOLLOWUP_48H=followup_48h  # Template para follow-up de 48h (fora da janela)

# Transcricao de audio (Groq)
GROQ_API_KEY=gsk_...
GROQ_AUDIO_MODEL=whisper-large-v3-turbo  # padrao

# Monitoramento (Sentry)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=production

# URL do frontend (usada nos deep links de transferencia)
FRONTEND_URL=https://SEU-FRONTEND.vercel.app  # ou http://localhost:3000 em dev

# CORS (default: aceita tudo)
CORS_ORIGINS=https://meu-frontend.vercel.app,http://localhost:3000

# Modo debug (nao setar em producao)
ENVIRONMENT=development  # ou production
```

### Frontend (`apps/web/.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...  # Anon Key (publica)

# API Backend
NEXT_PUBLIC_API_URL=http://localhost:8000  # Em dev; em prod, a URL publica da API

# Projeto de autenticacao (deve coincidir com o nome do schema)
NEXT_PUBLIC_AUTH_REGISTRATION_PROJECT=minha-empresa

# Sentry (opcional)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# WhatsApp/Meta (nao necessario no frontend — API eh backend-only)
```

---

## 6. Adaptacao do Schema do Banco

O nome do schema esta hardcoded em muitos arquivos. Voce precisa substituir `"palmaslake-agno"` pelo nome do seu schema em TODOS estes locais:

### Backend (Python)

| Arquivo | O que mudar |
|---------|-------------|
| `apps/api/services/supabase_client.py` | Linhas 21-22: `"Accept-Profile"` e `"Content-Profile"` |

```python
# ANTES
"Accept-Profile": "palmaslake-agno",
"Content-Profile": "palmaslake-agno"

# DEPOIS
"Accept-Profile": "minha-empresa",
"Content-Profile": "minha-empresa"
```

### Frontend (TypeScript)

Todos estes arquivos tem `const SCHEMA = 'palmaslake-agno'` que precisa ser atualizado:

| Arquivo | Linha aprox. |
|---------|-------------|
| `apps/web/app/dashboard/leads/page.tsx` | ~166 |
| `apps/web/app/dashboard/quadro/page.tsx` | ~212 |
| `apps/web/app/dashboard/chat/page.tsx` | ~69 |
| `apps/web/app/dashboard/agendamentos/page.tsx` | ~13 |
| `apps/web/components/LeadModal.tsx` | ~536 |
| `apps/web/services/maria-agent/lead-service.ts` | ~24 |
| `apps/web/services/maria-agent/visit-service.ts` | ~19 |
| `apps/web/hooks/useAnalyticsCache.ts` | ~16 |
| `apps/web/hooks/useRealtimeSubscription.ts` | ~8 |
| `apps/web/hooks/useNotifications.ts` | ~7 |
| `apps/web/components/NotificationProvider.tsx` | ~10 |

> **DICA**: Use busca global no seu editor por `palmaslake-agno` e substitua tudo pelo seu schema.

Tambem ha 2 arquivos com a variante `palmas_lake` (sem hifen):

| Arquivo | Linha aprox. |
|---------|-------------|
| `apps/web/hooks/useLeadTags.ts` | ~10 |
| `apps/web/services/ai-analysis/classification-history.ts` | ~16 |

### Variavel de ambiente

Atualize tambem `NEXT_PUBLIC_AUTH_REGISTRATION_PROJECT` no `.env.local` para coincidir com o nome do schema.

---

## 7. Adaptacao da IA (Personalidade e Produto)

Esta e a parte mais importante. Aqui voce transforma a "Maria do Palmas Lake" no agente da sua empresa.

### 7.1 Prompt principal — `apps/api/prompts/MARIA_SYSTEM.md`

Este arquivo e o "cerebro" da IA. Ele define:

| Secao | O que faz | O que adaptar |
|-------|-----------|---------------|
| `<identity>` | Nome e personalidade do agente | Trocar "Maria" pelo nome do seu agente, mudar tom de voz |
| `<tools_system>` | Tools disponiveis para a IA | Geralmente manter igual |
| `<security>` | Regras de identidade (nunca dizer "sou IA") | Manter igual |
| `<interest_type_mapping>` | Mapeamento de tipos de produto | Trocar pelos seus produtos |
| `<qualification_flow>` | 5 perguntas de qualificacao | Adaptar perguntas ao seu negocio |
| `<tower_presentation_flow>` | Apresentacao dos produtos | Reescrever com seus produtos |
| `<project_info>` | Catalogo completo (preco, area, amenidades) | Substituir inteiro pelo seu catalogo |
| `<response_rules>` | Regras de formatacao de resposta | Geralmente manter |
| `<objection_handling>` | Respostas para objecoes comuns | Adaptar ao seu produto |
| `<financial_policy>` | Politica sobre precos | Adaptar (revelar ou nao precos?) |
| `<followup_rules>` | Regras de follow-up | Ajustar timings se necessario |
| `<conversation_states>` | Maquina de estados da conversa | Adaptar fluxo ao seu funil |
| `<validation_checklist>` | Checklist que a IA valida antes de responder | Adaptar |

**Exemplo** — Mudar de imobiliaria para loja de carros:

```markdown
<!-- ANTES (imobiliaria) -->
<qualification_flow>
  1. Nome
  2. Tipo de interesse (apartamento, sala comercial, flat)
  3. Objetivo (morar, investir)
  4. Prazo de compra
  5. Regiao de interesse
</qualification_flow>

<!-- DEPOIS (loja de carros) -->
<qualification_flow>
  1. Nome
  2. Tipo de veiculo (sedan, SUV, hatch, pickup)
  3. Novo ou usado
  4. Faixa de preco
  5. Forma de pagamento (financiamento, a vista, consorcio)
</qualification_flow>
```

### 7.2 Prompt secundario — `apps/api/prompts/SOFIA_SYSTEM.md`

Se voce tiver **apenas 1 agente**, pode ignorar este arquivo. Ele e usado para um segundo empreendimento. Se tiver multiplos produtos, duplique e adapte.

### 7.3 Tools da IA — `apps/api/services/maria_tools.py`

Pontos que DEVEM ser alterados:

```python
# Linha ~702 — Numero do gerente que recebe transferencias (fallback quando nao ha vendedores)
GERENTE_PHONE = "5527998724593"  # TROCAR pelo numero do seu gerente

# Dentro de transferir_para_humano() — Template da mensagem de transferencia
# A funcao agora usa round-robin para distribuir leads entre vendedores ativos
# e inclui deep link para o CRM na mensagem de WhatsApp.
# Adaptar o template com os campos relevantes do seu negocio.
```

A funcao `transferir_para_humano()` agora:
1. **Round-robin**: Usa `assign_next_seller()` para designar o lead ao proximo vendedor ativo
2. **Deep link**: Adiciona URL `FRONTEND_URL/dashboard/quadro?leadId=...` na mensagem
3. **Notificacao CRM**: Insere registro na tabela `notifications` para o vendedor ver no dashboard
4. **Fallback**: Se nao houver vendedores, envia para `GERENTE_PHONE`

Se tiver carrossel de imagens:
```python
# Dentro de enviar_carrossel() — URLs das imagens e textos
# Trocar pelas imagens e descricoes dos seus produtos
```

### 7.7 Servico de follow-up inteligente — `apps/api/services/follow_up_suggestion.py`

Este servico gera sugestoes personalizadas de follow-up usando GPT-4o-mini. E usado quando um lead ja tem vendedor designado — em vez de enviar template automatico, cria notificacao com sugestao personalizada.

```python
# O prompt interno referencia o produto. Adaptar se necessario:
# "assistente de vendas de um empreendimento imobiliario de alto padrao"
# Trocar pela descricao do seu negocio
```

### 7.8 Round-robin de vendedores — `apps/api/services/round_robin_service.py`

O servico distribui leads qualificados entre vendedores com `role = 'user'` e `active = true`. Nao precisa de adaptacao — funciona automaticamente com qualquer numero de vendedores cadastrados na tabela `users`.

### 7.4 Modelos de IA — `apps/api/services/agent_manager.py`

```python
# Modelo principal do agente (~linha 550)
model=OpenAIChat(
    id="gpt-5.2",                    # Modelo OpenAI (trocar se quiser outro)
    reasoning_effort="medium",        # low/medium/high (afeta custo e qualidade)
    max_completion_tokens=2048,       # Tamanho maximo da resposta
    request_params={"timeout": 60}    # Timeout em segundos
)

# Modelo de analise de sentimento (~linha 645)
model=OpenAIChat(
    id="gpt-5-mini",                 # Modelo mais barato para sentimento
    reasoning_effort="medium",
    max_completion_tokens=1000,
    request_params={"timeout": 30}
)
```

**Opcoes de modelo**: `gpt-4o`, `gpt-4o-mini`, `gpt-5.2`, `gpt-5-mini`, etc.
Modelos mais baratos = menos custo por lead, mas respostas potencialmente piores.

### 7.5 Templates de follow-up — `apps/api/services/follow_up_templates.py`

5 templates por estagio. Cada template recebe `{name_part}` (primeiro nome do lead).

```python
# Exemplo original (imobiliaria)
"Oi{name_part}! Tudo bem? Vi que voce demonstrou interesse no Palmas Lake..."

# Exemplo adaptado (loja de carros)
"Oi{name_part}! Tudo bem? Vi que voce demonstrou interesse em nossos veiculos..."
```

### 7.6 Mapeamento de interesse — `apps/api/services/maria_tools.py`

Dentro de `atualizar_interesse()`, ha normalizacao de tipos de produto:

```python
# ANTES (imobiliario)
interest_map = {
    "apartamento": "apartamento",
    "sala_comercial": "sala_comercial",
    "office": "office",
    "flat": "flat",
    "cobertura": "apartamento",  # mapeia para apartamento
}

# DEPOIS (seu negocio) — adaptar os tipos
interest_map = {
    "sedan": "sedan",
    "suv": "suv",
    "hatch": "hatch",
    "pickup": "pickup",
    "caminhonete": "pickup",  # alias
}
```

---

## 8. Adaptacao do Frontend (Branding e UI)

### 8.1 Logo e favicon

Substitua estes arquivos:

```
apps/web/public/logo.png     # Logo da empresa (recomendado: 400x100px transparente)
apps/web/public/favicon.png   # Favicon (32x32 ou 64x64)
```

Atualize o alt text em `apps/web/components/ui/animated-characters-login-page.tsx`:
```tsx
// ANTES
<Image src="/logo.png" alt="Palmas Lake" .../>

// DEPOIS
<Image src="/logo.png" alt="Minha Empresa" .../>
```

### 8.2 Titulo e descricao

Arquivo: `apps/web/app/layout.tsx`

```tsx
// ANTES
title: "Palmas Lake CRM",
description: "Sistema de CRM Palmas Lake",

// DEPOIS
title: "Minha Empresa CRM",
description: "Sistema de CRM Minha Empresa",
```

### 8.3 Cores (tema)

Arquivo: `apps/web/app/globals.css`

As cores estao definidas como CSS custom properties no formato OKLCH. Altere os valores principais:

```css
:root {
  --primary: oklch(0.5500 0.2041 277.1173);    /* Azul-roxo — cor principal */
  --background: oklch(0.9232 0.0026 48.7171);  /* Off-white quente — fundo */
  --accent: oklch(0.9376 0.0260 321.9388);     /* Rosa — destaque */
  --secondary: oklch(0.8687 0.0043 56.3660);   /* Bege — secundaria */
  --destructive: oklch(0.6368 0.2078 25.3313); /* Vermelho — erros/alertas */
}
```

> **DICA**: Use [oklch.com](https://oklch.com) para converter cores HEX para OKLCH.

### 8.4 Fontes

No mesmo `globals.css`, as fontes importadas do Google Fonts:

```css
/* ANTES (luxo imobiliario) */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&...');
@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;500;600;700&...');

/* DEPOIS — trocar pelas fontes da sua marca */
@import url('https://fonts.googleapis.com/css2?family=SUA-FONTE-DISPLAY&...');
@import url('https://fonts.googleapis.com/css2?family=SUA-FONTE-BODY&...');
```

E atualize as variaveis:
```css
--font-display: 'Cinzel', serif;       /* -> sua fonte de display */
--font-body: 'Josefin Sans', sans-serif; /* -> sua fonte de corpo */
```

### 8.5 Catalogo de produto (frontend)

Arquivo: `apps/web/services/maria-agent/property-info-service.ts`

Este arquivo contem TODO o catalogo hardcoded (torres, precos, amenidades, diferenciais). Reescreva inteiro com seus produtos.

### 8.6 Textos hardcoded (busca global recomendada)

Faca uma busca global por estes termos e substitua:

| Termo | Onde aparece | Substituir por |
|-------|-------------|----------------|
| `"Palmas Lake"` | layout.tsx, login, notification-service, visit-service | Nome da sua empresa |
| `"Maria"` | agent-service.ts, agendamentos/page.tsx | Nome do seu agente |
| `"Orla 14"` | qualification-service, property-info, agent-service | Sua localizacao |
| `"27998724593"` | notification-service.ts | WhatsApp do gerente |
| `"arthur_keller11@hotmail.com"` | notification-service.ts | Email do gerente |
| `"Stand de Vendas"` | visit-service.ts, property-info-service.ts | Seu ponto de atendimento |

### 8.7 Tipos TypeScript

Arquivo: `apps/web/types/maria-agent.ts`

```typescript
// Renomear tipos especificos do produto
export type PropertyType = 'apto_sky' | 'apto_garden' | ...  // -> seus tipos de produto
export type PreferredTower = 'sky' | 'garden' | 'park' | ... // -> suas opcoes

// Renomear interfaces (opcional, mas recomendado)
export interface PalmasLakeLead { ... }  // -> MeuProjetoLead
```

Arquivo: `apps/web/types/lead.ts`

```typescript
export type InterestType = 'apartamento' | 'sala_comercial' | 'office' | 'flat' | 'loft';
// -> seus tipos de produto

export type Objective = 'morar' | 'investir' | 'morar_investir';
// -> seus objetivos de compra
```

### 8.8 Colunas do Kanban

Arquivo: `apps/web/app/dashboard/quadro/page.tsx`

Se quiser mudar os estagios do pipeline:

```typescript
const initialColumns: Column[] = [
  { id: 'novo_lead',       title: 'Novo Lead',       color: 'bg-blue-500', ... },
  { id: 'transferido',     title: 'Transferido',     color: 'bg-amber-500', ... },
  { id: 'visita_agendada', title: 'Visita Agendada', color: 'bg-violet-500', ... },
  // ... adaptar titulos e cores
];
```

> Lembre-se: se mudar os IDs das colunas, precisa atualizar tambem `lib/status-config.ts`, `types/lead.ts`, `lead-service.ts` e o schema do banco.

### 8.9 Notificacoes e Alertas

Novos componentes do sistema de notificacoes:

| Componente | Arquivo | Funcao |
|-----------|---------|--------|
| `useNotifications` | `apps/web/hooks/useNotifications.ts` | Hook com fetch + realtime (INSERT/UPDATE) |
| `NotificationProvider` | `apps/web/components/NotificationProvider.tsx` | Toast popups via sonner |
| `NavBarWithBadges` | `apps/web/components/NavBarWithBadges.tsx` | Badge de pendentes na nav |
| `BellIcon` | `apps/web/components/icons/bell.tsx` | Icone animado do sininho |
| Pagina de Alertas | `apps/web/app/dashboard/notificacoes/page.tsx` | Historico de notificacoes |
| Nav config | `apps/web/lib/navigation-config.ts` | Item "Alertas" no menu |

Estes componentes nao precisam de adaptacao — funcionam automaticamente com qualquer schema desde que o `SCHEMA` esteja correto em `useNotifications.ts` e `NotificationProvider.tsx`.

### 8.10 Sentry (monitoramento)

Arquivo: `apps/web/next.config.ts`

```typescript
// ANTES
org: "blackai",
project: "javascript-nextjs",

// DEPOIS
org: "sua-org-sentry",
project: "seu-projeto-sentry",
```

### 8.11 Supabase hostname (imagens)

No mesmo `next.config.ts`, atualize o hostname do Supabase Storage:

```typescript
// ANTES
hostname: 'bokdkbgrtaarlqzxjcgm.supabase.co'

// DEPOIS
hostname: 'SEU-PROJETO.supabase.co'
```

---

## 9. Configuracao de Integracoes Externas

### 9.1 WhatsApp (UazAPI)

1. **Criar app** no [Meta Developer Portal](https://developers.facebook.com)
2. **Adicionar produto** "WhatsApp" ao app
3. **Configurar numero de telefone** no Meta Business Manager
4. **Configurar webhook WhatsApp**:
   - URL de callback: `https://SUA-API.dominio.com/api/webhook/whatsapp`
   - Token de verificacao: qualquer string (anotar como `META_VERIFY_TOKEN`)
   - Campos: `messages`
5. **Obter credenciais**:
   - System User Token (permanente) → `META_ACCESS_TOKEN`
   - Phone Number ID → `META_PHONE_NUMBER_ID`
   - App Secret → `META_APP_SECRET`

### 9.2 Instagram DMs (Meta)

1. **No mesmo app** do Meta Developer Portal
2. **Adicionar produto** "Messenger" ao app
3. **Configurar webhook Instagram**:
   - URL de callback: `https://SUA-API.dominio.com/api/webhook/meta`
   - Token de verificacao: mesmo `META_VERIFY_TOKEN`
   - Campos: `messages`, `messaging_postbacks`
4. **Obter IDs adicionais**:
   - Page ID → `META_PAGE_ID`
   - Instagram Business Account ID → `META_INSTAGRAM_ID`
5. **Conectar pagina** do Facebook/Instagram ao app

### 9.3 Google Calendar

1. **Criar Service Account** no [Google Cloud Console](https://console.cloud.google.com):
   - APIs & Services > Credentials > Create Credentials > Service Account
   - Habilitar "Google Calendar API"
2. **Baixar JSON** da chave e salvar como `apps/api/credentials.json`
3. **Compartilhar calendario** com o email do Service Account (ex: `minha-sa@projeto.iam.gserviceaccount.com`)
4. No Service Account, dar permissao de "Make changes to events"

### 9.4 Groq (transcricao de audio)

1. Criar conta em [groq.com](https://groq.com)
2. Gerar API key
3. Setar `GROQ_API_KEY` no `.env`

### 9.5 Sentry (monitoramento de erros)

1. Criar projeto em [sentry.io](https://sentry.io)
2. Obter DSN do projeto
3. Setar `SENTRY_DSN` no backend e `NEXT_PUBLIC_SENTRY_DSN` no frontend

---

## 10. Deploy em Producao

### 10.1 Backend (API)

O projeto ja tem um `Dockerfile` pronto. Opcoes de deploy:

**Railway / Render / Fly.io:**
1. Conectar o repositorio
2. Configurar variaveis de ambiente (secao 5)
3. Deploy automatico a cada push

**VPS (manual):**
```bash
cd apps/api
docker build -t minha-api .
docker run -d -p 8000:8000 --env-file .env minha-api
```

**Dockerfile existente** (`apps/api/Dockerfile`):
- Base: Python 3.11-slim
- Porta: 8000
- Comando: `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1`

### 10.2 Frontend (Web)

**Vercel (recomendado para Next.js):**
1. Conectar repositorio no [Vercel](https://vercel.com)
2. Root directory: `apps/web`
3. Framework preset: Next.js
4. Configurar variaveis de ambiente (secao 5)

**Outros:**
```bash
cd apps/web
npm run build
npm start
```

### 10.3 Pos-deploy — URLs para atualizar

Apos obter as URLs publicas da API e frontend:

| Local | O que atualizar |
|-------|----------------|
| `apps/web/.env.local` | `NEXT_PUBLIC_API_URL=https://SUA-API.dominio.com` |
| `apps/api/.env` | `CORS_ORIGINS=https://SEU-FRONTEND.vercel.app` |
| `apps/api/.env` | `FRONTEND_URL=https://SEU-FRONTEND.vercel.app` (para deep links na transferencia) |
| UazAPI Dashboard | Webhook URL: `https://SUA-API.dominio.com/api/webhook/uazapi` |
| Meta Developer | Webhook URL: `https://SUA-API.dominio.com/api/webhook/meta` |
| Migration 009 (SQL) | URL do cron: `https://SUA-API.dominio.com/api/webhook/follow-up-cron` |
| `apps/web/next.config.ts` | Hostname do Supabase em `images.remotePatterns` |
| `apps/api/main.py` | Titulo da API (cosmetic): `title="Minha Empresa Agent API"` |

---

## 11. Constantes Ajustaveis (Referencia Rapida)

Valores que voce pode ajustar sem reescrever logica:

| Constante | Arquivo | Valor padrao | O que faz |
|-----------|---------|-------------|-----------|
| `BUFFER_DELAY` | `apps/api/services/buffer_service.py` | `35.0` (seg) | Tempo de silencio antes de processar mensagens em batch |
| `STAGE_CONFIG[1].delay_hours` | `apps/api/services/follow_up_service.py` | `2` (horas) | Tempo ate 1o follow-up |
| `STAGE_CONFIG[2].delay_hours` | `apps/api/services/follow_up_service.py` | `24` (horas) | Tempo ate 2o follow-up |
| `STAGE_CONFIG[3].delay_hours` | `apps/api/services/follow_up_service.py` | `48` (horas) | Tempo ate 3o follow-up |
| `BUSINESS_HOUR_START` | `apps/api/services/follow_up_service.py` | `9` (9h) | Inicio do horario comercial |
| `BUSINESS_HOUR_END` | `apps/api/services/follow_up_service.py` | `19` (19h) | Fim do horario comercial |
| `_agent_semaphore` | `apps/api/services/agent_manager.py` | `10` | Max agentes IA rodando simultaneamente |
| `max_workers` | `apps/api/main.py` | `50` | Thread pool para chamadas OpenAI |
| `max_completion_tokens` | `apps/api/services/agent_manager.py` | `2048` | Tamanho maximo da resposta da IA |
| `timeout` | `apps/api/services/agent_manager.py` | `60` (seg) | Timeout da chamada OpenAI |
| `HOT_SCORE_THRESHOLD` | `apps/api/services/temperature_service.py` | `0.6` | Score minimo para lead "quente" |
| `WARM_SCORE_THRESHOLD` | `apps/api/services/temperature_service.py` | `0.2` | Score minimo para lead "morno" |
| `INACTIVITY_THRESHOLD_HOURS` | `apps/api/services/temperature_service.py` | `24` (horas) | Horas sem interacao = lead esfria |
| `_DEDUP_TTL` | `apps/api/services/buffer_service.py` | `120` (seg) | Tempo para ignorar mensagens duplicadas |
| Horarios de agenda | `apps/api/services/calendar_service.py` | `[9,10,11,14,15,16,17,18]` | Slots disponiveis para agendamento |
| `FRONTEND_URL` | `apps/api/.env` | `http://localhost:3000` | URL do frontend (deep links na transferencia) |
| `GERENTE_PHONE` | `apps/api/services/maria_tools.py` | `5527998724593` | WhatsApp fallback quando nao ha vendedores |

---

## 12. Checklist Final

Apos completar todas as adaptacoes, verifique cada item:

### Infraestrutura
- [ ] Projeto Supabase criado
- [ ] Todas as 18 migrations executadas com o novo nome de schema
- [ ] Realtime habilitado para `leads`, `messages`, `analytics_cache`, `follow_up_queue`, `notifications`
- [ ] Extensoes `pg_cron` e `pg_net` habilitadas
- [ ] Variaveis de ambiente configuradas (API e Web), incluindo `FRONTEND_URL`

### Schema do banco
- [ ] `supabase_client.py` atualizado com novo schema
- [ ] Todos os `const SCHEMA = '...'` no frontend atualizados (11+ arquivos, incluindo `useNotifications.ts` e `NotificationProvider.tsx`)
- [ ] `NEXT_PUBLIC_AUTH_REGISTRATION_PROJECT` atualizado

### IA e produto
- [ ] `MARIA_SYSTEM.md` reescrito para o novo produto/empresa
- [ ] `GERENTE_PHONE` atualizado em `maria_tools.py` (e `sofia_tools.py` se usar)
- [ ] Templates de follow-up atualizados (`follow_up_templates.py`)
- [ ] Prompt de follow-up inteligente adaptado (`follow_up_suggestion.py`)
- [ ] Mapeamento de tipos de interesse atualizado
- [ ] Modelo de IA escolhido (custo vs qualidade)

### Branding
- [ ] Logo substituido (`public/logo.png` e `favicon.png`)
- [ ] Titulo e descricao atualizados (`layout.tsx`)
- [ ] Cores atualizadas (`globals.css`)
- [ ] Fontes atualizadas (`globals.css`)
- [ ] Textos "Palmas Lake", "Maria", "Orla 14" substituidos
- [ ] Catalogo de produto reescrito (`property-info-service.ts`)
- [ ] Tipos TypeScript atualizados (`types/lead.ts`, `types/maria-agent.ts`)

### Integracoes
- [ ] WhatsApp (UazAPI) conectado e webhook configurado
- [ ] Instagram (Meta) app criado e webhook configurado (se usar)
- [ ] Google Calendar service account criado e `credentials.json` no lugar
- [ ] Groq API key configurada (se quiser transcricao de audio)
- [ ] Sentry configurado (se quiser monitoramento)

### Testes de funcionamento
- [ ] Enviar mensagem no WhatsApp → IA responde
- [ ] Completar qualificacao → Lead aparece como "Transferido" no Kanban
- [ ] Transferencia → Resumo chega no WhatsApp do vendedor (round-robin) com deep link
- [ ] Deep link → Clicar abre o CRM no modal do lead (logado: direto; deslogado: login → redirect)
- [ ] Notificacao → Toast aparece no CRM do vendedor em tempo real
- [ ] Badge → Sininho na nav mostra contagem de pendentes
- [ ] Historico → Pagina /dashboard/notificacoes mostra todas as notificacoes
- [ ] Auto-resolve → Enviar mensagem pelo CRM marca notificacoes como "respondido"
- [ ] Follow-up inteligente → Lead com vendedor gera notificacao de sugestao (nao envia template automatico)
- [ ] Dashboard acessivel e mostrando leads em tempo real
- [ ] Follow-ups sendo agendados (verificar tabela `follow_up_queue`)
- [ ] Chat do dashboard permite enviar mensagem manual
- [ ] Criar usuario admin pelo Supabase Auth
- [ ] Login no dashboard funciona

### Deploy
- [ ] API rodando em producao
- [ ] Frontend rodando em producao
- [ ] URLs de webhook atualizadas (UazAPI, Meta, cron job)
- [ ] CORS configurado para o dominio do frontend
- [ ] `ENVIRONMENT=production` setado na API

---

## Dicas Extras

### Como adicionar um novo agente (segundo produto)

1. Copie `apps/api/prompts/MARIA_SYSTEM.md` → `NOVO_AGENTE_SYSTEM.md`
2. Copie `apps/api/services/maria_tools.py` → `novo_agente_tools.py`
3. Em `agent_manager.py`, adicione logica para escolher qual agente usar (por numero de WhatsApp, por exemplo)
4. Adapte o prompt e tools para o novo produto

### Como mudar o fluxo de qualificacao

O fluxo de qualificacao e definido em 2 lugares:
1. **Prompt da IA** (`MARIA_SYSTEM.md` > `<qualification_flow>`) — o que a IA pergunta
2. **Frontend** (`apps/web/services/maria-agent/qualification-service.ts`) — maquina de estados no frontend

Ambos precisam ser atualizados de forma consistente.

### Como alterar o pipeline de status (Kanban)

Se quiser mudar os estagios do funil (ex: adicionar "Negociacao"), precisa atualizar:
1. `apps/web/lib/status-config.ts` — adicionar o novo status
2. `apps/web/types/lead.ts` — adicionar ao tipo `LeadStatus`
3. `apps/web/app/dashboard/quadro/page.tsx` — adicionar a coluna
4. `apps/web/services/maria-agent/lead-service.ts` — adicionar transicoes validas
5. `apps/api/services/follow_up_service.py` — decidir se skip follow-ups para esse status
6. `apps/api/services/analytics_computations.py` — adicionar ao funil

### Deep link e auth redirect

O sistema preserva deep links durante o fluxo de login:
1. Vendedor clica link `https://SEU-FRONTEND/dashboard/quadro?leadId=UUID` no WhatsApp
2. Se nao estiver logado, `middleware.ts` redireciona para `/?next=%2Fdashboard%2Fquadro%3FleadId%3DUUID`
3. Apos login, `animated-characters-login-page.tsx` le o parametro `next` e redireciona para a URL original
4. O modal do lead abre automaticamente

Nao precisa de adaptacao — funciona automaticamente.

### Seguranca

- **NUNCA** commite credenciais (`.env`, `credentials.json`) no repositorio
- Use `.gitignore` para excluir esses arquivos
- A `SUPABASE_KEY` do backend deve ser a **Service Role Key** (acesso total)
- A `NEXT_PUBLIC_SUPABASE_ANON_KEY` do frontend e a **Anon Key** (acesso limitado por RLS)
- Configure CORS para aceitar apenas seu dominio em producao

---

*Documento gerado para o projeto CRM + Agente IA. Ultima atualizacao: 25 Fevereiro 2026.*
