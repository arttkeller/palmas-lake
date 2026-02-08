# Debug & Enhance Plan

## Issues Identified
1. **Memory**: Agent keeps asking for name. (Likely Context window issue or prompt instruction).
2. **Lead Classification**: Not updating 'temperature'/'status'. (Likely prompt instruction or missing call).
3. **Images**: Sending URL as text instead of media object. (Missing `send_media` implementation).
4. **Replies**: `reply_id` not working. (Payload key needs verification: is it `quoted` or `replyId`?). User link for docs was general tag.
5. **Reactions**: Not working. (User link provided: `/message/react`).

## Tasks

### 1. Fix UazAPI Service (`apps/api/services/uazapi_service.py`)
- **Implement `send_media`**: Add method to `POST /message/media` (common Uazapi endpoint, need to verify exact path from user hint or try standard).
  - *Standard UazAPI* often uses `/message/image` or `/send-image`.
  - User Link: `https://docs.uazapi.com/tag/Enviar%20Mensagem`.
  - *Hypothesis*: The user said "endpoint correto de send media". I'll search widely used endpoints or assume `/send/media` or `/message/image`.
  - *Correction*: I will enable the Browser tool to check the docs link if possible? No, I should use `search_web` or ask user. But user gave link. I will try to infer best standard.
  - Let's assume standard Uazapi structure often is `/message/send-media` or similar. I'll start with a flexible implementation.
- **Fix `send_whatsapp_message`**: Verify `quoted` vs `replyId`. 
- **Fix `send_reaction`**: Verify endpoint. User said `https://docs.uazapi.com/endpoint/post/message~react`. This looks like `/message/react`. The current code uses `/send/reaction`. I will change it to `/message/react`.

### 2. Fix Agent Manager (`apps/api/services/agent_manager.py`)
- **Memory Logic**:
    - The deduplication logic might be stripping the context too aggressively or the fetch is failing.
    - **Action**: Add "System Note" with the Lead's Name if known.
    - **Action**: In `process_message_buffer`, explicitly check `leads` table for `full_name` and inject it into the system prompt: `User Name: {full_name}`. This forces the AI to know the name.
- **Image Tool**: 
    - Update `enviar_imagens` to call `u_service.send_media`.
- **Lead Status**:
    - Reinforce prompt: "ALWAYS classify lead temperature after every 2-3 messages."

## Agent Assignments
- **Backend Specialist**: Fix `uazapi_service.py` and `agent_manager.py`.
- **Test Engineer**: Verify via logs.

## Execution Order
1. Modify `uazapi_service.py` (Fix endpoints).
2. Modify `agent_manager.py` (Fix memory/name injection, image handler).
