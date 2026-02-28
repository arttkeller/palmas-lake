
import asyncio
import json
import logging
import time
import uuid
from typing import Optional

import sentry_sdk
from redis.asyncio import Redis

from services.agent_manager import AgentManager
from services.uazapi_service import UazapiService
from services.meta_service import MetaService

logger = logging.getLogger(__name__)

# ── Redis client (set via init_redis from lifespan) ────────────────────
_redis: Optional[Redis] = None

# ── Constants ──────────────────────────────────────────────────────────
BUFFER_DELAY = 35.0          # seconds of silence before processing
_DEDUP_TTL = 120             # seconds to keep message IDs for dedup
_LOCK_TIMEOUT_MS = 30_000    # distributed lock auto-expiry
_LOCK_RETRY_DELAY = 0.1      # seconds between lock retries
_LOCK_MAX_RETRIES = 50       # max lock attempts (~5s)
_POLL_INTERVAL = 2.0         # timer loop polling interval

# ── Redis key patterns ────────────────────────────────────────────────
_K_MSGS     = "buffer:msgs:{}"       # List — lead messages
_K_CHANNEL  = "buffer:ch:{}"         # String — channel per lead
_K_PUSHNAME = "buffer:pn:{}"         # String — pushname per lead
_K_DEDUP    = "buffer:dedup:{}"      # String — message dedup (TTL=120s)
_K_CANCEL   = "buffer:cancelled:{}"  # String — cancelled flag (TTL=120s)
_K_LOCK     = "buffer:lock:{}"       # String — distributed lock (TTL=30s)
_K_TIMER    = "buffer:ready_at"      # Sorted Set — fire times

