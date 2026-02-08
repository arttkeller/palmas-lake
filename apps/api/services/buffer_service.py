
import asyncio
from typing import Dict, List
from services.agent_manager import AgentManager
from services.uazapi_service import UazapiService

# Simple in-memory buffer for MVP. Use Redis for production.
message_buffer: Dict[str, List[tuple]] = {}
buffer_locks: Dict[str, asyncio.Lock] = {}

agent = AgentManager()
uazapi = UazapiService()

async def add_to_buffer(lead_id: str, message_content: str, message_id: str = None):
    if lead_id not in buffer_locks:
        buffer_locks[lead_id] = asyncio.Lock()
    
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
        if not messages_with_ids:
            return

        print(f"Processing buffered messages for {lead_id}: {messages_with_ids}")
        
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
                    uazapi.send_whatsapp_message(lead_id, part)
                    
                    # Save each part to DB
                    try:
                        msg_service.save_message(lead_id, part, "ai")
                    except Exception as db_err:
                        print(f"DB Error saving AI response part: {db_err}")
                    
                    # Small delay between parts to feel natural
                    await asyncio.sleep(1.5)

                # Após IA responder, agendar follow-up Stage 1 (2h)
                # Se o lead não responder em 2h, o cron job do Supabase dispara a mensagem
                try:
                    from services.follow_up_service import schedule_follow_up_after_ai_response
                    # Precisamos do lead_id real (UUID) — buscar pelo phone
                    from services.supabase_client import create_client
                    sb = create_client()
                    lead_res = sb.table("leads").select("id").eq("phone", lead_id).execute()
                    if lead_res.data and len(lead_res.data) > 0:
                        real_lead_id = lead_res.data[0]["id"]
                        schedule_follow_up_after_ai_response(real_lead_id)
                except Exception as fu_err:
                    print(f"[FollowUp] Erro ao agendar follow-up (não fatal): {fu_err}")
            
        except Exception as e:
            print(f"Error acting on buffer: {e}")
