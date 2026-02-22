from fastapi import APIRouter, Request, HTTPException
from services.uazapi_service import UazapiService
from services.meta_service import MetaService
from services.audio_transcription_service import AudioTranscriptionService
from services.buffer_service import add_to_buffer
from services.analytics_service import AnalyticsService
from services.analytics_cache_service import AnalyticsCacheService
import asyncio
import os
import requests as http_requests
from typing import Any, Dict, Optional, Tuple

router = APIRouter()
uazapi = UazapiService()
meta_service = MetaService()
audio_transcription_service = AudioTranscriptionService()

# Analytics cache service for queueing recalculations — must include AnalyticsService
# so that background processing can actually compute metrics
_analytics_service = AnalyticsService()
analytics_cache_service = AnalyticsCacheService(analytics_service=_analytics_service)
analytics_cache_service.setup_background_processing()

# Comando especial para limpar dados de teste
CLEAR_COMMAND = "#apagar"

import re as _re

# ──────────────────────────────────────────────────────────────
# SPAM / BOT / ADVERTISEMENT FILTER
# ──────────────────────────────────────────────────────────────

# Keywords that strongly indicate promotional/spam messages
_SPAM_KEYWORDS = {
    "promoção", "promocao", "oferta imperdível", "oferta imperdivel",
    "desconto exclusivo", "compre agora", "comprar agora",
    "clique aqui", "click aqui", "saiba mais em",
    "aproveite já", "aproveite ja", "por tempo limitado",
    "ligue agora", "televendas", "0800", "assine já", "assine ja",
    "faça seu pedido", "faca seu pedido", "plano de",
    "fibra", "mega", "combo", "r$/mês", "r$/mes",
    "cashback", "frete grátis", "frete gratis",
    "link na bio", "arraste pra cima",
}

# Regex patterns for spam detection
_SPAM_PATTERNS = [
    _re.compile(r'R\$\s*\d+[.,]\d{2}', _re.IGNORECASE),           # Price: R$ 99,90
    _re.compile(r'\d+x\s*de\s*R\$', _re.IGNORECASE),               # Installments: 12x de R$
    _re.compile(r'(?:http[s]?://\S+){2,}', _re.IGNORECASE),        # Multiple URLs
    _re.compile(r'bit\.ly|tinyurl|short\.link|cutt\.ly', _re.IGNORECASE),  # URL shorteners
    _re.compile(r'0800[-\s]?\d{3}[-\s]?\d{4}', _re.IGNORECASE),   # 0800 toll-free
    _re.compile(r'(?:opção|opcao)\s*\d\s*:', _re.IGNORECASE),      # "Opção 1:" menu style
    _re.compile(r'(?:plano|pacote)\s+\w+.*\d+\s*(?:mega|gb|mbps)', _re.IGNORECASE),  # Internet plans
    _re.compile(r'(?:claro|vivo|tim|oi|net)\s+(?:fibra|combo|multi|controle|pós|pre)', _re.IGNORECASE),  # Telecom brands
    _re.compile(r'(?:chatgpt|netflix|globoplay|disney|hbo|spotify|deezer)\s+(?:plus|premium|grátis|free)', _re.IGNORECASE),  # Streaming bundles
]

# Patterns that indicate automated/bot messages
_BOT_PATTERNS = [
    _re.compile(r'(?:confirme|valide|verifique)\s+(?:sua|seu)\s+(?:identidade|conta|cadastro)', _re.IGNORECASE),
    _re.compile(r'(?:código|codigo)\s+(?:de\s+)?(?:verificação|verificacao|segurança|seguranca)', _re.IGNORECASE),
    _re.compile(r'seu\s+(?:código|codigo)\s+é\s*:?\s*\d', _re.IGNORECASE),
    _re.compile(r'(?:pix|transferência|transferencia)\s+(?:recebid[ao]|confirmad[ao]|pendente)', _re.IGNORECASE),
    _re.compile(r'(?:boleto|fatura|cobrança|cobranca)\s+(?:vencid|disponível|gerad)', _re.IGNORECASE),
    _re.compile(r'(?:entrega|pedido|encomenda)\s+(?:n[°ºo]|número|numero|código|codigo)', _re.IGNORECASE),
]


