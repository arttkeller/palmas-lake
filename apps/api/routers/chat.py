
from fastapi import APIRouter, HTTPException, Depends
from services.message_service import MessageService

router = APIRouter()
service = MessageService()

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

@router.get("/chat/messages/{conversation_id}")
def get_messages(conversation_id: str):
    """
    Returns all messages for a specific conversation.
    """
    messages = service.get_messages(conversation_id)
    return messages if messages else []
