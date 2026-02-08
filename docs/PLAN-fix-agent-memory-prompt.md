# Plan: Fix Agent Prompt Format and Memory Issues

## Context
- **User Request**: "fix prompt format (XML/Markdown mix)" and "fix agent memory forgetting after 2 messages".
- **Current State**: 
  - `agent_manager.py` has a mixed format prompt.
  - `agent_manager.py` fetches history from DB but also appends buffered messages.
  - Users report the agent "forgets" context quickly.

## Task Breakdown

### Phase 1: Refactor Prompt to Pure XML [DONE]
- **Goal**: Convert the `system_prompt` in `agent_manager.py` to use a clean XML structure, removing Markdown headers (`##`, `###`) and list markers (`-`) where appropriate, replacing them with XML tags.
- **Files**: `apps/api/services/agent_manager.py`
- **Specific Changes**:
  - `<empreendimento_info>` section: Use `<section name="...">` or specific tags like `<location>`, `<characteristics>`, etc.
  - `<identity>`, `<personality>`, etc.: Ensure no Markdown leaks inside.

### Phase 2: Fix Memory/Context Logic [DONE]
- **Goal**: Ensure no lost messages and no duplication in the context window.
- **Files**: `apps/api/services/agent_manager.py`
- **Specific Changes**:
  - In `process_message_buffer`:
    - Add logic to **deduplicate** messages. Check if the last message in `history` (from DB) matches the first message in the `buffer`. If so, do not append it again.
    - Add **Logging**: Print the exact `history` list (or its length and last items) before sending to LLM. This is critical for debugging "amnesia".
    - Check `lead_id` lookup: Ensure `phone` extraction matches `leads` table format.

### Phase 3: Verification
- **Goal**: Confirm fixes.
- **Steps**:
  - Restart server (if needed).
  - Send 3 sequential messages to the agent.
  - Check logs to see if full history is sent to LLM on the 3rd turn.
  - specific check: Verify XML prompt is parsed correctly by the agent (by checking response quality).

## Agent Assignments
- **Orchestrator**: Coordinate the fix.
- **Backend Specialist**: Modify `agent_manager.py`.