def _is_spam_or_bot(text: str) -> bool:
    """
    Detect spam, bot messages, or advertisements.
    Returns True if the message should be ignored.
    """
    if not text or len(text) < 10:
        return False

    text_lower = text.lower()

    # 1. Keyword match (need at least 2 matches for short texts, 1 for long promo-like texts)
    keyword_hits = sum(1 for kw in _SPAM_KEYWORDS if kw in text_lower)
    if keyword_hits >= 2:
        print(f"[SpamFilter] Keyword match ({keyword_hits} hits)")
        return True

    # 2. Regex pattern match
    pattern_hits = sum(1 for p in _SPAM_PATTERNS if p.search(text))
    if pattern_hits >= 2:
        print(f"[SpamFilter] Pattern match ({pattern_hits} hits)")
        return True

    # 3. Combined: 1 keyword + 1 pattern = spam
    if keyword_hits >= 1 and pattern_hits >= 1:
        print(f"[SpamFilter] Combined match (kw={keyword_hits}, pat={pattern_hits})")
        return True

    # 4. Bot message patterns (1 match is enough)
    for p in _BOT_PATTERNS:
        if p.search(text):
            print(f"[SpamFilter] Bot pattern match")
            return True

    # 5. Heuristic: very long message (>500 chars) with prices = promo
    if len(text) > 500 and any(p.search(text) for p in _SPAM_PATTERNS[:2]):
        print(f"[SpamFilter] Long promo message ({len(text)} chars)")
        return True

    return False


_AUDIO_TYPE_HINTS = {"audio", "ptt", "voice", "voicenote", "voice_note"}
_AUDIO_KEYS = {
    "audiomessage",
    "pttmessage",
    "audio",
    "voice",
    "voicenote",
    "voice_note",
}


def _is_uazapi_audio_message(message_info: Dict[str, Any]) -> bool:
    """
    Detecta se o payload EventType=messages representa um áudio da UazAPI.
    """
    if not isinstance(message_info, dict):
        return False

    message_type = str(message_info.get("messageType", "")).lower()
    media_type = str(message_info.get("mediaType", "")).lower()
    generic_type = str(message_info.get("type", "")).lower()

    if "audio" in message_type:
        return True
    if media_type in {"audio", "ptt", "voice", "voicenote"}:
        return True

    content = message_info.get("content")
    if isinstance(content, dict):
        content_mimetype = str(content.get("mimetype", "")).lower()
        if content_mimetype.startswith("audio/"):
            return True
        if bool(content.get("PTT")) or bool(content.get("ptt")):
            return True
        if "waveform" in content:
            return True

    return generic_type in {"audio", "ptt"}


def _extract_text_from_message_payload(payload: Dict[str, Any]) -> Optional[str]:
    """
    Extrai texto de payloads WhatsApp em diferentes formatos (incluindo wrappers).
    """
    if not isinstance(payload, dict):
        return None

    conversation = payload.get("conversation")
    if isinstance(conversation, str) and conversation.strip():
        return conversation

    ext_text = payload.get("extendedTextMessage", {})
    if isinstance(ext_text, dict):
        text = ext_text.get("text")
        if isinstance(text, str) and text.strip():
            return text

    for key in ("imageMessage", "videoMessage", "documentMessage"):
        media_obj = payload.get(key, {})
        if isinstance(media_obj, dict):
            caption = media_obj.get("caption")
            if isinstance(caption, str) and caption.strip():
                return caption

    for value in payload.values():
        if isinstance(value, dict):
            found_text = _extract_text_from_message_payload(value)
            if found_text:
                return found_text
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    found_text = _extract_text_from_message_payload(item)
                    if found_text:
                        return found_text

    return None


def _find_audio_payload(payload: Any) -> Optional[Dict[str, Any]]:
    """
    Procura por conteúdo de áudio em payloads de webhook.
    """
    if not isinstance(payload, dict):
        return None

    payload_type = str(payload.get("type", "")).lower()
    is_audio_type = payload_type in _AUDIO_TYPE_HINTS
    if is_audio_type:
        media_obj = payload.get("media")
        if isinstance(media_obj, dict):
            return media_obj

    # UazAPI often sends audio inside "content" with metadata fields.
    lowered = {str(k).lower(): v for k, v in payload.items()}
    content_mimetype = str(lowered.get("mimetype", "")).lower()
    if content_mimetype.startswith("audio/"):
        return payload
    if bool(payload.get("PTT")) or bool(payload.get("ptt")):
        return payload
    if "waveform" in payload:
        return payload

    for key, value in payload.items():
        if key.lower() in _AUDIO_KEYS and isinstance(value, dict):
            return value

    for value in payload.values():
        if isinstance(value, dict):
            found = _find_audio_payload(value)
            if found:
                return found
        elif isinstance(value, list):
            for item in value:
                found = _find_audio_payload(item)
                if found:
                    return found

    if is_audio_type:
        return payload

    return None


