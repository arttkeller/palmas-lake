from fastapi import APIRouter, Request, HTTPException
from services.uazapi_service import UazapiService
from services.meta_service import MetaService
from services.buffer_service import add_to_buffer
from services.analytics_service import AnalyticsService
from services.analytics_cache_service import AnalyticsCacheService
import asyncio
import os

router = APIRouter()
uazapi = UazapiService()
meta_service = MetaService()

# Analytics cache service for queueing recalculations — must include AnalyticsService
# so that background processing can actually compute metrics
_analytics_service = AnalyticsService()
analytics_cache_service = AnalyticsCacheService(analytics_service=_analytics_service)
analytics_cache_service.setup_background_processing()

# Comando especial para limpar dados de teste
CLEAR_COMMAND = "#apagar"

async def handle_clear_command(remote_jid: str) -> bool:
    """
    Limpa todos os dados do lead para facilitar testes.
    Apaga: lead, conversas, mensagens, eventos.
    """
    try:
        from services.supabase_client import create_client
        supabase = create_client()
        
        # Extrair telefone do JID
        phone = remote_jid.split('@')[0] if '@' in remote_jid else remote_jid
        
        print(f"🗑️ [CLEAR] Iniciando limpeza para: {phone}")
        
        # 1. Buscar o lead pelo telefone
        lead_res = supabase.table("leads").select("id").eq("phone", phone).execute()
        
        if not lead_res.data:
            print(f"🗑️ [CLEAR] Lead não encontrado para {phone}")
            # Enviar mensagem de confirmação mesmo assim
            uazapi_service = UazapiService()
            uazapi_service.send_whatsapp_message(
                remote_jid, 
                "✅ Nenhum dado encontrado para limpar. Você pode começar uma nova conversa!"
            )
            return True
            
        lead_id = lead_res.data[0]["id"]
        print(f"🗑️ [CLEAR] Lead encontrado: {lead_id}")
        
        # 2. Buscar e deletar conversas (mensagens serão deletadas em cascata)
        conv_res = supabase.table("conversations").select("id").eq("lead_id", lead_id).execute()
        
        if conv_res.data:
            for conv in conv_res.data:
                # Deletar mensagens da conversa
                supabase.table("messages").delete().eq("conversation_id", conv["id"]).execute()
                print(f"🗑️ [CLEAR] Mensagens deletadas da conversa {conv['id']}")
            
            # Deletar conversas
            supabase.table("conversations").delete().eq("lead_id", lead_id).execute()
            print(f"🗑️ [CLEAR] Conversas deletadas")
        
        # 3. Deletar eventos/agendamentos do lead
        try:
            supabase.table("events").delete().eq("lead_id", lead_id).execute()
            print(f"🗑️ [CLEAR] Eventos deletados")
        except Exception as e:
            print(f"🗑️ [CLEAR] Erro ao deletar eventos (pode não existir): {e}")
        
        # 4. Deletar o lead
        supabase.table("leads").delete().eq("id", lead_id).execute()
        print(f"🗑️ [CLEAR] Lead deletado")
        
        # 5. Enviar mensagem de confirmação
        uazapi_service = UazapiService()
        uazapi_service.send_whatsapp_message(
            remote_jid, 
            "✅ *Dados limpos com sucesso!*\n\n"
            "Todos os seus dados foram apagados:\n"
            "• Lead removido\n"
            "• Conversas apagadas\n"
            "• Agendamentos removidos\n\n"
            "Envie qualquer mensagem para começar uma nova conversa de teste!"
        )
        
        print(f"🗑️ [CLEAR] Limpeza concluída para {phone}")
        return True
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"🗑️ [CLEAR] Erro na limpeza: {e}")
        
        # Tentar enviar mensagem de erro
        try:
            uazapi_service = UazapiService()
            uazapi_service.send_whatsapp_message(
                remote_jid, 
                f"❌ Erro ao limpar dados: {str(e)}"
            )
        except:
            pass
            
        return False

