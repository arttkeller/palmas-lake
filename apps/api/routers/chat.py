
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from services.message_service import MessageService
from services.supabase_client import create_client

router = APIRouter()
service = MessageService()


class SendMessageRequest(BaseModel):
    lead_id: str
    content: str

@router.get("/chat/conversations")
def get_conversations():
    """
    Returns a list of all active conversations.
    """
    conversations = service.get_conversations()
    return conversations if conversations else []

@router.get("/chat/conversations/by-lead/{lead_id}")
def get_conversation_by_lead(lead_id: str):
    """
    Returns the conversation for a specific lead.
    """
    conversation = service.get_conversation_by_lead(lead_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found for this lead")
    return conversation

@router.get("/chat/conversations/all-by-lead/{lead_id}")
def get_all_conversations_by_lead(lead_id: str):
    """
    Returns ALL conversations for a lead (WhatsApp + Instagram).
    """
    conversations = service.get_all_conversations_by_lead(lead_id)
    return conversations if conversations else []

@router.get("/chat/messages/by-lead/{lead_id}")
def get_messages_by_lead(lead_id: str):
    """
    Returns ALL messages across ALL conversations for a lead, with platform info.
    """
    messages = service.get_messages_by_lead(lead_id)
    return messages if messages else []

@router.get("/chat/messages/{conversation_id}")
def get_messages(conversation_id: str):
    """
    Returns all messages for a specific conversation.
    """
    messages = service.get_messages(conversation_id)
    return messages if messages else []


@router.post("/chat/messages/send")
def send_message_to_lead(req: SendMessageRequest):
    """
    Send a manual message from the dashboard to a lead via WhatsApp/Instagram.
    Auto-pauses AI for this lead.
    """
    supabase = create_client()

    # 1. Buscar lead
    lead_res = supabase.table("leads").select("*").eq("id", req.lead_id).execute()
    if not lead_res.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead_data = lead_res.data[0]

    # 2. Determinar canal (última conversa ativa)
    conv_res = supabase.table("conversations").select("id, platform").eq(
        "lead_id", req.lead_id
    ).order("updated_at", desc=True).limit(1).execute()
    platform = conv_res.data[0]["platform"] if conv_res.data else "whatsapp"

    # 3. Enviar via canal apropriado
    if platform == "instagram" and lead_data.get("instagram_id"):
        from services.meta_service import MetaService
        meta = MetaService()
        meta.send_instagram_message(lead_data["instagram_id"], req.content)
    else:
        from services.uazapi_service import UazapiService
        uazapi = UazapiService()
        phone = lead_data.get("phone", "")
        uazapi.send_whatsapp_message(phone, req.content)

    # 4. Salvar no banco
    if platform == "instagram" and lead_data.get("instagram_id"):
        remote_jid = f'ig:{lead_data["instagram_id"]}'
    else:
        remote_jid = lead_data.get("phone", "")
    service.save_message(remote_jid, req.content, "user")

    # 5. Auto-pausar IA
    supabase.table("leads").update({"ai_paused": True}).eq("id", req.lead_id).execute()

    return {"status": "sent", "platform": platform, "ai_paused": True}


@router.post("/chat/toggle-ai/{lead_id}")
def toggle_ai(lead_id: str):
    """
    Toggle AI pause state for a lead.
    """
    supabase = create_client()
    lead_res = supabase.table("leads").select("ai_paused").eq("id", lead_id).execute()
    if not lead_res.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    current = lead_res.data[0].get("ai_paused", False)
    new_value = not current
    supabase.table("leads").update({"ai_paused": new_value}).eq("id", lead_id).execute()
    return {"ai_paused": new_value}


@router.get("/chat/ai-status/{lead_id}")
def get_ai_status(lead_id: str):
    """
    Get AI pause status for a lead.
    """
    supabase = create_client()
    lead_res = supabase.table("leads").select("ai_paused").eq("id", lead_id).execute()
    if not lead_res.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ai_paused": lead_res.data[0].get("ai_paused", False)}
