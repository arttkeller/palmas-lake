
import asyncio
from typing import Dict, List
import sentry_sdk
from services.agent_manager import AgentManager
from services.uazapi_service import UazapiService
from services.meta_service import MetaService

# Simple in-memory buffer for MVP. Use Redis for production.
message_buffer: Dict[str, List[tuple]] = {}
buffer_locks: Dict[str, asyncio.Lock] = {}
# Track which channel each lead_id uses (whatsapp or instagram)
channel_map: Dict[str, str] = {}
# Track recently processed message IDs to prevent duplicates (TTL managed manually)
_processed_msg_ids: Dict[str, float] = {}  # msg_id -> timestamp
_DEDUP_TTL = 120  # seconds to keep message IDs in memory
# Leads marked for deletion — buffer processing will skip these
_cancelled_leads: set = set()
# Track WhatsApp pushname per lead
pushname_map: Dict[str, str] = {}
# Track last message arrival time per lead (for resettable timer)
_last_msg_time: Dict[str, float] = {}
# Buffer delay in seconds — resets with each new message
BUFFER_DELAY = 35.0

agent = AgentManager()
uazapi = UazapiService()
meta = MetaService()

def _cleanup_processed_ids():
    """Remove expired message IDs from the dedup cache."""
    import time
    now = time.time()
    expired = [mid for mid, ts in _processed_msg_ids.items() if now - ts > _DEDUP_TTL]
    for mid in expired:
        del _processed_msg_ids[mid]

def cancel_buffer(lead_id: str):
    """Cancel any pending buffered messages for a lead (used before deletion)."""
    removed = message_buffer.pop(lead_id, [])
    channel_map.pop(lead_id, None)
    pushname_map.pop(lead_id, None)
    _last_msg_time.pop(lead_id, None)
    if removed:
        # Only mark as cancelled if there were pending messages in the buffer.
        # This prevents FUTURE messages from being silently discarded after #apagar.
        _cancelled_leads.add(lead_id)
        print(f"[Buffer] Cancelled {len(removed)} pending message(s) for {lead_id}")
    else:
        print(f"[Buffer] No pending messages to cancel for {lead_id}")


async def add_to_buffer(lead_id: str, message_content: str, message_id: str = None, channel: str = "whatsapp", pushname: str = ""):
    """
    Add a message to the buffer for a lead. Messages are batched and processed
    after BUFFER_DELAY seconds of inactivity (timer resets on each new message).

    Args:
        lead_id: Identifier for the lead (phone for WhatsApp, ig:<igsid> for Instagram)
        message_content: Text content of the message
        message_id: Platform message ID (optional)
        channel: "whatsapp" or "instagram"
        pushname: WhatsApp display name (optional)
    """
    import time

    # --- DEDUP CHECK: Skip if this message_id was already processed recently ---
    if message_id:
        _cleanup_processed_ids()
        if message_id in _processed_msg_ids:
            print(f"[Buffer] DUPLICATE: message_id {message_id} already in buffer/processed, skipping")
            return
        _processed_msg_ids[message_id] = time.time()
    # -------------------------------------------------------------------------

    if lead_id not in buffer_locks:
        buffer_locks[lead_id] = asyncio.Lock()

    # Store the channel and pushname for this lead
    channel_map[lead_id] = channel
    if pushname:
        pushname_map[lead_id] = pushname

    async with buffer_locks[lead_id]:
        # Update last message time INSIDE the lock to prevent race condition
        # (previous batch clearing _last_msg_time could erase the new value)
        _last_msg_time[lead_id] = time.time()

        if lead_id not in message_buffer:
            message_buffer[lead_id] = []
            # Start timer for this new batch
            print(f"[Buffer] New batch started for {lead_id}, timer set for {BUFFER_DELAY}s")
            asyncio.create_task(process_buffer_after_delay(lead_id))
        else:
            print(f"[Buffer] Appending to existing batch for {lead_id} (now {len(message_buffer[lead_id]) + 1} msgs), timer reset to {BUFFER_DELAY}s")

        message_buffer[lead_id].append((message_content, message_id))

async def process_buffer_after_delay(lead_id: str):
    """Process buffered messages after BUFFER_DELAY of inactivity.
    Wrapped in global try/except to prevent silent task death."""
    try:
        await _process_buffer_inner(lead_id)
    except Exception as e:
        import traceback
        print(f"[Buffer] CRITICAL: Unhandled error processing {lead_id}: {e}")
        traceback.print_exc()
        sentry_sdk.capture_exception(e)
        # Clean up state so new messages can still be buffered
        message_buffer.pop(lead_id, None)
        channel_map.pop(lead_id, None)
        pushname_map.pop(lead_id, None)
        _last_msg_time.pop(lead_id, None)