@router.post("/webhook/uazapi")
async def handle_uazapi_webhook(request: Request):
    """
    Receive incoming messages from UazAPI.
    Payload structure: Evolution API (v2)
    """
    try:
        data = await request.json()
        print("Received UazAPI Webhook:", data)
        
        # 1. Handle Evolution API v2 (event: messages.upsert)
        event = data.get("event")
        if event == "messages.upsert":
            msg_data = data.get("data", {})
            key = msg_data.get("key", {})
            if key.get("fromMe"): return {"status": "ignored"}
            
            remote_jid = key.get("remoteJid")
            message_obj = msg_data.get("message", {})
            text = message_obj.get("conversation") or message_obj.get("extendedTextMessage", {}).get("text")
            
        # 2. Handle BlackAI / Direct UazAPI (EventType: messages)
        elif data.get("EventType") == "messages":
            message_info = data.get("message", {})
            if message_info.get("fromMe"): return {"status": "ignored"}
            
            remote_jid = message_info.get("chatid") or message_info.get("sender")
            text = message_info.get("text") or message_info.get("content")
        
        else:
            print(f"Unknown event type: {event or data.get('EventType')}")
            return {"status": "unknown_event"}

        # Attempt to parse JSON content (Button/List replies)
        if text and isinstance(text, str) and text.strip().startswith('{'):
            try:
                import json
                payload = json.loads(text)
                # Common fields for button responses
                if 'selectedID' in payload:
                    text = payload['selectedID']
                elif 'title' in payload:
                    text = payload['title']
                elif 'rows' in payload and len(payload['rows']) > 0:
                    text = payload['rows'][0].get('title', text)
                print(f"Parsed JSON message content: {text}")
            except Exception as e:
                print(f"Failed to parse JSON message content: {e}")

        if remote_jid and text:
            # Verificar comando especial #apagar
            if text.strip().lower() == CLEAR_COMMAND:
                print(f"🗑️ [CLEAR] Comando de limpeza recebido de {remote_jid}")
                await handle_clear_command(remote_jid)
                return {"status": "cleared"}
            
            msg_id = None
            if event == "messages.upsert":
                msg_id = msg_data.get("key", {}).get("id")
            elif data.get("EventType") == "messages":
                msg_id = message_info.get("id")
                
            print(f"Processing message from {remote_jid} (ID: {msg_id}): {text}")
            
            # Save User Message to DB
            try:
                from services.message_service import MessageService
                msg_service = MessageService()
                print(f"[Webhook] Calling save_message for lead message...")
                result = msg_service.save_message(remote_jid, text, "lead", whatsapp_msg_id=msg_id)
                print(f"[Webhook] save_message result: {result}")
                
                # Queue analytics recalculation (non-blocking)
                # Uses asyncio.create_task to ensure webhook response is not blocked
                asyncio.create_task(
                    analytics_cache_service.queue_recalculation('message_webhook')
                )
            except Exception as db_err:
                import traceback
                print(f"DB Error: {db_err}")
                traceback.print_exc()

            await add_to_buffer(remote_jid, text, msg_id)
                
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error processing webhook: {e}")
    
    return {"status": "received"}

@router.get("/webhook/meta")
async def verify_webhook(request: Request):
    """
    Meta (Facebook) Verification Challenge.
    Used when configuring the webhook URL in Meta Developer dashboard.
    """
    verify_token = os.environ.get("META_VERIFY_TOKEN", "")
    
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == verify_token:
            print(f"[Meta Webhook] Verification successful")
            return int(challenge)
        else:
            print(f"[Meta Webhook] Verification failed: token mismatch")
            raise HTTPException(status_code=403, detail="Verification failed")
    return {"status": "ok"}

@router.post("/webhook/meta")
async def handle_webhook(request: Request):
    """
    Receive incoming Instagram DM messages via Meta Webhooks.
    Parses the Instagram Messaging payload and processes through the same AI pipeline.
    """
    try:
        data = await request.json()
        print("[Meta Webhook] Received:", data)

        obj_type = data.get("object")
        if obj_type != "instagram":
            print(f"[Meta Webhook] Ignoring non-instagram object: {obj_type}")
            return {"status": "ignored"}

        page_id = os.environ.get("META_INSTAGRAM_PAGE_ID", "")

        for entry in data.get("entry", []):
            for messaging_event in entry.get("messaging", []):
                sender_id = messaging_event.get("sender", {}).get("id")
                recipient_id = messaging_event.get("recipient", {}).get("id")
                message = messaging_event.get("message", {})
                text = message.get("text")
                msg_id = message.get("mid")

                # Ignore echo messages (sent by our page)
                if message.get("is_echo"):
                    print(f"[Meta Webhook] Ignoring echo message")
                    continue

                # Ignore if sender is our own page
                if sender_id == page_id:
                    print(f"[Meta Webhook] Ignoring message from our own page")
                    continue

                if not sender_id or not text:
                    print(f"[Meta Webhook] Missing sender_id or text, skipping")
                    continue

                # Use ig: prefix to differentiate Instagram leads from WhatsApp
                lead_identifier = f"ig:{sender_id}"
                print(f"[Meta Webhook] Processing Instagram DM from {lead_identifier}: {text}")

                # Fetch Instagram profile (name + username) for the sender
                ig_profile = meta_service.get_instagram_profile(sender_id)
                if ig_profile:
                    print(f"[Meta Webhook] Instagram profile: {ig_profile}")
                else:
                    print(f"[Meta Webhook] Could not fetch Instagram profile for {sender_id}")

                # Save message to DB
                try:
                    from services.message_service import MessageService
                    msg_service = MessageService()
                    result = msg_service.save_message(
                        lead_identifier, text, "lead",
                        whatsapp_msg_id=msg_id,
                        ig_profile=ig_profile
                    )
                    print(f"[Meta Webhook] save_message result: {result}")

                    asyncio.create_task(
                        analytics_cache_service.queue_recalculation('message_webhook')
                    )
                except Exception as db_err:
                    import traceback
                    print(f"[Meta Webhook] DB Error: {db_err}")
                    traceback.print_exc()

                # Send to buffer with instagram channel
                await add_to_buffer(lead_identifier, text, msg_id, channel="instagram")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Meta Webhook] Error processing: {e}")

    # Always return 200 to acknowledge receipt (Meta requirement)
    return {"status": "received"}
