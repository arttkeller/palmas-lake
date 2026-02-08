# Plan: Sentry Integration for AI Agent System

## Context
The user wants to monitor their AI agent system using Sentry.
- **Stack:** Next.js (Frontend) + FastAPI (Backend).
- **Strategy:** Option A (Full Stack Sentry in the Cloud).
- **Goal:** Unified error tracking and performance monitoring.

## 📦 Phase 1: Preparation & Environment
- [ ] **Action:** User to obtain Sentry DSN.
- [ ] **Task:** Update `apps/api/.env` with `SENTRY_DSN`.
- [ ] **Task:** Update `apps/web/.env.local` with `NEXT_PUBLIC_SENTRY_DSN`.

## 🐍 Phase 2: Backend Implementation (FastAPI)
- [ ] **Dependency:** Add `sentry-sdk[fastapi]` to `apps/api/requirements.txt`.
- [ ] **Code:** Initialize Sentry in `apps/api/main.py` (or equivalent entry point).
  - Configure `traces_sample_rate`.
  - Enable `profiles_sample_rate`.
- [ ] **Feature:** Add a test route `/debug-sentry` to trigger a division-by-zero error.

## ⚛️ Phase 3: Frontend Implementation (Next.js)
- [ ] **Dependency:** Install `@sentry/nextjs` in `apps/web`.
- [ ] **Config:** Create Sentry configuration files:
  - `sentry.client.config.ts`
  - `sentry.server.config.ts`
  - `sentry.edge.config.ts`
- [ ] **Config:** Update `next.config.js` (or `next.config.mjs`) with `withSentryConfig`.
- [ ] **Feature:** Create a UI button (hidden or dev-only) to trigger a test error.

## 🔍 Phase 4: Verification & Handover
- [ ] **Verify:** Start backend and trigger error -> Check Sentry Dashboard.
- [ ] **Verify:** Start frontend and trigger error -> Check Sentry Dashboard.
- [ ] **Cleanup:** Remove debug routes/buttons if requested.

## 📝 User Questions/blockers
1. Do you already have a Sentry project created? We will need the **DSN** key.
