"""
Follow-ups API Router

Endpoints:
- POST /follow-ups/process    → Manual trigger (compatibilidade)
- POST /webhook/follow-up-cron → Chamado pelo cron job do Supabase
- GET  /follow-ups/status      → Status da fila
- POST /event-reminders/process → Trigger manual de lembretes de visita (1h)
- GET  /event-reminders/status  → Status dos lembretes de visita
"""

from fastapi import APIRouter, Request
from services.follow_up_service import execute_due_follow_ups, FollowUpService
from services.event_reminder_service import (
    execute_due_event_reminders,
    get_event_reminder_status as get_event_reminder_status_service,
)

router = APIRouter()


@router.post("/follow-ups/process")
def trigger_follow_up_processing():
    """
    Trigger manual de processamento de follow-ups.
    Executa os follow-ups pendentes que já passaram do scheduled_at.
    """
    try:
        results = execute_due_follow_ups()
        return {"status": "ok", "results": results}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.post("/webhook/follow-up-cron")
async def follow_up_cron_webhook(request: Request):
    """
    Webhook chamado pelo cron job do Supabase (pg_cron + pg_net).
    Roda a cada 5 minutos para executar follow-ups pendentes.
    
    Fluxo:
    1. Supabase pg_cron dispara a cada 5 minutos
    2. pg_net faz POST para este endpoint
    3. Este endpoint busca follow-ups pendentes com scheduled_at <= now()
    4. Envia as mensagens via WhatsApp
    5. Agenda o próximo stage automaticamente
    6. Processa lembretes de visita (1h antes do agendamento)
    """
    try:
        follow_up_results = execute_due_follow_ups()
        reminder_results = execute_due_event_reminders()

        return {
            "status": "ok",
            "follow_ups": follow_up_results,
            "event_reminders": reminder_results,
            "message": (
                f"Follow-ups executados: {follow_up_results.get('executed', 0)}, "
                f"proximos agendados: {follow_up_results.get('next_scheduled', 0)}, "
                f"lembretes 1h enviados: {reminder_results.get('sent', 0)}"
            ),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "error": str(e)}


@router.get("/follow-ups/status")
def get_follow_up_status():
    """
    Retorna status detalhado da fila de follow-ups.
    """
    try:
        service = FollowUpService()
        status = service.get_queue_status()
        return {"status": "ok", **status}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.post("/event-reminders/process")
def trigger_event_reminder_processing():
    """
    Trigger manual do processamento dos lembretes 1h antes da visita.
    """
    try:
        results = execute_due_event_reminders()
        return {"status": "ok", "results": results}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.get("/event-reminders/status")
def get_event_reminders_status():
    """
    Retorna status dos lembretes de visita para as proximas 24h.
    """
    try:
        status = get_event_reminder_status_service()
        return {"status": "ok", **status}
    except Exception as e:
        return {"status": "error", "error": str(e)}
