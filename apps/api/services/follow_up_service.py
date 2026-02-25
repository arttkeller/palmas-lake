"""
Follow-up Service

Handles proactive follow-up messaging for inactive leads.

Follow-up stages (encadeados):
- Stage 1: 2h após o lead parar de responder
- Stage 2: 24h após o Stage 1 ser executado
- Stage 3: 48h após o Stage 2 ser executado

Horário comercial: 9h às 19h (América/São_Paulo).
Se um follow-up cair fora desse horário, é reagendado para 9h do próximo dia útil.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
import pytz
import uuid
import traceback

from services.supabase_client import create_client
from services.uazapi_service import UazapiService

# Timezone do Brasil
BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')

# Follow-up stage config
STAGE_CONFIG = {
    1: {"delay_hours": 2,  "label": "2h após inatividade"},
    2: {"delay_hours": 24, "label": "24h após Stage 1"},
    3: {"delay_hours": 48, "label": "48h após Stage 2"},
}

# Horário comercial
BUSINESS_HOUR_START = 9   # 9:00 AM
BUSINESS_HOUR_END   = 19  # 7:00 PM


def get_brazil_now() -> datetime:
    """Returns current datetime in Brazil timezone."""
    return datetime.now(BRAZIL_TZ)


def get_brazil_now_iso() -> str:
    """Returns current datetime in Brazil timezone as ISO string."""
    return datetime.now(BRAZIL_TZ).isoformat()


def clamp_to_business_hours(dt: datetime) -> datetime:
    """
    Ajusta um datetime para cair dentro do horário comercial (9h-19h).
    
    - Se for antes das 9h → move para 9h do mesmo dia
    - Se for depois das 19h → move para 9h do dia seguinte
    - Se cair no sábado → move para segunda 9h
    - Se cair no domingo → move para segunda 9h
    """
    if dt.tzinfo is None:
        dt = BRAZIL_TZ.localize(dt)
    else:
        dt = dt.astimezone(BRAZIL_TZ)

    # Ajustar hora
    if dt.hour >= BUSINESS_HOUR_END:
        # Depois das 19h → próximo dia às 9h
        dt = dt.replace(hour=BUSINESS_HOUR_START, minute=0, second=0, microsecond=0) + timedelta(days=1)
    elif dt.hour < BUSINESS_HOUR_START:
        # Antes das 9h → mesmo dia às 9h
        dt = dt.replace(hour=BUSINESS_HOUR_START, minute=0, second=0, microsecond=0)

    # Ajustar fins de semana (5=sábado, 6=domingo)
    weekday = dt.weekday()
    if weekday == 5:  # Sábado
        dt = dt + timedelta(days=2)
        dt = dt.replace(hour=BUSINESS_HOUR_START, minute=0, second=0, microsecond=0)
    elif weekday == 6:  # Domingo
        dt = dt + timedelta(days=1)
        dt = dt.replace(hour=BUSINESS_HOUR_START, minute=0, second=0, microsecond=0)

    return dt


def calculate_scheduled_at(base_time: datetime, delay_hours: int) -> datetime:
    """
    Calcula o horário agendado para um follow-up, respeitando horário comercial.
    
    Args:
        base_time: Horário base (last_interaction ou executed_at do stage anterior)
        delay_hours: Horas de delay a aplicar
    
    Returns:
        Datetime ajustado para horário comercial
    """
    raw_time = base_time + timedelta(hours=delay_hours)
    return clamp_to_business_hours(raw_time)


class FollowUpService:
    """
    Service for managing proactive follow-up messages to inactive leads.
    
    Fluxo:
    1. IA responde → schedule_initial_follow_up() agenda Stage 1 em 2h
    2. Cron job (Supabase) chama execute_due_follow_ups() a cada 5 minutos
    3. Após executar Stage 1 → agenda Stage 2 em 24h
    4. Após executar Stage 2 → agenda Stage 3 em 48h
    5. Após executar Stage 3 → marca lead como frio
    6. Se lead responde → cancel_pending_follow_ups() cancela tudo e reseta
    """

    def __init__(self):
        self.supabase = create_client()
        self.uazapi = UazapiService()

    def is_business_hours(self, dt: Optional[datetime] = None) -> bool:
        """Checks if the given datetime is within business hours (9h-19h BRT)."""
        if dt is None:
            dt = get_brazil_now()
        elif dt.tzinfo is None:
            dt = BRAZIL_TZ.localize(dt)
        else:
            dt = dt.astimezone(BRAZIL_TZ)

        weekday = dt.weekday()
        if weekday >= 5:  # Fim de semana
            return False
        return BUSINESS_HOUR_START <= dt.hour < BUSINESS_HOUR_END

    # ------------------------------------------------------------------
    # AGENDAMENTO
    # ------------------------------------------------------------------

    def schedule_initial_follow_up(self, lead_id: str) -> Optional[str]:
        """
        Agenda o primeiro follow-up (Stage 1) para 2h após agora.
        Chamado após a IA enviar sua resposta ao lead.
        
        Returns:
            ID do follow-up agendado ou None se falhou
        """
        now = get_brazil_now()
        scheduled_at = calculate_scheduled_at(now, STAGE_CONFIG[1]["delay_hours"])
        return self._schedule(lead_id, stage=1, scheduled_at=scheduled_at)

    def schedule_next_stage(self, lead_id: str, completed_stage: int) -> Optional[str]:
        """
        Agenda o próximo follow-up após completar um stage.
        
        Args:
            lead_id: UUID do lead
            completed_stage: Stage que acabou de ser executado (1, 2 ou 3)
        
        Returns:
            ID do follow-up agendado ou None se não há próximo stage
        """
        next_stage = completed_stage + 1
        if next_stage > 3:
            return None  # Não há stage 4

        now = get_brazil_now()
        delay = STAGE_CONFIG[next_stage]["delay_hours"]
        scheduled_at = calculate_scheduled_at(now, delay)
        return self._schedule(lead_id, stage=next_stage, scheduled_at=scheduled_at)

    def _schedule(self, lead_id: str, stage: int, scheduled_at: datetime) -> Optional[str]:
        """Insere um follow-up na fila."""
        try:
            # Verificar se já existe pending para esse lead
            existing = self.supabase.table("follow_up_queue").select("id").eq(
                "lead_id", lead_id
            ).eq("status", "pending").execute()

            if existing.data and len(existing.data) > 0:
                print(f"[FollowUp] Lead {lead_id} já tem follow-up pendente, pulando")
                return None

            follow_up_data = {
                "lead_id": lead_id,
                "scheduled_at": scheduled_at.isoformat(),
                "stage": stage,
                "message_template": f"stage_{stage}",
                "status": "pending"
            }

            res = self.supabase.table("follow_up_queue").insert(follow_up_data).execute()

            if res.data and len(res.data) > 0:
                follow_up_id = res.data[0].get("id")
                # Atualizar lead com next_follow_up
                self.supabase.table("leads").update({
                    "next_follow_up": scheduled_at.isoformat(),
                    "follow_up_stage": stage - 1  # Stage anterior (0 se é Stage 1)
                }).eq("id", lead_id).execute()

                print(f"[FollowUp] Agendado Stage {stage} para lead {lead_id} em {scheduled_at.strftime('%d/%m %H:%M')}")
                return follow_up_id

            return None

        except Exception as e:
            traceback.print_exc()
            print(f"[FollowUp] Erro ao agendar follow-up: {e}")
            return None

    # ------------------------------------------------------------------
    # EXECUÇÃO (chamado pelo cron job do Supabase)
    # ------------------------------------------------------------------

    def execute_due_follow_ups(self) -> Dict[str, int]:
        """
        Busca e executa todos os follow-ups que já passaram do scheduled_at.
        Chamado pelo cron job do Supabase via webhook.
        
        Returns:
            Dict com contadores de execuções
        """
        results = {"executed": 0, "failed": 0, "next_scheduled": 0, "skipped": 0}

        # Verificar se estamos em horário comercial
        if not self.is_business_hours():
            print("[FollowUp] Fora do horário comercial (9h-19h), pulando execução")
            return results

        try:
            now_iso = get_brazil_now_iso()

            # Buscar follow-ups pendentes que já passaram do horário
            res = self.supabase.table("follow_up_queue").select(
                "*, leads(id, phone, full_name, temperature, status, follow_up_stage)"
            ).eq("status", "pending").lte("scheduled_at", now_iso).execute()

            if not res.data:
                print("[FollowUp] Nenhum follow-up pendente para executar")
                return results

            for follow_up in res.data:
                lead = follow_up.get("leads")
                if not lead:
                    self._mark_failed(follow_up["id"], "Lead não encontrado")
                    results["failed"] += 1
                    continue

                # Pular leads com status que não devem receber follow-up
                status = (lead.get("status") or "").lower()
                if status in ["convertido", "perdido", "visita_agendada", "visita_realizada", "transferido"]:
                    self._mark_cancelled(follow_up["id"])
                    results["skipped"] += 1
                    continue

                phone = lead.get("phone")
                if not phone:
                    self._mark_failed(follow_up["id"], "Sem telefone")
                    results["failed"] += 1
                    continue

                # Enviar mensagem
                success = self._send_follow_up_message(follow_up, lead)

                if success:
                    stage = follow_up.get("stage", 1)

                    # Marcar como executado
                    self.supabase.table("follow_up_queue").update({
                        "status": "executed",
                        "executed_at": get_brazil_now_iso()
                    }).eq("id", follow_up["id"]).execute()

                    # Atualizar lead
                    lead_update = {"follow_up_stage": stage}
                    if stage >= 3:
                        lead_update["temperature"] = "frio"
                    self.supabase.table("leads").update(lead_update).eq("id", lead["id"]).execute()

                    results["executed"] += 1

                    # Agendar próximo stage
                    next_id = self.schedule_next_stage(lead["id"], stage)
                    if next_id:
                        results["next_scheduled"] += 1
                    
                    print(f"[FollowUp] ✓ Stage {stage} executado para {lead.get('full_name', phone)}")
                else:
                    self._mark_failed(follow_up["id"], "Falha no envio")
                    results["failed"] += 1

        except Exception as e:
            traceback.print_exc()
            print(f"[FollowUp] Erro ao executar follow-ups: {e}")

        print(f"[FollowUp] Resultado: {results}")
        return results

    def _send_follow_up_message(self, follow_up: Dict, lead: Dict) -> bool:
        """Envia a mensagem de follow-up via WhatsApp."""
        try:
            from services.follow_up_templates import get_follow_up_message
            from services.message_service import MessageService

            phone = lead.get("phone")
            name = (lead.get("full_name") or "").split()[0] if lead.get("full_name") else ""
            stage = follow_up.get("stage", 1)

            message = get_follow_up_message(stage, name)
            result = self.uazapi.send_whatsapp_message(phone, message)

            if result:
                # Salvar a mensagem no banco como mensagem da IA
                try:
                    msg_service = MessageService()
                    msg_service.save_message(phone, message, "ai")
                except Exception as save_err:
                    print(f"[FollowUp] Erro ao salvar mensagem (não fatal): {save_err}")
                return True

            return False

        except Exception as e:
            traceback.print_exc()
            print(f"[FollowUp] Erro ao enviar mensagem: {e}")
            return False

    def _mark_failed(self, follow_up_id: str, reason: str = ""):
        """Marca um follow-up como failed."""
        try:
            self.supabase.table("follow_up_queue").update({
                "status": "failed",
                "executed_at": get_brazil_now_iso()
            }).eq("id", follow_up_id).execute()
            print(f"[FollowUp] ✗ Follow-up {follow_up_id} falhou: {reason}")
        except Exception:
            pass

    def _mark_cancelled(self, follow_up_id: str):
        """Marca um follow-up como cancelado."""
        try:
            self.supabase.table("follow_up_queue").update({
                "status": "cancelled"
            }).eq("id", follow_up_id).execute()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # CANCELAMENTO (quando o lead responde)
    # ------------------------------------------------------------------

    def cancel_pending_follow_ups(self, lead_id: str) -> int:
        """
        Cancela todos os follow-ups pendentes de um lead.
        Chamado quando o lead responde (via message_service).
        """
        try:
            res = self.supabase.table("follow_up_queue").update({
                "status": "cancelled"
            }).eq("lead_id", lead_id).eq("status", "pending").execute()

            cancelled_count = len(res.data) if res.data else 0

            if cancelled_count > 0:
                self.supabase.table("leads").update({
                    "follow_up_stage": 0,
                    "next_follow_up": None
                }).eq("id", lead_id).execute()
                print(f"[FollowUp] Cancelados {cancelled_count} follow-ups para lead {lead_id}")

            return cancelled_count

        except Exception as e:
            traceback.print_exc()
            print(f"[FollowUp] Erro ao cancelar follow-ups: {e}")
            return 0

    # ------------------------------------------------------------------
    # STATUS
    # ------------------------------------------------------------------

    def get_queue_status(self) -> Dict[str, Any]:
        """Retorna contadores da fila de follow-ups."""
        try:
            res = self.supabase.table("follow_up_queue").select(
                "id, lead_id, stage, status, scheduled_at, executed_at"
            ).execute()

            counts = {"pending": 0, "executed": 0, "cancelled": 0, "failed": 0}
            pending_details = []

            if res.data:
                for row in res.data:
                    s = row.get("status", "")
                    if s in counts:
                        counts[s] += 1
                    if s == "pending":
                        pending_details.append({
                            "id": row["id"],
                            "lead_id": row["lead_id"],
                            "stage": row["stage"],
                            "scheduled_at": row["scheduled_at"]
                        })

            return {
                "counts": counts,
                "total": sum(counts.values()),
                "pending_details": pending_details
            }

        except Exception as e:
            return {"error": str(e)}


# ---------------------------------------------------------------
# Convenience functions (usadas por outros serviços)
# ---------------------------------------------------------------

def schedule_follow_up_after_ai_response(lead_id: str) -> Optional[str]:
    """
    Agenda o follow-up Stage 1 após a IA responder.
    Chamado pelo buffer_service após enviar a resposta da IA.
    """
    service = FollowUpService()
    return service.schedule_initial_follow_up(lead_id)


def execute_due_follow_ups() -> Dict[str, int]:
    """
    Executa follow-ups pendentes que já estão no horário.
    Chamado pelo webhook do cron job do Supabase.
    """
    service = FollowUpService()
    return service.execute_due_follow_ups()


def cancel_follow_ups_for_lead(lead_id: str) -> int:
    """
    Cancela follow-ups quando o lead responde.
    Chamado pelo message_service.
    """
    service = FollowUpService()
    return service.cancel_pending_follow_ups(lead_id)


# Legacy — mantido para compatibilidade com scheduler existente
def process_follow_ups() -> Dict[str, int]:
    """Compatibilidade com o scheduler antigo. Agora delegado para execute_due_follow_ups."""
    return execute_due_follow_ups()
