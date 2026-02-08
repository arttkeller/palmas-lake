
import asyncio
from typing import Dict, List
from services.agent_manager import AgentManager
from services.uazapi_service import UazapiService
from services.meta_service import MetaService

# Simple in-memory buffer for MVP. Use Redis for production.
message_buffer: Dict[str, List[tuple]] = {}
buffer_locks: Dict[str, asyncio.Lock] = {}
# Track which channel each lead_id uses (whatsapp or instagram)
channel_map: Dict[str, str] = {}

agent = AgentManager()
uazapi = UazapiService()
meta = MetaService()

async def add_to_buffer(lead_id: str, message_content: str, message_id: str = None, channel: str = "whatsapp"):
    """
    Add a message to the buffer for a lead. Messages are batched and processed
    after a 2-second delay.
    
    Args:
        lead_id: Identifier for the lead (phone for WhatsApp, ig:<igsid> for Instagram)
        message_content: Text content of the message
        message_id: Platform message ID (optional)
        channel: "whatsapp" or "instagram"
    """
    if lead_id not in buffer_locks:
        buffer_locks[lead_id] = asyncio.Lock()
    
    # Store the channel for this lead
    channel_map[lead_id] = channel
    
    async with buffer_locks[lead_id]:
        if lead_id not in message_buffer:
            message_buffer[lead_id] = []
            # Start timer for this new batch
            asyncio.create_task(process_buffer_after_delay(lead_id))
        
        message_buffer[lead_id].append((message_content, message_id))

async def process_buffer_after_delay(lead_id: str):
    await asyncio.sleep(2.0) # Wait 2 seconds for more messages
    
    async with buffer_locks[lead_id]:
        messages_with_ids = message_buffer.pop(lead_id, [])
        channel = channel_map.pop(lead_id, "whatsapp")
        if not messages_with_ids:
            return

        print(f"Processing buffered messages for {lead_id} (channel: {channel}): {messages_with_ids}")
        
        # Call Agent
        try:
            # Pass (content, id) list
            response = await agent.process_message_buffer(lead_id, messages_with_ids)
            print(f"Agent Response for {lead_id}: {response}")
            
            if response and response != "IGNORED_DUPLICATE":
                # Split messages by double newline to send "picotado"
                parts = [p.strip() for p in response.split('\n\n') if p.strip()]
                
                from services.message_service import MessageService
                msg_service = MessageService()
                
                for part in parts:
                    # Send via the appropriate channel
                    try:
                        print(f"[Buffer] Sending message via {channel} to {lead_id}: {part[:50]}...")
                        _send_message(lead_id, part, channel)
                        print(f"[Buffer] Message sent successfully via {channel}")
                    except Exception as send_err:
                        import traceback
                        print(f"[Buffer] ERROR sending message via {channel}: {send_err}")
                        traceback.print_exc()
                    
                    # Save each part to DB
                    try:
                        msg_service.save_message(lead_id, part, "ai")
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
                        lead_res = sb.table("leads").select("id").eq("phone", lead_id).execute()
                    
                    if lead_res.data and len(lead_res.data) > 0:
                        real_lead_id = lead_res.data[0]["id"]
                        schedule_follow_up_after_ai_response(real_lead_id)
                except Exception as fu_err:
                    print(f"[FollowUp] Erro ao agendar follow-up (nao fatal): {fu_err}")
            
        except Exception as e:
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
    else:
        uazapi.send_whatsapp_message(lead_id, text)
