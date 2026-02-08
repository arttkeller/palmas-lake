"""
Debug router for message diagnostics.

Provides endpoints to diagnose message loading issues in the CRM.
Implements Requirements 5.1, 5.2, 5.3.
"""

from fastapi import APIRouter, HTTPException
from services.supabase_client import create_client
from typing import List, Dict, Any, Optional
import logging

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

router = APIRouter()


def get_diagnostic_hints(conversation_id: str, message_count: int, conversation_exists: bool) -> List[str]:
    """
    Generate diagnostic hints when zero messages are found.
    
    Implements Requirement 5.3: Include diagnostic hints when zero messages found.
    
    Args:
        conversation_id: The conversation ID being queried
        message_count: Number of messages found
        conversation_exists: Whether the conversation exists in the database
    
    Returns:
        List of diagnostic hints
    """
    hints = []
    
    if not conversation_exists:
        hints.append(f"Conversation {conversation_id} does not exist in the database")
        hints.append("Verify the conversation_id is correct and the conversation was created")
        return hints
    
    if message_count == 0:
        hints.append("No messages found for this conversation")
        hints.append("Possible causes:")
        hints.append("  1. Messages were never saved to this conversation")
        hints.append("  2. Messages exist in a different schema (check Accept-Profile header)")
        hints.append("  3. RLS policies may be blocking access (check anon role permissions)")
        hints.append("  4. The conversation_id may be incorrect")
        hints.append("Recommended actions:")
        hints.append("  - Verify the schema is 'palmaslake-agno'")
        hints.append("  - Check RLS policies allow SELECT on messages table for anon role")
        hints.append("  - Verify messages exist by querying directly in Supabase dashboard")
    
    return hints


@router.get("/debug/conversations")
def debug_conversations() -> Dict[str, Any]:
    """
    Returns all conversations with their message counts for diagnostics.
    
    Implements Requirement 5.2: GET /api/debug/conversations returns all 
    conversations with their message counts.
    
    Returns:
        Dict containing:
        - conversations: List of conversations with message counts
        - total_conversations: Total number of conversations
        - schema: The schema being used
    """
    try:
        supabase = create_client()
        
        # Fetch all conversations with lead info
        conv_result = supabase.table("conversations").select(
            "id, lead_id, platform, last_message, updated_at, leads(full_name, phone)"
        ).order("updated_at", direction="desc").execute()
        
        conversations = conv_result.data if conv_result.data else []
        
        # For each conversation, get message count
        conversations_with_counts = []
        for conv in conversations:
            try:
                # Count messages for this conversation
                msg_result = supabase.table("messages").select("id").eq(
                    "conversation_id", conv["id"]
                ).execute()
                
                message_count = len(msg_result.data) if msg_result.data else 0
                
                conversations_with_counts.append({
                    "id": conv["id"],
                    "lead_id": conv["lead_id"],
                    "platform": conv.get("platform"),
                    "last_message": conv.get("last_message"),
                    "updated_at": conv.get("updated_at"),
                    "lead": conv.get("leads"),
                    "message_count": message_count
                })
            except Exception as e:
                logger.error(f"Error counting messages for conversation {conv['id']}: {e}")
                conversations_with_counts.append({
                    "id": conv["id"],
                    "lead_id": conv["lead_id"],
                    "platform": conv.get("platform"),
                    "last_message": conv.get("last_message"),
                    "updated_at": conv.get("updated_at"),
                    "lead": conv.get("leads"),
                    "message_count": -1,  # Indicates error
                    "error": str(e)
                })
        
        logger.info(f"Debug: Found {len(conversations_with_counts)} conversations")
        
        return {
            "conversations": conversations_with_counts,
            "total_conversations": len(conversations_with_counts),
            "schema": "palmaslake-agno"
        }
        
    except Exception as e:
        logger.error(f"Error in debug_conversations: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch conversations: {str(e)}"
        )


@router.get("/debug/messages/{conversation_id}")
def debug_messages(conversation_id: str) -> Dict[str, Any]:
    """
    Returns count and sample of messages for a conversation.
    
    Implements Requirement 5.1: GET /api/debug/messages/{conversation_id} 
    returns the count of messages and a sample of the first 3 messages.
    
    Implements Requirement 5.3: Include diagnostic hints when zero messages found.
    
    Args:
        conversation_id: UUID of the conversation to diagnose
    
    Returns:
        Dict containing:
        - conversation_id: The queried conversation ID
        - count: Total number of messages
        - sample: First 3 messages (or fewer if less exist)
        - hints: Diagnostic hints if issues detected
        - schema: The schema being used
    """
    try:
        supabase = create_client()
        
        # First, verify the conversation exists
        conv_result = supabase.table("conversations").select(
            "id, lead_id, platform, last_message"
        ).eq("id", conversation_id).execute()
        
        conversation_exists = bool(conv_result.data and len(conv_result.data) > 0)
        conversation_data = conv_result.data[0] if conversation_exists else None
        
        # Fetch all messages for this conversation
        msg_result = supabase.table("messages").select("*").eq(
            "conversation_id", conversation_id
        ).order("created_at", direction="asc").execute()
        
        messages = msg_result.data if msg_result.data else []
        message_count = len(messages)
        
        # Get sample of first 3 messages
        sample = messages[:3] if messages else []
        
        # Generate diagnostic hints if needed
        hints = get_diagnostic_hints(conversation_id, message_count, conversation_exists)
        
        logger.info(f"Debug: Conversation {conversation_id} has {message_count} messages")
        
        response = {
            "conversation_id": conversation_id,
            "conversation_exists": conversation_exists,
            "conversation": conversation_data,
            "count": message_count,
            "sample": sample,
            "schema": "palmaslake-agno"
        }
        
        # Only include hints if there are issues
        if hints:
            response["hints"] = hints
        
        return response
        
    except Exception as e:
        logger.error(f"Error in debug_messages for {conversation_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch messages: {str(e)}"
        )


@router.post("/debug/test-save-message")
def test_save_message(phone: str = "5527998724593", content: str = "Mensagem de teste") -> Dict[str, Any]:
    """
    Test endpoint to verify message saving works correctly.
    """
    try:
        from services.message_service import MessageService
        msg_service = MessageService()
        
        remote_jid = f"{phone}@s.whatsapp.net"
        result = msg_service.save_message(remote_jid, content, "lead", whatsapp_msg_id="test-debug-001")
        
        return {
            "success": result is not None,
            "conversation_id": result,
            "phone": phone,
            "content": content
        }
    except Exception as e:
        logger.error(f"Error in test_save_message: {e}")
        return {
            "success": False,
            "error": str(e)
        }