def _extract_audio_source(audio_payload: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], str]:
    """
    Extrai URL/base64 e filename de um payload de áudio.
    """
    if not isinstance(audio_payload, dict):
        return None, None, "audio.m4a"

    # Normaliza chaves para suportar variações da UazAPI (ex.: AudioMessage, URL, etc.)
    lowered = {str(k).lower(): v for k, v in audio_payload.items()}

    url = None
    for key in ("url", "mediaurl", "downloadurl", "link", "file", "audiourl", "audio_url"):
        value = lowered.get(key)
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.startswith("http://") or normalized.startswith("https://"):
                url = normalized
                break

    if not url:
        nested_payload = lowered.get("payload")
        if isinstance(nested_payload, dict):
            nested_url, _, _ = _extract_audio_source(nested_payload)
            url = nested_url

    base64_audio = None
    for key in ("base64", "audiobase64", "data", "audiodata", "audio_data"):
        value = lowered.get(key)
        if isinstance(value, str) and value.strip():
            base64_audio = value.strip()
            break

    if not base64_audio:
        nested_payload = lowered.get("payload")
        if isinstance(nested_payload, dict):
            _, nested_base64, _ = _extract_audio_source(nested_payload)
            base64_audio = nested_base64

    filename = (
        lowered.get("filename")
        or lowered.get("name")
        or lowered.get("file")
        or "audio.m4a"
    )

    if "." not in str(filename):
        filename = f"{filename}.m4a"

    return url, base64_audio, str(filename)