# ── Lua scripts ───────────────────────────────────────────────────────
# Safe lock release: only delete if we own the lock
_LUA_RELEASE_LOCK = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
"""

# Atomic pop: get all messages + metadata, then delete keys
_LUA_POP_BUFFER = """
local msgs = redis.call("LRANGE", KEYS[1], 0, -1)
redis.call("DEL", KEYS[1])
local ch = redis.call("GET", KEYS[2])
if not ch then ch = "" end
redis.call("DEL", KEYS[2])
local pn = redis.call("GET", KEYS[3])
if not pn then pn = "" end
redis.call("DEL", KEYS[3])
return {msgs, ch, pn}
"""

# ── Service instances ─────────────────────────────────────────────────
agent = AgentManager()
uazapi = UazapiService()
meta = MetaService()


# ═══════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════

def init_redis(client: Redis) -> None:
    """Called from FastAPI lifespan to inject the async Redis client."""
    global _redis
    _redis = client
    logger.info("[Buffer] Redis client initialized")


async def run_timer_loop() -> None:
    """Background coroutine that polls the sorted set for due timers.
    Started once per worker process from the FastAPI lifespan."""
    logger.info("[Buffer] Timer loop started (polling every %.1fs)", _POLL_INTERVAL)
    while True:
        try:
            now = time.time()
            due = await _redis.zrangebyscore(_K_TIMER, "-inf", now)
            for member in due:
                lead_id = member.decode() if isinstance(member, bytes) else member
                removed = await _redis.zrem(_K_TIMER, lead_id)
                if removed:
                    logger.info(f"[Buffer] Timer fired for {lead_id}, claiming for processing")
                    asyncio.create_task(_safe_process_buffer(lead_id))
        except asyncio.CancelledError:
            logger.info("[Buffer] Timer loop cancelled, shutting down")
            return
        except Exception as e:
            logger.error(f"[Buffer] Timer loop error (will retry): {e}")
            sentry_sdk.capture_exception(e)
        await asyncio.sleep(_POLL_INTERVAL)


async def add_to_buffer(
    lead_id: str,
    message_content: str,
    message_id: str = None,
    channel: str = "whatsapp",
    pushname: str = "",
) -> None:
    """Add a message to the buffer for a lead. Messages are batched and processed
    after BUFFER_DELAY seconds of inactivity (timer resets on each new message)."""

    # ── Dedup check ──
    if message_id:
        was_set = await _redis.set(
            _K_DEDUP.format(message_id), "1", nx=True, ex=_DEDUP_TTL
        )
        if was_set is None:
            logger.info(f"[Buffer] DUPLICATE: message_id {message_id} already processed, skipping")
            return

    # ── Acquire distributed lock ──
    token = await _acquire_lock(lead_id)
    try:
        # Store channel and pushname
        await _redis.set(_K_CHANNEL.format(lead_id), channel)
        if pushname:
            await _redis.set(_K_PUSHNAME.format(lead_id), pushname)

        # Check if this is a new batch
        list_len = await _redis.llen(_K_MSGS.format(lead_id))
        is_new_batch = list_len == 0

        # Append message to list
        await _redis.rpush(
            _K_MSGS.format(lead_id),
            json.dumps([message_content, message_id]),
        )

        # Set / reset the debounce timer in the sorted set
        fire_at = time.time() + BUFFER_DELAY
        await _redis.zadd(_K_TIMER, {lead_id: fire_at})

        if is_new_batch:
            logger.info(f"[Buffer] New batch started for {lead_id}, timer set for {BUFFER_DELAY}s")
        else:
            logger.info(
                f"[Buffer] Appending to existing batch for {lead_id} "
                f"(now {list_len + 1} msgs), timer reset to {BUFFER_DELAY}s"
            )
    finally:
        if token:
            await _release_lock(lead_id, token)


async def cancel_buffer(lead_id: str) -> None:
    """Cancel any pending buffered messages for a lead (used before deletion)."""
    try:
        list_len = await _redis.llen(_K_MSGS.format(lead_id))
        had_messages = list_len > 0

        # Remove all buffer keys for this lead
        await _redis.delete(
            _K_MSGS.format(lead_id),
            _K_CHANNEL.format(lead_id),
            _K_PUSHNAME.format(lead_id),
        )
        # Remove from timer sorted set
        await _redis.zrem(_K_TIMER, lead_id)

        if had_messages:
            # Mark as cancelled so any in-flight processing skips this lead
            await _redis.set(_K_CANCEL.format(lead_id), "1", ex=_DEDUP_TTL)
            logger.info(f"[Buffer] Cancelled {list_len} pending message(s) for {lead_id}")
        else:
            logger.info(f"[Buffer] No pending messages to cancel for {lead_id}")
    except Exception as e:
        logger.error(f"[Buffer] Error in cancel_buffer (non-fatal): {e}")


async def is_lead_buffered(lead_id: str) -> bool:
    """Check if a lead currently has messages in the buffer."""
    try:
        return await _redis.llen(_K_MSGS.format(lead_id)) > 0
    except Exception:
        return False


async def get_active_lead_ids() -> list:
    """Get all lead IDs that currently have pending buffer entries."""
    try:
        members = await _redis.zrange(_K_TIMER, 0, -1)
        return [m.decode() if isinstance(m, bytes) else m for m in members]
    except Exception:
        return []


# ═══════════════════════════════════════════════════════════════════════
# Internal: distributed lock
# ═══════════════════════════════════════════════════════════════════════

async def _acquire_lock(lead_id: str) -> Optional[str]:
    """Acquire a Redis distributed lock. Returns token on success, None on failure."""
    token = str(uuid.uuid4())
    key = _K_LOCK.format(lead_id)
    for _ in range(_LOCK_MAX_RETRIES):
        acquired = await _redis.set(key, token, nx=True, px=_LOCK_TIMEOUT_MS)
        if acquired:
            return token
        await asyncio.sleep(_LOCK_RETRY_DELAY)
    logger.warning(f"[Buffer] Failed to acquire lock for {lead_id} after {_LOCK_MAX_RETRIES} retries")
    return None


async def _release_lock(lead_id: str, token: str) -> None:
    """Release a Redis distributed lock (only if we own it)."""
    key = _K_LOCK.format(lead_id)
    await _redis.eval(_LUA_RELEASE_LOCK, 1, key, token)


# ═══════════════════════════════════════════════════════════════════════
# Internal: buffer processing
# ═══════════════════════════════════════════════════════════════════════

async def _safe_process_buffer(lead_id: str):
    """Top-level wrapper with error handling for buffer processing."""
    try:
        await _process_buffer(lead_id)
    except Exception as e:
        import traceback
        logger.error(f"[Buffer] CRITICAL: Unhandled error processing {lead_id}: {e}")
        traceback.print_exc()
        sentry_sdk.capture_exception(e)
        # Clean up state so new messages can still be buffered
        try:
            await _redis.delete(
                _K_MSGS.format(lead_id),
                _K_CHANNEL.format(lead_id),
                _K_PUSHNAME.format(lead_id),
            )
        except Exception:
            pass


async def _process_buffer(lead_id: str):
    """Process buffered messages for a lead after the debounce timer fires."""

    # Skip if lead was cancelled via #apagar during the delay
    cancelled = await _redis.get(_K_CANCEL.format(lead_id))
    if cancelled:
        await _redis.delete(_K_CANCEL.format(lead_id))
        await _redis.delete(
            _K_MSGS.format(lead_id),
            _K_CHANNEL.format(lead_id),
            _K_PUSHNAME.format(lead_id),
        )
        logger.info(f"[Buffer] Skipping processing for deleted lead {lead_id}")
        return

    # Skip AI processing if ai_paused is True for this lead
    try:
        from services.supabase_client import create_client as _create_sb
        _sb = _create_sb()
        if lead_id.startswith("ig:"):
            _ig_id = lead_id[3:]
            _pause_check = _sb.table("leads").select("ai_paused").eq("instagram_id", _ig_id).execute()
        else:
            _phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
            _pause_check = _sb.table("leads").select("ai_paused").eq("phone", _phone).execute()

        if _pause_check.data and _pause_check.data[0].get("ai_paused"):
            logger.info(f"[Buffer] AI is PAUSED for {lead_id}, skipping AI processing")
            await _redis.delete(
                _K_MSGS.format(lead_id),
                _K_CHANNEL.format(lead_id),
                _K_PUSHNAME.format(lead_id),
            )
            return
    except Exception as pause_err:
        logger.error(f"[Buffer] Error checking ai_paused (proceeding normally): {pause_err}")

    # ── Atomic pop: get messages + metadata in one Lua call ──
    token = await _acquire_lock(lead_id)
    try:
        result = await _redis.eval(
            _LUA_POP_BUFFER,
            3,
            _K_MSGS.format(lead_id),
            _K_CHANNEL.format(lead_id),
            _K_PUSHNAME.format(lead_id),
        )
    finally:
        if token:
            await _release_lock(lead_id, token)

    # Parse Lua result
    raw_msgs, raw_channel, raw_pushname = result
    if not raw_msgs:
        return

    messages_with_ids = []
    for item in raw_msgs:
        decoded = item.decode() if isinstance(item, bytes) else item
        content, msg_id = json.loads(decoded)
        messages_with_ids.append((content, msg_id))

    channel = (raw_channel.decode() if isinstance(raw_channel, bytes) else raw_channel) or "whatsapp"
    lead_pushname = (raw_pushname.decode() if isinstance(raw_pushname, bytes) else raw_pushname) or ""

    logger.info(f"[Buffer] Processing {len(messages_with_ids)} message(s) for {lead_id} (channel: {channel})")

    # ── Process outside the lock — identical to original logic ──
    with sentry_sdk.start_transaction(op="gen_ai.invoke_agent", name=f"agent.maria {lead_id}") as txn:
        txn.set_data("gen_ai.agent.name", "Maria")
        txn.set_data("lead_id", lead_id)
        txn.set_data("channel", channel)
        txn.set_data("message_count", len(messages_with_ids))

        try:
            response = await agent.process_message_buffer(lead_id, messages_with_ids, pushname=lead_pushname)
            logger.info(f"Agent Response for {lead_id}: {response}")

            if not response:
                logger.warning(f"[Buffer] WARNING: Agent returned None/empty response for {lead_id}, skipping send")
            elif response == "IGNORED_DUPLICATE":
                logger.info(f"[Buffer] Anti-duplicate triggered for {lead_id}, skipping send")
            elif response == "__TOOL_SENT__":
                logger.info(f"[Buffer] Messages already sent via tool for {lead_id}, skipping re-send")

            skip_responses = ("IGNORED_DUPLICATE", "__TOOL_SENT__")
            if response and response not in skip_responses:
                parts = [p.strip() for p in response.split('\n\n') if p.strip()]

                from services.message_service import MessageService
                msg_service = MessageService()

                for part in parts:
                    try:
                        logger.info(f"[Buffer] Sending message via {channel} to {lead_id}: {part[:50]}...")
                        send_result = _send_message(lead_id, part, channel)
                        logger.info(f"[Buffer] Message sent successfully via {channel}")
                    except Exception as send_err:
                        import traceback
                        logger.error(f"[Buffer] ERROR sending message via {channel}: {send_err}")
                        traceback.print_exc()
                        send_result = None

                    try:
                        whatsapp_msg_id = None
                        if channel == "instagram" and isinstance(send_result, dict):
                            whatsapp_msg_id = send_result.get("message_id")
                        msg_service.save_message(lead_id, part, "ai", whatsapp_msg_id=whatsapp_msg_id)
                    except Exception as db_err:
                        logger.error(f"DB Error saving AI response part: {db_err}")

                    await asyncio.sleep(1.5)

            # Schedule follow-up after AI response
            if response and response not in ("IGNORED_DUPLICATE", None, ""):
                try:
                    from services.follow_up_service import schedule_follow_up_after_ai_response
                    from services.supabase_client import create_client
                    sb = create_client()

                    if lead_id.startswith("ig:"):
                        ig_id = lead_id[3:]
                        lead_res = sb.table("leads").select("id").eq("instagram_id", ig_id).execute()
                    else:
                        phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
                        lead_res = sb.table("leads").select("id").eq("phone", phone).execute()

                    if lead_res.data and len(lead_res.data) > 0:
                        real_lead_id = lead_res.data[0]["id"]
                        schedule_follow_up_after_ai_response(real_lead_id)
                except Exception as fu_err:
                    logger.error(f"[FollowUp] Erro ao agendar follow-up (nao fatal): {fu_err}")

        except Exception as e:
            sentry_sdk.capture_exception(e)
            logger.error(f"Error acting on buffer: {e}")


def _send_message(lead_id: str, text: str, channel: str):
    """Send a message via the appropriate channel."""
    logger.info(f"[_send_message] channel={channel}, lead_id={lead_id}, meta_token={'SET' if meta.access_token else 'MISSING'}")
    if channel == "instagram":
        recipient_id = lead_id[3:] if lead_id.startswith("ig:") else lead_id
        logger.info(f"[_send_message] Calling meta.send_instagram_message({recipient_id})")
        result = meta.send_instagram_message(recipient_id, text)
        logger.info(f"[_send_message] Instagram send result: {result}")
        return result
    else:
        uazapi.send_whatsapp_message(lead_id, text)
        return None
