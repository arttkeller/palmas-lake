# Plan: CRM Lead Movement & Calendar Integration (Updated)

## Context
- **User Request**: 
  1. Create a way for the AI agent to move leads in the CRM (status update).
  2. Orchestrate Google Calendar integration.
  3. Create an "Appointments Menu" in the web system to view scheduled visits.
  4. **[NEW]** Agent automatically classifies lead (Hot/Warm/Cold).
- **Current State**: 
  - `agent_manager.py` has basic tools.
  - `leads` table exists in Supabase.
  - No Google Calendar integration exists.
  - No UI for appointments.

## Task Breakdown

### Phase 1: Agent & CRM Logic (Backend)
- **Goal**: Enable Agent to update lead status, classify lead temperature, and auto-update on specific actions.
- **Agent**: `backend-specialist`
- **Tasks**:
  1.  **Migration**: Add `temperature` column to `leads` table (enum: 'hot', 'warm', 'cold').
  2.  **New Tool**: Add `atualizar_status_lead` to `agent_manager.py`.
      - Arguments: 
        - `status` (enum: 'novo', 'em_atendimento', 'visita_agendada', 'frio', 'venda_realizada').
        - `temperature` (enum: 'quente', 'morno', 'frio').
  3.  **Auto-Trigger**: Modify `agenda` tool logic in `agent_manager.py` to automatically call the status update logic to set `visita_agendada` upon successful scheduling.
  4.  **System Prompt**: Update `agent_manager.py` system prompt to instruct Sofia to classify the lead's temperature throughout the conversation.

### Phase 2: Google Calendar Integration (Backend)
- **Goal**: Sync scheduled visits to Google Calendar.
- **Agent**: `backend-specialist`
- **Tasks**:
  1.  **Service**: Create `services/calendar_service.py`.
      - Implement `create_event(event_data)` using Google Calendar API (or a mock/stub if creds unavailable).
  2.  **Integration**: Update `agenda` tool to call `create_event`.

### Phase 3: Appointments UI (Frontend)
- **Goal**: Visual interface to see appointments.
- **Agent**: `frontend-specialist`
- **Design System**: Use `ui-ux-pro-max` logic for professional table/card design.
- **Tasks**:
  1.  **API Endpoint**: Create `GET /agendamentos` (or query `messages`/`appointments` table) to fetch scheduled visits. 
      - *Architecture*: Create simple `appointments` table in Supabase.
  2.  **Page**: Create `apps/web/app/agendamentos/page.tsx`.
  3.  **Components**: 
      - `AppointmentList` (Table or Cards).
      - Status badges (Hot/Warm/Cold visualization).

### Phase 4: Verification & Polish
- **Goal**: Ensure everything works together.
- **Agent**: `test-engineer`
- **Tasks**:
  1.  Test AI tool usage (simulated).
  2.  Verify React build.
  3.  Lint check.

## Agent Assignments
- **Orchestrator**: Manage dependencies.
- **Backend Specialist**: Python API, Agent Tools, Google Calendar.
- **Frontend Specialist**: Next.js UI.
- **Database Architect**: `appointments` schema and `leads` update.

## Timeline
- **Est. Time**: 25-35 mins implementation.

## Critical Questions for User (Pre-Approval)
1. Do you have the **Google Cloud JSON Key** (`credentials.json`) ready for the Calendar API?
2. Should we create a dedicated `appointments` table in Supabase to track these visits formally, or just rely on the `leads.status`? (Recommendation: **Dedicated Table**).

---

**Status**: User Approved. proceeding with Orchestration.