def _decrypt_whatsapp_media(encrypted_bytes: bytes, media_key_b64: str, media_type: str = "audio") -> Optional[bytes]:
    """
    Descriptografa mídia do WhatsApp usando o mediaKey.
    WhatsApp usa HKDF + AES-256-CBC.
    """
    import base64 as b64mod
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives.hashes import SHA256
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    except ImportError:
        print("[AudioDecrypt] cryptography library not installed")
        return None

    info_map = {
        "audio": b"WhatsApp Audio Keys",
        "ptt": b"WhatsApp Audio Keys",
        "image": b"WhatsApp Image Keys",
        "video": b"WhatsApp Video Keys",
        "document": b"WhatsApp Document Keys",
    }
    info = info_map.get(media_type.lower(), b"WhatsApp Audio Keys")

    try:
        media_key = b64mod.b64decode(media_key_b64)

        # HKDF expand: 112 bytes = 16 (IV) + 32 (cipherKey) + 32 (macKey) + 32 (refKey)
        expanded = HKDF(
            algorithm=SHA256(),
            length=112,
            salt=None,
            info=info,
        ).derive(media_key)

        iv = expanded[:16]
        cipher_key = expanded[16:48]

        # Strip last 10 bytes (MAC) from encrypted data
        file_data = encrypted_bytes[:-10]

        # Decrypt AES-256-CBC
        cipher = Cipher(algorithms.AES(cipher_key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        decrypted_padded = decryptor.update(file_data) + decryptor.finalize()

        # Remove PKCS7 padding
        pad_len = decrypted_padded[-1]
        if 1 <= pad_len <= 16:
            decrypted = decrypted_padded[:-pad_len]
        else:
            decrypted = decrypted_padded

        print(f"[AudioDecrypt] Decrypted {len(encrypted_bytes)} -> {len(decrypted)} bytes")
        return decrypted
    except Exception as exc:
        print(f"[AudioDecrypt] Decryption failed: {exc}")
        return None


def _try_download_decrypt_and_transcribe(audio_payload: Dict[str, Any]) -> Optional[str]:
    """
    Baixa áudio criptografado do WhatsApp CDN, descriptografa com mediaKey,
    e transcreve com Groq.
    """
    lowered = {str(k).lower(): v for k, v in audio_payload.items()}

    media_url = None
    for key in ("url", "mediaurl", "downloadurl"):
        val = lowered.get(key)
        if isinstance(val, str) and val.strip().startswith("http"):
            media_url = val.strip()
            break

    media_key = lowered.get("mediakey")
    mimetype = lowered.get("mimetype", "")

    if not (media_url and media_key):
        return None

    try:
        import requests
        print(f"[AudioDecrypt] Downloading encrypted audio from WhatsApp CDN...")
        resp = requests.get(media_url, timeout=20)
        resp.raise_for_status()
        encrypted_bytes = resp.content
        print(f"[AudioDecrypt] Downloaded {len(encrypted_bytes)} encrypted bytes")

        # Determine media type from mimetype or payload hints
        media_type = "audio"
        if bool(lowered.get("ptt")):
            media_type = "ptt"

        decrypted = _decrypt_whatsapp_media(encrypted_bytes, media_key, media_type)
        if not decrypted:
            return None

        ext = ".ogg" if "ogg" in mimetype.lower() else ".m4a"
        return audio_transcription_service.transcribe_from_bytes(
            decrypted, filename=f"audio{ext}"
        )
    except Exception as exc:
        print(f"[AudioDecrypt] Download+decrypt+transcribe failed: {exc}")
        return None


def _build_audio_text(audio_payload: Dict[str, Any]) -> str:
    """
    Retorna texto transcrito do áudio quando possível.
    """
    if not isinstance(audio_payload, dict):
        return "[Áudio enviado pelo cliente]"

    url, base64_audio, filename = _extract_audio_source(audio_payload)

    transcribed_text = None
    if audio_transcription_service.is_enabled():
        # 1) Baixar do CDN, descriptografar com mediaKey, transcrever
        transcribed_text = _try_download_decrypt_and_transcribe(audio_payload)

        # 2) Fallback: URL direta (pode funcionar se não for criptografada)
        if not transcribed_text and url:
            transcribed_text = audio_transcription_service.transcribe_from_url(url, filename_hint=filename)

        # 3) Fallback: base64 do payload
        if not transcribed_text and base64_audio:
            transcribed_text = audio_transcription_service.transcribe_from_base64(base64_audio, filename=filename)
    else:
        print("[Webhook] GROQ_API_KEY ausente: áudio salvo sem transcrição.")

    if transcribed_text:
        return f"🔊 {transcribed_text}"

    return "[Áudio enviado pelo cliente]"

async def handle_clear_command(lead_identifier: str, channel: str = "whatsapp") -> bool:
    """
    Limpa todos os dados do lead para facilitar testes.
    Apaga: lead, conversas, mensagens, eventos.
    Suporta WhatsApp (phone) e Instagram (ig:<igsid>).
    """
    try:
        # Cancel any pending buffered messages to prevent race condition
        # where the AI agent re-creates the lead after deletion
        from services.buffer_service import cancel_buffer
        cancel_buffer(lead_identifier)

        from services.supabase_client import create_client
        supabase = create_client()

        is_instagram = lead_identifier.startswith("ig:")

        if is_instagram:
            ig_id = lead_identifier[3:]
            print(f"🗑️ [CLEAR] Iniciando limpeza para Instagram IGSID: {ig_id}")
            lead_res = supabase.table("leads").select("id").eq("instagram_id", ig_id).execute()
        else:
            raw_phone = lead_identifier.split('@')[0] if '@' in lead_identifier else lead_identifier
            # Normalize phone (adds 9th digit for DDDs >= 29) to match how leads are stored
            from services.uazapi_service import UazapiService
            phone = UazapiService.normalize_whatsapp_number(raw_phone) or raw_phone
            print(f"🗑️ [CLEAR] Iniciando limpeza para phone: {phone} (raw: {raw_phone})")
            lead_res = supabase.table("leads").select("id").eq("phone", phone).execute()
            # Fallback: try raw phone for leads stored before normalization
            if not lead_res.data and phone != raw_phone:
                lead_res = supabase.table("leads").select("id").eq("phone", raw_phone).execute()
        
        if not lead_res.data:
            print(f"🗑️ [CLEAR] Lead não encontrado para {lead_identifier}")
            _send_clear_response(lead_identifier, channel,
                "✅ Nenhum dado encontrado para limpar. Você pode começar uma nova conversa!"
            )
            return True
            
        lead_id = lead_res.data[0]["id"]
        print(f"🗑️ [CLEAR] Lead encontrado: {lead_id}")
        
        # 2. Buscar e deletar conversas (mensagens serão deletadas em cascata)
        conv_res = supabase.table("conversations").select("id").eq("lead_id", lead_id).execute()
        
        if conv_res.data:
            for conv in conv_res.data:
                supabase.table("messages").delete().eq("conversation_id", conv["id"]).execute()
                print(f"🗑️ [CLEAR] Mensagens deletadas da conversa {conv['id']}")
            
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

        # 5. Broadcast para atualizar frontend em tempo real
        _broadcast_lead_deleted(lead_id)

        # 6. Enviar mensagem de confirmação pelo canal correto
        _send_clear_response(lead_identifier, channel,
            "✅ Dados limpos com sucesso!\n\n"
            "Todos os seus dados foram apagados:\n"
            "• Lead removido\n"
            "• Conversas apagadas\n"
            "• Agendamentos removidos\n\n"
            "Envie qualquer mensagem para começar uma nova conversa de teste!"
        )
        
        print(f"🗑️ [CLEAR] Limpeza concluída para {lead_identifier}")
        return True
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"🗑️ [CLEAR] Erro na limpeza: {e}")
        
        try:
            _send_clear_response(lead_identifier, channel, f"❌ Erro ao limpar dados: {str(e)}")
        except:
            pass
            
        return False


def _broadcast_lead_deleted(lead_id: str):
    """Broadcast via Supabase Realtime para notificar o frontend que um lead foi deletado."""
    try:
        supabase_url = os.environ.get("SUPABASE_URL", "")
        supabase_key = os.environ.get("SUPABASE_KEY", "")
        if not supabase_url or not supabase_key:
            return

        url = f"{supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "messages": [{
                "topic": "realtime:lead-deletions",
                "event": "lead_deleted",
                "payload": {"lead_id": lead_id}
            }]
        }
        resp = http_requests.post(url, json=payload, headers=headers, timeout=5)
        if resp.status_code in (200, 202):
            print(f"🗑️ [CLEAR] Broadcast lead_deleted enviado para lead {lead_id}")
        else:
            print(f"🗑️ [CLEAR] Broadcast falhou: HTTP {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"🗑️ [CLEAR] Erro ao enviar broadcast (nao-bloqueante): {e}")


def _send_clear_response(lead_identifier: str, channel: str, message: str):
    """Envia resposta do comando #apagar pelo canal correto."""
    if channel == "instagram":
        recipient_id = lead_identifier[3:] if lead_identifier.startswith("ig:") else lead_identifier
        meta_service.send_instagram_message(recipient_id, message)
    else:
        uazapi_svc = UazapiService()
        uazapi_svc.send_whatsapp_message(lead_identifier, message)

@router.post("/webhook/uazapi")
async def handle_uazapi_webhook(request: Request):
    """
    Receive incoming messages from UazAPI.
    Payload structure: UazAPI webhooks (messages.upsert e EventType=messages).
    """
    try:
        data = await request.json()
        print("Received UazAPI Webhook:", data)
        message_type = "text"
        
        # 1. Handle UazAPI format with event=messages.upsert
        event = data.get("event")
        pushname = ""
        if event == "messages.upsert":
            msg_data = data.get("data", {})
            key = msg_data.get("key", {})
            if key.get("fromMe"): return {"status": "ignored"}

            remote_jid = key.get("remoteJid")
            pushname = msg_data.get("pushName", "") or ""
            message_obj = msg_data.get("message", {})
            text = _extract_text_from_message_payload(message_obj)
            if not text:
                audio_payload = _find_audio_payload(message_obj)
                if audio_payload:
                    message_type = "audio"
                    text = _build_audio_text(audio_payload)

        # 2. Handle alternate UazAPI format (EventType=messages)
        elif data.get("EventType") == "messages":
            message_info = data.get("message", {})
            if message_info.get("fromMe"): return {"status": "ignored"}

            remote_jid = message_info.get("chatid") or message_info.get("sender")
            pushname = message_info.get("pushName", "") or message_info.get("senderName", "") or ""
            text = message_info.get("text")
            if not isinstance(text, str):
                text = None
            if not text:
                raw_content = message_info.get("content")
                if isinstance(raw_content, str):
                    text = raw_content

            if not text:
                audio_payload = _find_audio_payload(message_info)
                is_audio_message = _is_uazapi_audio_message(message_info)

                if not audio_payload and is_audio_message and isinstance(message_info.get("content"), dict):
                    audio_payload = message_info.get("content")

                if audio_payload or is_audio_message:
                    message_type = "audio"
                    text = _build_audio_text(audio_payload or {})
        
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

        if text is not None and not isinstance(text, str):
            print(f"[Webhook] Ignoring non-string text payload (type={type(text)}).")
            text = None

        if remote_jid and text:
            # Verificar comando especial #apagar
            if text.strip().lower() == CLEAR_COMMAND:
                print(f"🗑️ [CLEAR] Comando de limpeza recebido de {remote_jid}")
                await handle_clear_command(remote_jid)
                return {"status": "cleared"}

            # Filtrar spam, bots e propagandas — NÃO salvar no CRM nem responder
            if _is_spam_or_bot(text):
                print(f"🚫 [SpamFilter] Mensagem de {remote_jid} rejeitada como spam/bot/propaganda")
                return {"status": "spam_filtered"}

            msg_id = None
            if event == "messages.upsert":
                msg_id = msg_data.get("key", {}).get("id")
            elif data.get("EventType") == "messages":
                msg_id = message_info.get("id")
                
            print(f"Processing message from {remote_jid} (ID: {msg_id}, type: {message_type}): {text}")
            
            # Fetch WhatsApp profile picture (non-blocking, graceful fallback)
            profile_pic_url = None
            try:
                profile_pic_url = uazapi.get_profile_picture_url(remote_jid)
            except Exception:
                pass

            # Fallback: use imagePreview from webhook payload if API call returned nothing
            if not profile_pic_url:
                chat_data = data.get("chat") or data.get("data", {})
                profile_pic_url = chat_data.get("imagePreview") or chat_data.get("image") or None

            # Save User Message to DB
            try:
                from services.message_service import MessageService
                msg_service = MessageService()
                print(f"[Webhook] Calling save_message for lead message...")
                result = msg_service.save_message(
                    remote_jid,
                    text,
                    "lead",
                    message_type=message_type,
                    whatsapp_msg_id=msg_id,
                    wa_pushname=pushname,
                    profile_picture_url=profile_pic_url,
                )
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

            await add_to_buffer(remote_jid, text, msg_id, pushname=pushname)
                
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

        for entry in data.get("entry", []):
            # entry.id is our own Instagram Business Account ID or Page ID
            # Any message where sender.id matches entry.id is from us (echo)
            entry_id = entry.get("id", "")

            # Filter: only process messages from the expected Instagram page
            expected_page_id = os.environ.get("META_PAGE_ID")
            if expected_page_id and entry_id != expected_page_id:
                print(f"[Meta Webhook] Ignoring message from unexpected page: {entry_id} (expected: {expected_page_id})")
                continue
            
            for messaging_event in entry.get("messaging", []):
                sender_id = messaging_event.get("sender", {}).get("id")
                recipient_id = messaging_event.get("recipient", {}).get("id")
                message = messaging_event.get("message", {})
                text = message.get("text")
                msg_id = message.get("mid")

                # Skip non-message events (message_edit, read receipts, reactions, etc.)
                if not message or "mid" not in message:
                    event_keys = list(messaging_event.keys())
                    print(f"[Meta Webhook] Skipping non-message event (keys: {event_keys})")
                    continue

                # --- Extract text from non-text messages (images, audio, stickers, etc.) ---
                if not text:
                    attachments = message.get("attachments", [])
                    if attachments:
                        att_type = attachments[0].get("type", "unknown")
                        att_url = attachments[0].get("payload", {}).get("url", "")
                        type_labels = {
                            "image": "Imagem",
                            "video": "Vídeo",
                            "audio": "Áudio",
                            "file": "Arquivo",
                            "share": "Compartilhamento",
                            "story_mention": "Menção em story",
                        }
                        label = type_labels.get(att_type, att_type)
                        text = f"[{label} enviado pelo cliente]"
                        if att_url:
                            text += f" URL: {att_url}"
                        print(f"[Meta Webhook] Non-text message converted: type={att_type}")
                    elif message.get("sticker"):
                        text = "[Sticker enviado pelo cliente]"
                    elif message.get("reply_to"):
                        # Story reply without text (just a reaction to a story)
                        text = "[Reagiu ao seu story]"

                # --- MECHANISM 1: Check if this is a message we sent (by MID) ---
                if meta_service.is_own_message(msg_id):
                    meta_service.learn_own_igsid(sender_id)
                    print(f"[Meta Webhook] Ignoring own message (matched sent MID: {msg_id})")
                    continue
                # ----------------------------------------------------------------

                # --- MECHANISM 2: Meta's is_echo flag ---
                if message.get("is_echo"):
                    meta_service.learn_own_igsid(sender_id)
                    print(f"[Meta Webhook] Ignoring echo message")
                    continue

                # --- MECHANISM 3: Sender ID matches our known IDs ---
                own_ids = {
                    entry_id,
                    meta_service.page_id or "",
                    meta_service.instagram_scoped_id or "",
                    meta_service.instagram_business_account_id or ""
                }
                own_ids.discard("")

                if sender_id in own_ids:
                    meta_service.learn_own_igsid(sender_id)
                    print(f"[Meta Webhook] Ignoring message from our own account ({sender_id})")
                    continue

                if not sender_id or not text:
                    print(f"[Meta Webhook] DROPPED: sender_id={sender_id}, text={text}, message_keys={list(message.keys())}")
                    continue

                # Learn our own IGSID from incoming messages.
                # If we are here, it's a real message from a user TO us.
                # So recipient_id is OUR IGSID.
                meta_service.learn_own_igsid(recipient_id)

                # Use ig: prefix to differentiate Instagram leads from WhatsApp
                lead_identifier = f"ig:{sender_id}"
                print(f"[Meta Webhook] Processing Instagram DM from {lead_identifier}: {text}")

                # Accept message request immediately (mark as seen/read)
                # This must happen ASAP so the conversation is accepted before we reply
                try:
                    meta_service.mark_instagram_seen(sender_id)
                except Exception as seen_err:
                    print(f"[Meta Webhook] mark_seen failed (non-blocking): {seen_err}")

                # --- IDEMPOTENCY CHECK: Ignore if msg_id already exists in DB ---
                if msg_id:
                    try:
                        from services.message_service import MessageService
                        _msg_svc = MessageService()
                        # Find the lead's conversation and check only within it
                        _ig_id = sender_id
                        _lead_res = _msg_svc.supabase.table("leads").select("id").eq("instagram_id", _ig_id).execute()
                        if _lead_res.data:
                            _conv_res = _msg_svc.supabase.table("conversations").select("id").eq("lead_id", _lead_res.data[0]["id"]).execute()
                            if _conv_res.data:
                                _conv_ids = [c["id"] for c in _conv_res.data]
                                _existing_res = (
                                    _msg_svc.supabase
                                    .table("messages")
                                    .select("id")
                                    .in_("conversation_id", _conv_ids)
                                    .eq("metadata->>whatsapp_msg_id", msg_id)
                                    .limit(1)
                                    .execute()
                                )
                                if _existing_res.data:
                                    print(f"[Meta Webhook] DUPLICATE: msg_id {msg_id} already in DB for this lead, skipping")
                                    continue
                    except Exception as dup_err:
                        # Never block a message due to dedup check failure
                        print(f"[Meta Webhook] Idempotency check error (allowing message through): {dup_err}")
                # ---------------------------------------------------------------

                # Verificar comando especial #apagar
                if text.strip().lower() == CLEAR_COMMAND:
                    print(f"🗑️ [CLEAR] Comando de limpeza recebido de {lead_identifier} (Instagram)")
                    await handle_clear_command(lead_identifier, channel="instagram")
                    continue

                # Filtrar spam, bots e propagandas — NÃO salvar no CRM nem responder
                if _is_spam_or_bot(text):
                    print(f"🚫 [SpamFilter] Mensagem Instagram de {lead_identifier} rejeitada como spam/bot/propaganda")
                    continue

                # Fetch Instagram profile (name + username) for the sender
                ig_profile = meta_service.get_instagram_profile(sender_id)
                if ig_profile:
                    print(f"[Meta Webhook] Instagram profile: {ig_profile}")
                else:
                    print(f"[Meta Webhook] Could not fetch Instagram profile for {sender_id}")

                # Extract profile picture URL from Instagram profile
                ig_profile_pic_url = ig_profile.get("profile_pic") if ig_profile else None

                # Save message to DB
                try:
                    from services.message_service import MessageService
                    msg_service = MessageService()
                    result = msg_service.save_message(
                        lead_identifier, text, "lead",
                        whatsapp_msg_id=msg_id,
                        ig_profile=ig_profile,
                        profile_picture_url=ig_profile_pic_url,
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
