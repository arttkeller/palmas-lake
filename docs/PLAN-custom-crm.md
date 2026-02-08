
# 🏗️ PLAN: User-Owned CRM & Messaging Platform

## 🎯 Goal
Build a proprietary **CRM and Messaging Application** to manage "Palmas Lake" leads.
This system replaces ClickUp, providing a tailored "Real Estate Sales" experience where AI agents and human sales reps collaborate in real-time.

**Core Value Proposition:**
- **Unified Logic:** Chat and Lead Management in one screen.
- **AI-Native:** The AI Agent is a "first-class citizen" in the chat interface.
- **Ownership:** No per-seat limits or external dependency on ClickUp.

---

## 🏗️ Architecture

### 1. The Stack
| Component | Tech Choice | Purpose |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 14** (App Router) | React framework for the Dashboard & Chat UI. |
| **Styling** | **TailwindCSS v4** | Modern styling with HSL variables for dark mode. |
| **Backend** | **FastAPI** (Python) | High-performance API for Agent logic & Meta Webhooks. |
| **Data Analysis** | **Pandas** | Conversation metrics, sentiment analysis, and reporting. |
| **AI Framework** | **Agno** (Python) | Orchestrates the AI implementation (Tools, Memory). |
| **Database** | **Supabase** (Postgres) | relational DB for Leads and Messages. |
| **Realtime** | **Supabase Realtime** | WebSockets for instant message delivery to UI. |
| **Auth** | **Supabase Auth** | Secure login for Sales Reps and Admins. |

### 2. Database Schema (Supabase)
*   **users**: `id`, `email`, `role` (admin/agent).
*   **leads**: `id`, `name`, `phone`, `status` (new/visit_scheduled/sold), `assigned_to` (user_id).
*   **conversations**: `id`, `lead_id`, `platform` (whatsapp/instagram).
*   **messages**: `id`, `conversation_id`, `sender` (user/ai/lead), `content`, `type` (text/image/audio), `metadata` (json for media urls).

---

## 📋 Task Breakdown

### Phase 1: Foundation 🧱
- [ ] **Setup Monorepo Structure**: `apps/web` (Next.js) and `apps/api` (FastAPI).
- [ ] **Database Init**: Create Supabase project & run initial migrations.
- [ ] **Auth Setup**: Configure Supabase Auth and Login Page in Next.js.
- [ ] **Backend Base**: Initialize FastAPI with Agno and helper services.

### Phase 2: Core CRM (The "Board") 📊
- [ ] **Leads API**: CRUD endpoints for Leads.
- [ ] **Kanban UI**: Drag-and-drop board for Lead Status.
- [ ] **Lead Modal**: Edit details (Name, Notes, Phone).

### Phase 3: Messaging System (The "Chat") 💬
- [ ] **Message API**: Store and retrieve message history.
- [ ] **Webhook Handler**: Receive Meta (WA/Insta) events and save to DB.
- [ ] **Chat UI**: 
    - Sidebar with active conversations.
    - Chat window with bubbles (Sent/Received).
    - Real-time subscriptions (Supabase) to auto-update UI.

### Phase 4: AI Agent Integration 🤖
- [ ] **Agno Setup**: Configure `SalesAgent` with `PgMemory`.
- [ ] **Response Logic**: 
    - Trigger Agent on new Lead message.
    - Buffer logic (wait 2s to group messages).
    - Stream Agent response to DB -> UI.
- [ ] **Tools**: Google Calendar integration for "Visit Scheduling".

### Phase 5: Analytics Dashboard (The "Brain") 📈
- [ ] **Data Pipeline**: Daily job to export conversation logs to Pandas DataFrames.
- [ ] **Metrics Engine**: Calculate:
    - *Avg. Response Time* (Agent vs Human).
    - *Conversion Rate* (New -> Visit Scheduled).
    - *Objection Analysis* (Categorize lost leads).
- [ ] **Dashboard UI**:
    - Charts (Recharts/Victory) for "Leads over Time".
    - "Objection Word Cloud".
    - Agent Performance Scorecard.

---

## 👥 Agent Roles
| Agent | Role |
| :--- | :--- |
| **`app-builder` (Orchestrator)** | Coordinate the full build. |
| **`frontend-specialist`** | Build Next.js Dashboard, Kanban, Chat UI. |
| **`backend-specialist`** | Build FastAPI, Webhooks, Agno Logic. |
| **`database-architect`** | Design and migrate Supabase Schema. |

---

## ✅ User Approval Required
- [ ] Confirm this `PLAN-custom-crm.md`.
- [ ] Run `/create` to start the build.
