"""
Catch-Up Service

Safety net that recovers leads the AI failed to respond to.
Catches messages lost from the in-memory buffer due to server restarts,
deploys, crashes, or message delivery failures.

Runs every 5 minutes alongside the existing follow-up cron.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List
import traceback
import pytz
import asyncio

from services.supabase_client import create_client
from services.agent_manager import AgentManager, _lookup_lead
from services.uazapi_service import UazapiService
from services.meta_service import MetaService
from services.message_service import MessageService
from services.follow_up_service import schedule_follow_up_after_ai_response

BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')

# Leads in terminal states should not receive AI responses
EXCLUDED_STATUSES = {'convertido', 'perdido'}

# Time bounds for catch-up eligibility
MIN_AGE_SECONDS = 120    # 2 minutes — allow buffer to process first
MAX_AGE_HOURS = 6        # 6 hours — don't respond to very old messages


class CatchUpService:
    """
    Detects leads with unanswered messages and triggers
    AI response generation and delivery.
    """

    def __init__(self):
        self.supabase = create_client()
        self.agent = AgentManager()
        self.uazapi = UazapiService()
        self.meta = MetaService()

    async def recover_unanswered_leads(self) -> Dict[str, int]:
        """
        Main entry point. Finds and recovers all unanswered leads.

        Returns:
            Dict with counters: checked, recovered, skipped, failed
        """
        results = {"checked": 0, "recovered": 0, "skipped": 0, "failed": 0}

        try:
            # 1. Find candidate leads with recent interaction
            candidates = self._find_candidate_leads()
            if not candidates:
                return results

            # 2. For each candidate, check if last message is unanswered
            unanswered = []
            for lead in candidates:
                results["checked"] += 1
                if self._check_needs_response(lead):
                    unanswered.append(lead)
                else:
                    results["skipped"] += 1

            if not unanswered:
                return results

            print(f"[CatchUp] Found {len(unanswered)} unanswered lead(s)")

            # 3. Process each unanswered lead sequentially
            msg_service = MessageService()
            for lead in unanswered:
                try:
                    success = await self._recover_single_lead(lead, msg_service)
                    if success:
                        results["recovered"] += 1
                    else:
                        results["failed"] += 1
                except Exception as e:
                    traceback.print_exc()
                    print(f"[CatchUp] Error recovering lead {lead.get('id')}: {e}")
                    results["failed"] += 1

        except Exception as e:
            traceback.print_exc()
            print(f"[CatchUp] Error in recover_unanswered_leads: {e}")

        if results["recovered"] > 0 or results["failed"] > 0:
            print(f"[CatchUp] Results: {results}")
        return results

    def _find_candidate_leads(self) -> List[Dict[str, Any]]:
        """
        Query leads with last_interaction in the [now-6h, now-2min] window.
        Filter out terminal statuses in Python.
        """
        now = datetime.now(BRAZIL_TZ)
        six_hours_ago = (now - timedelta(hours=MAX_AGE_HOURS)).isoformat()

        res = self.supabase.table("leads") \
            .select("id, phone, instagram_id, source, status, full_name, last_interaction") \
            .gte("last_interaction", six_hours_ago) \
            .execute()

        if not res.data:
            return []

        two_min_ago = now - timedelta(seconds=MIN_AGE_SECONDS)
        filtered = []
        for lead in res.data:
            status = (lead.get("status") or "").lower().strip()
            if status in EXCLUDED_STATUSES:
                continue

            li_str = lead.get("last_interaction")
            if li_str:
                try:
                    li_dt = datetime.fromisoformat(li_str.replace("Z", "+00:00"))
                    if li_dt.tzinfo is None:
                        li_dt = BRAZIL_TZ.localize(li_dt)
                    li_dt_brazil = li_dt.astimezone(BRAZIL_TZ)
                    if li_dt_brazil > two_min_ago:
                        continue  # Still in buffer window
                except Exception:
                    continue

            filtered.append(lead)

        return filtered

    def _check_needs_response(self, lead: Dict[str, Any]) -> bool:
        """
        Check if the lead's last message is from the lead (unanswered).
        Returns True if AI response is needed.
        """
        lead_id = lead["id"]

        conv_res = self.supabase.table("conversations") \
            .select("id") \
            .eq("lead_id", lead_id) \
            .execute()

        if not conv_res.data:
            return False

        # Check last message across all conversations
        all_conv_ids = [c["id"] for c in conv_res.data]
        last_msg_res = self.supabase.table("messages") \
            .select("sender_type, created_at") \
            .in_("conversation_id", all_conv_ids) \
            .order("created_at", direction="desc") \
            .limit(1) \
            .execute()

        if last_msg_res.data:
            return last_msg_res.data[0]["sender_type"] == "lead"

        return False

    async def _recover_single_lead(
        self, lead: Dict[str, Any], msg_service: MessageService
    ) -> bool:
        """
        Generate and send AI response for a single unanswered lead.
        """
        lead_id = lead["id"]
        phone = lead.get("phone", "")
        instagram_id = lead.get("instagram_id", "")
        source = (lead.get("source") or "whatsapp").lower()
        full_name = lead.get("full_name", "")

        # Determine lead_id format used by buffer_service / agent_manager
        if source == "instagram" and instagram_id:
            buffer_lead_id = f"ig:{instagram_id}"
            channel = "instagram"
        elif phone:
            buffer_lead_id = phone
            channel = "whatsapp"
        else:
            print(f"[CatchUp] Lead {lead_id} has no phone or instagram_id, skipping")
            return False

        # Check if lead is currently in the in-memory buffer
        try:
            from services.buffer_service import is_lead_buffered
            if await is_lead_buffered(buffer_lead_id):
                print(f"[CatchUp] Lead {buffer_lead_id} is currently in buffer, skipping")
                return False
        except ImportError:
            pass

        print(f"[CatchUp] Recovering lead {lead_id} ({full_name}) via {channel}")

        # Generate AI response using process_message_buffer with empty messages.
        # This triggers the agent to read full DB history and generate a response.
        try:
            response = await self.agent.process_message_buffer(
                buffer_lead_id,
                messages=[],
                pushname=""
            )
        except Exception as e:
            print(f"[CatchUp] Error generating AI response for {buffer_lead_id}: {e}")
            return False

        if not response or response == "IGNORED_DUPLICATE":
            print(f"[CatchUp] No response generated for {buffer_lead_id}")
            return False

        # Split and send response (same pattern as buffer_service.py)
        parts = [p.strip() for p in response.split('\n\n') if p.strip()]

        for part in parts:
            try:
                if channel == "instagram":
                    recipient_id = instagram_id
                    send_result = self.meta.send_instagram_message(recipient_id, part)
                else:
                    send_result = self.uazapi.send_whatsapp_message(buffer_lead_id, part)
                    send_result = None
            except Exception as send_err:
                print(f"[CatchUp] Error sending message via {channel}: {send_err}")
                send_result = None

            # Save to DB
            try:
                whatsapp_msg_id = None
                if channel == "instagram" and isinstance(send_result, dict):
                    whatsapp_msg_id = send_result.get("message_id")
                msg_service.save_message(
                    buffer_lead_id, part, "ai",
                    whatsapp_msg_id=whatsapp_msg_id
                )
            except Exception as db_err:
                print(f"[CatchUp] DB Error saving AI response: {db_err}")

            await asyncio.sleep(1.5)

        # Schedule follow-up
        try:
            schedule_follow_up_after_ai_response(lead_id)
        except Exception as fu_err:
            print(f"[CatchUp] Error scheduling follow-up (non-fatal): {fu_err}")

        print(f"[CatchUp] Successfully recovered lead {lead_id} ({full_name})")
        return True


async def recover_unanswered_leads() -> Dict[str, int]:
    """
    Recovers leads that the AI failed to respond to.
    Called by the cron webhook endpoint every 5 minutes.
    """
    service = CatchUpService()
    return await service.recover_unanswered_leads()