async def _process_buffer_inner(lead_id: str):
    import time

    # Resettable timer: wait BUFFER_DELAY seconds after the LAST message
    # Each new message updates _last_msg_time, and the loop re-checks
    while True:
        last_time = _last_msg_time.get(lead_id, 0)
        if last_time == 0:
            print(f"[Buffer] Timer for {lead_id}: _last_msg_time missing, processing immediately")
            break
        elapsed = time.time() - last_time
        remaining = BUFFER_DELAY - elapsed
        if remaining <= 0:
            break
        await asyncio.sleep(remaining)

    msg_count = len(message_buffer.get(lead_id, []))
    print(f"[Buffer] Timer fired for {lead_id}: {msg_count} message(s) ready to process")

    # Skip processing if lead was deleted via #apagar during the delay
    if lead_id in _cancelled_leads:
        _cancelled_leads.discard(lead_id)
        message_buffer.pop(lead_id, None)
        channel_map.pop(lead_id, None)
        pushname_map.pop(lead_id, None)
        _last_msg_time.pop(lead_id, None)
        print(f"[Buffer] Skipping processing for deleted lead {lead_id}")
        return

    # Pop messages under lock (brief) — release BEFORE agent processing
    # so new incoming messages can be buffered immediately
    async with buffer_locks[lead_id]:
        messages_with_ids = message_buffer.pop(lead_id, [])
        channel = channel_map.pop(lead_id, "whatsapp")
        lead_pushname = pushname_map.pop(lead_id, "")
        _last_msg_time.pop(lead_id, None)

    if not messages_with_ids:
        return

    print(f"Processing buffered messages for {lead_id} (channel: {channel}): {messages_with_ids}")

    # Process OUTSIDE the lock — new messages can be buffered in parallel
    # Wrapped in Sentry transaction so OpenAI calls in background tasks are captured
    with sentry_sdk.start_transaction(op="gen_ai.invoke_agent", name=f"agent.maria {lead_id}") as txn:
        txn.set_data("gen_ai.agent.name", "Maria")
        txn.set_data("lead_id", lead_id)
        txn.set_data("channel", channel)
        txn.set_data("message_count", len(messages_with_ids))

        # Call Agent
        try:
            # Pass (content, id) list
            response = await agent.process_message_buffer(lead_id, messages_with_ids, pushname=lead_pushname)
            print(f"Agent Response for {lead_id}: {response}")

            if not response:
                print(f"[Buffer] WARNING: Agent returned None/empty response for {lead_id}, skipping send")
            elif response == "IGNORED_DUPLICATE":
                print(f"[Buffer] Anti-duplicate triggered for {lead_id}, skipping send")

            if response and response != "IGNORED_DUPLICATE":
                # Split messages by double newline to send "picotado"
                parts = [p.strip() for p in response.split('\n\n') if p.strip()]

                from services.message_service import MessageService
                msg_service = MessageService()

                for part in parts:
                    # Send via the appropriate channel
                    try:
                        print(f"[Buffer] Sending message via {channel} to {lead_id}: {part[:50]}...")
                        send_result = _send_message(lead_id, part, channel)
                        print(f"[Buffer] Message sent successfully via {channel}")
                    except Exception as send_err:
                        import traceback
                        print(f"[Buffer] ERROR sending message via {channel}: {send_err}")
                        traceback.print_exc()
                        send_result = None

                    # Save each part to DB
                    try:
                        whatsapp_msg_id = None
                        if channel == "instagram" and isinstance(send_result, dict):
                            whatsapp_msg_id = send_result.get("message_id")
                        msg_service.save_message(lead_id, part, "ai", whatsapp_msg_id=whatsapp_msg_id)
                    except Exception as db_err:
                        print(f"DB Error saving AI response part: {db_err}")

                    # Small delay between parts to feel natural
                    await asyncio.sleep(1.5)

                # Apos IA responder, agendar follow-up Stage 1 (2h)
                # Se o lead nao responder em 2h, o cron job do Supabase dispara a mensagem
                try:
                    from services.follow_up_service import schedule_follow_up_after_ai_response
                    from services.supabase_client import create_client
                    sb = create_client()

                    # For Instagram leads, search by instagram_id
                    if lead_id.startswith("ig:"):
                        ig_id = lead_id[3:]
                        lead_res = sb.table("leads").select("id").eq("instagram_id", ig_id).execute()
                    else:
                        # Strip WhatsApp JID suffix (@s.whatsapp.net) for DB lookup
                        phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
                        lead_res = sb.table("leads").select("id").eq("phone", phone).execute()

                    if lead_res.data and len(lead_res.data) > 0:
                        real_lead_id = lead_res.data[0]["id"]
                        schedule_follow_up_after_ai_response(real_lead_id)
                except Exception as fu_err:
                    print(f"[FollowUp] Erro ao agendar follow-up (nao fatal): {fu_err}")

        except Exception as e:
            sentry_sdk.capture_exception(e)
            print(f"Error acting on buffer: {e}")


def _send_message(lead_id: str, text: str, channel: str):
    """
    Send a message via the appropriate channel.
    
    Args:
        lead_id: Lead identifier (phone or ig:<igsid>)
        text: Message text
        channel: "whatsapp" or "instagram"
    """
    print(f"[_send_message] channel={channel}, lead_id={lead_id}, meta_token={'SET' if meta.access_token else 'MISSING'}")
    if channel == "instagram":
        # Extract IGSID from the ig: prefix
        recipient_id = lead_id[3:] if lead_id.startswith("ig:") else lead_id
        print(f"[_send_message] Calling meta.send_instagram_message({recipient_id})")
        # MetaService.send_instagram_message already removes markdown
        result = meta.send_instagram_message(recipient_id, text)
        print(f"[_send_message] Instagram send result: {result}")
        return result
    else:
        uazapi.send_whatsapp_message(lead_id, text)
        return None
