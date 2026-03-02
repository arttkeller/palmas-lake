"""
Event Reminder Service

Sends confirmation reminders 1 hour before scheduled visits.

The service is intended to be triggered by the same Supabase cron webhook
already used for follow-ups.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import traceback
import pytz

from services.supabase_client import create_client
from services.meta_service import MetaService


BRAZIL_TZ = pytz.timezone("America/Sao_Paulo")


class EventReminderService:
    """Service that processes 1-hour reminders for visit events via WhatsApp."""

    def __init__(self):
        self.supabase = create_client()
        self.meta = MetaService()

    @staticmethod
    def _now_utc() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _to_iso(dt: datetime) -> str:
        return dt.isoformat()

    @staticmethod
    def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
        """Parses ISO datetimes from Supabase payloads safely."""
        if not value or not isinstance(value, str):
            return None
        try:
            cleaned = value.strip()
            if cleaned.endswith("Z"):
                cleaned = f"{cleaned[:-1]}+00:00"
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            return None

    @staticmethod
    def _extract_first_name(full_name: Optional[str]) -> str:
        if not full_name:
            return ""
        return full_name.strip().split(" ")[0]

    def _build_reminder_message(self, lead_name: Optional[str], start_time_utc: datetime) -> str:
        first_name = self._extract_first_name(lead_name)
        name_part = f", {first_name}" if first_name else ""
        start_local = start_time_utc.astimezone(BRAZIL_TZ)
        date_label = start_local.strftime("%d/%m")
        time_label = start_local.strftime("%H:%M")
        return (
            f"Oi{name_part}! Seu agendamento no Palmas Lake Towers sera as {time_label} de {date_label}, "
            "daqui a 1 hora. Voce confirma seu comparecimento? 😊"
        )

    @staticmethod
    def _is_active_visit_event(event: Dict[str, Any]) -> bool:
        status = (event.get("status") or "").lower().strip()
        if status in {"cancelado", "cancelled", "realizado", "completed"}:
            return False
        category = (event.get("category") or "").lower().strip()
        if category not in {"visita", "visit"}:
            return False
        return True

    def _event_is_eligible(self, event: Dict[str, Any]) -> bool:
        if not self._is_active_visit_event(event):
            return False
        if bool(event.get("reminder_1h_sent")):
            return False
        return True

    @staticmethod
    def _normalize_lead_relation(lead_relation: Any) -> Dict[str, Any]:
        """Normalizes joined lead relation payload from PostgREST."""
        if isinstance(lead_relation, list):
            return lead_relation[0] if lead_relation else {}
        if isinstance(lead_relation, dict):
            return lead_relation
        return {}

    def _resolve_whatsapp_destination(self, event: Dict[str, Any]) -> Optional[Dict[str, str]]:
        """
        Resolves WhatsApp destination for this event.

        Instagram proactive reminders are not allowed after 24h windows; therefore
        reminder delivery is forced to WhatsApp and requires a valid phone.

        Returns:
            {
              "platform_recipient": "<phone_digits>",
              "remote_jid": "<phone_digits>"
            }
            or None if no recipient could be resolved.
        """
        lead = self._normalize_lead_relation(event.get("leads"))

        lead_phone = str(lead.get("phone") or "").strip()
        event_phone = str(event.get("lead_phone") or "").strip()

        phone_candidate = lead_phone or event_phone
        if phone_candidate:
            normalized_phone = MetaService.normalize_whatsapp_number(phone_candidate)
            if not normalized_phone:
                return None
            return {
                "platform_recipient": normalized_phone,
                "remote_jid": normalized_phone,
            }

        return None

    def execute_due_event_reminders(self) -> Dict[str, int]:
        """
        Sends reminders for visits that are now inside the 1-hour window.

        Rule:
        - only for future visits
        - due when now >= (start_time - 1h)
        - sent once per event (reminder_1h_sent flag)
        """
        results = {"checked": 0, "sent": 0, "failed": 0, "skipped": 0, "not_due_yet": 0}

        try:
            from services.message_service import MessageService

            now_utc = self._now_utc()
            upper_bound = now_utc + timedelta(hours=2)

            res = (
                self.supabase
                .table("events")
                .select("*, leads(id, full_name, phone, source, instagram_id)")
                .gt("start_time", self._to_iso(now_utc))
                .lte("start_time", self._to_iso(upper_bound))
                .order("start_time", "asc")
                .execute()
            )

            events = res.data or []
            if not events:
                return results

            msg_service = MessageService()

            for event in events:
                results["checked"] += 1

                if not self._event_is_eligible(event):
                    results["skipped"] += 1
                    continue

                start_time_utc = self._parse_iso_datetime(event.get("start_time"))
                if not start_time_utc:
                    results["failed"] += 1
                    continue

                due_at = start_time_utc - timedelta(hours=1)
                if now_utc < due_at:
                    results["not_due_yet"] += 1
                    continue

                destination = self._resolve_whatsapp_destination(event)
                if not destination:
                    print(f"[EventReminder] Event {event.get('id')} sem telefone valido para WhatsApp")
                    results["failed"] += 1
                    continue

                lead = self._normalize_lead_relation(event.get("leads"))
                lead_name = lead.get("full_name") or event.get("lead_name")
                message = self._build_reminder_message(lead_name, start_time_utc)

                platform_recipient = destination["platform_recipient"]
                remote_jid = destination["remote_jid"]

                send_result = self.meta.send_whatsapp_text(platform_recipient, message)
                send_ok = send_result is not None

                if not send_ok:
                    print(f"[EventReminder] Falha ao enviar lembrete WhatsApp para event={event.get('id')}")
                    results["failed"] += 1
                    continue

                now_iso = self._to_iso(now_utc)
                self.supabase.table("events").update({
                    "reminder_1h_sent": True,
                    "reminder_1h_sent_at": now_iso,
                }).eq("id", event["id"]).execute()

                try:
                    msg_service.save_message(remote_jid, message, "ai")
                except Exception as save_err:
                    print(f"[EventReminder] Erro ao salvar mensagem (nao fatal): {save_err}")

                results["sent"] += 1
                print(f"[EventReminder] ✓ Reminder 1h enviado para event={event.get('id')} via WhatsApp")

        except Exception as e:
            traceback.print_exc()
            print(f"[EventReminder] Erro ao executar lembretes: {e}")

        return results

    def get_event_reminder_status(self) -> Dict[str, Any]:
        """Returns high-level status for upcoming visit reminders."""
        try:
            now_utc = self._now_utc()
            next_24h = now_utc + timedelta(hours=24)
            res = (
                self.supabase
                .table("events")
                .select("id, start_time, status, category, reminder_1h_sent, reminder_1h_sent_at")
                .gt("start_time", self._to_iso(now_utc))
                .lte("start_time", self._to_iso(next_24h))
                .order("start_time", "asc")
                .execute()
            )

            counts = {
                "upcoming_visits_24h": 0,
                "pending_1h_reminders": 0,
                "sent_1h_reminders": 0,
            }

            for event in (res.data or []):
                if not self._is_active_visit_event(event):
                    continue

                counts["upcoming_visits_24h"] += 1

                if bool(event.get("reminder_1h_sent")):
                    counts["sent_1h_reminders"] += 1
                else:
                    start_time_utc = self._parse_iso_datetime(event.get("start_time"))
                    if not start_time_utc:
                        continue
                    due_at = start_time_utc - timedelta(hours=1)
                    if now_utc >= due_at:
                        counts["pending_1h_reminders"] += 1

            return {"counts": counts}
        except Exception as e:
            return {"error": str(e)}


def execute_due_event_reminders() -> Dict[str, int]:
    """Convenience function for cron/webhook trigger."""
    service = EventReminderService()
    return service.execute_due_event_reminders()


def get_event_reminder_status() -> Dict[str, Any]:
    """Convenience function for API status endpoint."""
    service = EventReminderService()
    return service.get_event_reminder_status()
