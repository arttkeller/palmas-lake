# Analytics Suite Implementation Plan

## 1. Context & Objectives
**Goal**: Implement a comprehensive analytics suite for the AI Agent system.
**User Requirements**:
- Lead Tracking (Quantity, Retention).
- Response Time Analysis (AI vs Lead).
- Appointment Analytics (Heatmaps, Predictability, Commonalities).
- Objection Analysis.
- Channel Distribution Stats.

**Current State**:
- Frontend: `AreaChartStats`, `ConversionFunnel`.
- Backend: `AnalyticsService` (basic leads count), `MessageService` (stores messages).
- Schema: No dedicated `appointments` table (derived from leads status), no `analytics_cache`.

## 2. Backend Implementation (Python)
**File**: `apps/api/services/analytics_service.py`

### 2.1. Lead Metrics
- **Logic**: Count leads by `created_at` grouped by day/week.
- **New Method**: `get_lead_volume_by_week(month_offset=0)` -> Returns leads count for Week 1, 2, 3, 4.

### 2.2. Response Time Metrics
- **Logic**: Query `messages` table.
- **Algorithm**:
  1. Fetch messages ordered by `conversation_id`, `created_at`.
  2. Calculate delta `T(ai) - T(user)` for AI Response Time.
  3. Calculate delta `T(user) - T(ai)` for Lead Response Time.
  4. Average per day.
- **New Method**: `get_response_times(period='30d')`.

### 2.3. Appointment Analytics
- **Heatmap**:
  - **Logic**: Use `leads.created_at` (proxy) or find specific "scheduling" messages.
  - **Fallback**: Since specific "appointment booked" timestamp isn't explicitly stored, we will use `leads` where `status='visita_agendada'` and use their `updated_at` (if reliable) or `created_at` as a proxy for "best engagement time".
  - **Method**: `get_appointment_heatmap()` -> 7x24 matrix (Day x Hour).
- **Predictability**:
  - **Logic**: Compare current week vs previous weeks average.
  - **Method**: `get_forecast()` -> linear projection.
- **Commonalities (NLP)**:
  - **Logic**: Simplistic keyword extraction from conversations with `visita_agendada`.
  - **Method**: `get_successful_keywords()`.

### 2.4. Retention & Channels
- **Retention**: Calculate avg days between first and last message for active leads.
- **Channel**: Count `conversations.platform` (or default to 'whatsapp' if null).

### 2.5. Objections
- **Logic**: Analyze messages of `lost` leads for keywords: "preço", "caro", "longe", "momento".
- **Method**: `get_top_objections()`.

## 3. Frontend Implementation (React)
**Folder**: `apps/web/components/charts`
**Page**: `apps/web/app/dashboard/analytics/page.tsx`

### 3.1. New Components
- `ResponseTimeChart.tsx`: Dual line chart (AI Speed vs Lead Speed).
- `AppointmentHeatmap.tsx`: 7x24 Grid (Recharts Scatter or Custom Grid).
- `ObjectionBarChart.tsx`: Simple Bar Chart.
- `ChannelDonut.tsx`: Pie Chart with "Future" placeholders.
- `PredictabilityCard.tsx`: Metric card with "Expected vs Actual".

### 3.2. Layout Update
- Move `ConversionFunnel` to top (Critical Path).
- Add "Operational Efficiency" Section (Response Times).
- Add "Strategic Insights" Section (Heatmap, Objections).

## 4. Verification Plan
- [ ] Backend: Unit test `get_response_times` with mock message chain.
- [ ] Backend: Verify Heatmap data structure returns correct 7x24 grid.
- [ ] Frontend: Check responsiveness of Heatmap on small screens.
- [ ] Integration: `npm run build` passes.
