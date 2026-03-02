from fastapi import APIRouter, Request, HTTPException
from services.meta_service import MetaService
from services.audio_transcription_service import AudioTranscriptionService
from services.buffer_service import add_to_buffer
from services.analytics_cache_service import shared_cache_service as analytics_cache_service
import asyncio
import hashlib
import hmac
import logging
import os
import requests as http_requests
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

router = APIRouter()
meta_service = MetaService()
audio_transcription_service = AudioTranscriptionService()

# Webhook signature verification
META_APP_SECRET = os.environ.get("META_APP_SECRET", "")

async def verify_meta_signature(request: Request) -> bytes:
    """Validates X-Hub-Signature-256 from Meta webhooks. Returns raw body on success."""
    if not META_APP_SECRET:
        # If not configured, skip verification (allows gradual rollout)
        return await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not signature.startswith("sha256="):
        raise HTTPException(status_code=403, detail="Missing webhook signature")
    body = await request.body()
    expected = "sha256=" + hmac.new(
        META_APP_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")
    return body

# Comando especial para limpar dados de teste
CLEAR_COMMAND = "#apagar"
# Comando para resetar TODO o banco (só funciona do número admin)
RESET_DB_COMMAND = "#resetdb"
ADMIN_PHONE = os.environ.get("ADMIN_PHONE", "")
if not ADMIN_PHONE:
    logger.warning("[WARN] ADMIN_PHONE not set — #resetdb command will be disabled")

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
        logger.info(f"[SpamFilter] Keyword match ({keyword_hits} hits)")
        return True

    # 2. Regex pattern match
    pattern_hits = sum(1 for p in _SPAM_PATTERNS if p.search(text))
    if pattern_hits >= 2:
        logger.info(f"[SpamFilter] Pattern match ({pattern_hits} hits)")
        return True

    # 3. Combined: 1 keyword + 1 pattern = spam
    if keyword_hits >= 1 and pattern_hits >= 1:
        logger.info(f"[SpamFilter] Combined match (kw={keyword_hits}, pat={pattern_hits})")
        return True

    # 4. Bot message patterns (1 match is enough)
    for p in _BOT_PATTERNS:
        if p.search(text):
            logger.info(f"[SpamFilter] Bot pattern match")
            return True

    # 5. Heuristic: very long message (>500 chars) with prices = promo
    if len(text) > 500 and any(p.search(text) for p in _SPAM_PATTERNS[:2]):
        logger.info(f"[SpamFilter] Long promo message ({len(text)} chars)")
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
        logger.error("[AudioDecrypt] cryptography library not installed")
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

        logger.info(f"[AudioDecrypt] Decrypted {len(encrypted_bytes)} -> {len(decrypted)} bytes")
        return decrypted
    except Exception as exc:
        logger.error(f"[AudioDecrypt] Decryption failed: {exc}")
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
        logger.info(f"[AudioDecrypt] Downloading encrypted audio from WhatsApp CDN...")
        resp = requests.get(media_url, timeout=20)
        resp.raise_for_status()
        encrypted_bytes = resp.content
        logger.info(f"[AudioDecrypt] Downloaded {len(encrypted_bytes)} encrypted bytes")

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
        logger.error(f"[AudioDecrypt] Download+decrypt+transcribe failed: {exc}")
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
        logger.warning("[Webhook] GROQ_API_KEY ausente: áudio salvo sem transcrição.")

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
        await cancel_buffer(lead_identifier)

        from services.supabase_client import create_client
        supabase = create_client()

        is_instagram = lead_identifier.startswith("ig:")

        if is_instagram:
            ig_id = lead_identifier[3:]
            logger.info(f"🗑️ [CLEAR] Iniciando limpeza para Instagram IGSID: {ig_id}")
            lead_res = supabase.table("leads").select("id").eq("instagram_id", ig_id).execute()
        else:
            raw_phone = lead_identifier.split('@')[0] if '@' in lead_identifier else lead_identifier
            # Normalize phone (adds 9th digit for DDDs >= 29) to match how leads are stored
            phone = MetaService.normalize_whatsapp_number(raw_phone) or raw_phone
            logger.info(f"🗑️ [CLEAR] Iniciando limpeza para phone: {phone} (raw: {raw_phone})")
            lead_res = supabase.table("leads").select("id").eq("phone", phone).execute()
            # Fallback: try raw phone for leads stored before normalization
            if not lead_res.data and phone != raw_phone:
                lead_res = supabase.table("leads").select("id").eq("phone", raw_phone).execute()
        
        if not lead_res.data:
            logger.warning(f"🗑️ [CLEAR] Lead não encontrado para {lead_identifier}")
            _send_clear_response(lead_identifier, channel,
                "✅ Nenhum dado encontrado para limpar. Você pode começar uma nova conversa!"
            )
            return True
            
        lead_id = lead_res.data[0]["id"]
        logger.info(f"🗑️ [CLEAR] Lead encontrado: {lead_id}")
        
        # 2. Buscar e deletar conversas (mensagens serão deletadas em cascata)
        conv_res = supabase.table("conversations").select("id").eq("lead_id", lead_id).execute()
        
        if conv_res.data:
            for conv in conv_res.data:
                supabase.table("messages").delete().eq("conversation_id", conv["id"]).execute()
                logger.info(f"🗑️ [CLEAR] Mensagens deletadas da conversa {conv['id']}")

            supabase.table("conversations").delete().eq("lead_id", lead_id).execute()
            logger.info(f"🗑️ [CLEAR] Conversas deletadas")
        
        # 3. Deletar eventos/agendamentos do lead
        try:
            supabase.table("events").delete().eq("lead_id", lead_id).execute()
            logger.info(f"🗑️ [CLEAR] Eventos deletados")
        except Exception as e:
            logger.error(f"🗑️ [CLEAR] Erro ao deletar eventos (pode não existir): {e}")
        
        # 4. Deletar o lead
        supabase.table("leads").delete().eq("id", lead_id).execute()
        logger.info(f"🗑️ [CLEAR] Lead deletado")

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
        
        logger.info(f"🗑️ [CLEAR] Limpeza concluída para {lead_identifier}")
        return True

    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"🗑️ [CLEAR] Erro na limpeza: {e}")
        
        try:
            _send_clear_response(lead_identifier, channel, f"❌ Erro ao limpar dados: {str(e)}")
        except Exception:
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
            logger.info(f"🗑️ [CLEAR] Broadcast lead_deleted enviado para lead {lead_id}")
        else:
            logger.warning(f"🗑️ [CLEAR] Broadcast falhou: HTTP {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        logger.error(f"🗑️ [CLEAR] Erro ao enviar broadcast (nao-bloqueante): {e}")


def _send_clear_response(lead_identifier: str, channel: str, message: str):
    """Envia resposta do comando #apagar pelo canal correto."""
    if channel == "instagram":
        recipient_id = lead_identifier[3:] if lead_identifier.startswith("ig:") else lead_identifier
        meta_service.send_instagram_message(recipient_id, message)
    else:
        meta_service.send_whatsapp_text(lead_identifier, message)

async def handle_reset_db_command(sender_jid: str) -> bool:
    """
    Reseta TODO o banco de dados (leads, conversas, mensagens, eventos, etc.).
    Só aceita execução do número admin (ADMIN_PHONE).
    """
    # Extrair número do sender (remove @s.whatsapp.net)
    raw_phone = sender_jid.split('@')[0] if '@' in sender_jid else sender_jid
    # Normalizar para comparação (remove 55, nono dígito, etc.)
    clean_phone = raw_phone.lstrip('+').replace(' ', '').replace('-', '')
    # Aceitar com ou sem código do país (55)
    admin_variants = {ADMIN_PHONE, f"55{ADMIN_PHONE}"}

    if clean_phone not in admin_variants:
        logger.warning(f"🚫 [RESETDB] Tentativa NEGADA de {raw_phone} (não é admin {ADMIN_PHONE})")
        _send_clear_response(sender_jid, "whatsapp",
            "❌ Comando negado.\n\nEsse comando só pode ser executado pelo administrador."
        )
        return False

    logger.info(f"🔴 [RESETDB] RESET TOTAL DO BANCO iniciado por {raw_phone}")

    try:
        # Cancel ALL pending buffered messages
        from services.buffer_service import get_active_lead_ids, cancel_buffer
        active_ids = await get_active_lead_ids()
        for lead_id in active_ids:
            await cancel_buffer(lead_id)

        from services.supabase_client import create_client
        supabase = create_client()

        deleted = {}

        # 1. messages (FK → conversations)
        try:
            res = supabase.table("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["messages"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] messages: {deleted['messages']} deletadas")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em messages: {e}")
            deleted["messages"] = f"erro: {e}"

        # 2. conversations (FK → leads)
        try:
            res = supabase.table("conversations").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["conversations"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] conversations: {deleted['conversations']} deletadas")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em conversations: {e}")
            deleted["conversations"] = f"erro: {e}"

        # 3. notifications (FK → leads com CASCADE, mas deleta explícito)
        try:
            res = supabase.table("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["notifications"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] notifications: {deleted['notifications']} deletadas")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em notifications: {e}")
            deleted["notifications"] = f"erro: {e}"

        # 4. follow_up_queue (FK → leads)
        try:
            res = supabase.table("follow_up_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["follow_up_queue"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] follow_up_queue: {deleted['follow_up_queue']} deletados")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em follow_up_queue: {e}")
            deleted["follow_up_queue"] = f"erro: {e}"

        # 5. lead_assignments (FK → leads)
        try:
            res = supabase.table("lead_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["lead_assignments"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] lead_assignments: {deleted['lead_assignments']} deletados")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em lead_assignments: {e}")
            deleted["lead_assignments"] = f"erro: {e}"

        # 6. events (FK → leads)
        try:
            res = supabase.table("events").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["events"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] events: {deleted['events']} deletados")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em events: {e}")
            deleted["events"] = f"erro: {e}"

        # 7. analytics_cache (sem FK)
        try:
            res = supabase.table("analytics_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["analytics_cache"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] analytics_cache: {deleted['analytics_cache']} deletados")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em analytics_cache: {e}")
            deleted["analytics_cache"] = f"erro: {e}"

        # 8. leads (por último, pois é referenciada por quase tudo)
        try:
            res = supabase.table("leads").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            deleted["leads"] = len(res.data) if res.data else 0
            logger.info(f"🔴 [RESETDB] leads: {deleted['leads']} deletados")
        except Exception as e:
            logger.error(f"🔴 [RESETDB] Erro em leads: {e}")
            deleted["leads"] = f"erro: {e}"

        # Montar relatório
        report_lines = []
        for table, count in deleted.items():
            if isinstance(count, int):
                report_lines.append(f"• {table}: {count} registros removidos")
            else:
                report_lines.append(f"• {table}: {count}")

        report = "\n".join(report_lines)

        _send_clear_response(sender_jid, "whatsapp",
            f"🔴 RESET COMPLETO DO BANCO!\n\n"
            f"Todos os dados foram apagados:\n{report}\n\n"
            f"⚠️ Tabela 'users' preservada (vendedores/admins).\n"
            f"O sistema está limpo para novos testes!"
        )

        logger.info(f"🔴 [RESETDB] Reset completo finalizado: {deleted}")
        return True

    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"🔴 [RESETDB] Erro geral: {e}")
        _send_clear_response(sender_jid, "whatsapp", f"❌ Erro no reset: {str(e)}")
        return False


@router.post("/webhook/uazapi")
async def handle_uazapi_webhook(request: Request):
    """
    Receive incoming messages from UazAPI.
    Payload structure: UazAPI webhooks (messages.upsert e EventType=messages).
    """
    try:
        data = await request.json()
        logger.info("Received UazAPI Webhook: %s", data)
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
            logger.warning(f"Unknown event type: {event or data.get('EventType')}")
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
                logger.info(f"Parsed JSON message content: {text}")
            except Exception as e:
                logger.error(f"Failed to parse JSON message content: {e}")

        if text is not None and not isinstance(text, str):
            logger.warning(f"[Webhook] Ignoring non-string text payload (type={type(text)}).")
            text = None

        if remote_jid and text:
            # Verificar comando especial #resetdb (apenas admin)
            if text.strip().lower() == RESET_DB_COMMAND:
                logger.info(f"🔴 [RESETDB] Comando de reset recebido de {remote_jid}")
                await handle_reset_db_command(remote_jid)
                return {"status": "reset_db"}

            # Verificar comando especial #apagar
            if text.strip().lower() == CLEAR_COMMAND:
                logger.info(f"🗑️ [CLEAR] Comando de limpeza recebido de {remote_jid}")
                await handle_clear_command(remote_jid)
                return {"status": "cleared"}

            # Filtrar spam, bots e propagandas — NÃO salvar no CRM nem responder
            if _is_spam_or_bot(text):
                logger.warning(f"🚫 [SpamFilter] Mensagem de {remote_jid} rejeitada como spam/bot/propaganda")
                return {"status": "spam_filtered"}

            msg_id = None
            if event == "messages.upsert":
                msg_id = msg_data.get("key", {}).get("id")
            elif data.get("EventType") == "messages":
                msg_id = message_info.get("id")
                
            logger.info(f"Processing message from {remote_jid} (ID: {msg_id}, type: {message_type}): {text}")
            
            # Profile picture: Cloud API does not provide this endpoint.
            # Kept as None; the imagePreview fallback below may still work for UazAPI webhook.
            profile_pic_url = None

            # Fallback: use imagePreview from webhook payload if API call returned nothing
            if not profile_pic_url:
                chat_data = data.get("chat") or data.get("data", {})
                profile_pic_url = chat_data.get("imagePreview") or chat_data.get("image") or None

            # Save User Message to DB
            try:
                from services.message_service import MessageService
                msg_service = MessageService()
                logger.info(f"[Webhook] Calling save_message for lead message...")
                result = msg_service.save_message(
                    remote_jid,
                    text,
                    "lead",
                    message_type=message_type,
                    whatsapp_msg_id=msg_id,
                    wa_pushname=pushname,
                    profile_picture_url=profile_pic_url,
                )
                logger.info(f"[Webhook] save_message result: {result}")
                
                # Queue analytics recalculation (non-blocking)
                # Uses asyncio.create_task to ensure webhook response is not blocked
                asyncio.create_task(
                    analytics_cache_service.queue_recalculation('message_webhook')
                )
            except Exception as db_err:
                import traceback
                logger.error(f"DB Error: {db_err}")
                traceback.print_exc()

            await add_to_buffer(remote_jid, text, msg_id, pushname=pushname)

    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"Error processing webhook: {e}")
    
    return {"status": "received"}

@router.get("/webhook/whatsapp")
async def verify_whatsapp_webhook(request: Request):
    """
    Meta WhatsApp Cloud API Verification Challenge.
    Called by Meta when configuring the webhook URL in the Developer Dashboard.
    """
    verify_token = os.environ.get("META_VERIFY_TOKEN")
    if not verify_token:
        raise HTTPException(status_code=500, detail="META_VERIFY_TOKEN not configured")

    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and hmac.compare_digest(token, verify_token):
            logger.info("[WhatsApp Webhook] Verification successful")
            return int(challenge)
        else:
            logger.warning("[WhatsApp Webhook] Verification failed: token mismatch")
            raise HTTPException(status_code=403, detail="Verification failed")
    return {"status": "ok"}


@router.post("/webhook/whatsapp")
async def handle_whatsapp_cloud_webhook(request: Request):
    """
    Receive incoming messages from the official Meta WhatsApp Cloud API.
    Handles the whatsapp_business_account webhook object format.
    Always returns 200 to Meta to prevent retries.
    """
    import json as _json

    try:
        # Verify Meta signature before processing (reuses same secret as Instagram webhook)
        raw_body = await verify_meta_signature(request)
        data = _json.loads(raw_body)
        logger.info("[WA Cloud Webhook] Received payload")

        obj_type = data.get("object")
        if obj_type != "whatsapp_business_account":
            logger.info(f"[WA Cloud Webhook] Ignoring non-whatsapp_business_account object: {obj_type}")
            return {"status": "ignored"}

        for entry in data.get("entry", []):
            for change in entry.get("changes", []):
                if change.get("field") != "messages":
                    logger.info(f"[WA Cloud Webhook] Ignoring non-messages field: {change.get('field')}")
                    continue

                value = change.get("value", {})

                # Process status updates (delivered / read / sent) — just log them
                for status in value.get("statuses", []):
                    logger.info(
                        f"[WA Cloud Webhook] Status update: msg={status.get('id')} "
                        f"status={status.get('status')} recipient={status.get('recipient_id')}"
                    )

                # Build contact map: {wa_id -> profile_name}
                contact_map: Dict[str, str] = {}
                for contact in value.get("contacts", []):
                    wa_id = contact.get("wa_id", "")
                    name = contact.get("profile", {}).get("name", "")
                    if wa_id:
                        contact_map[wa_id] = name

                # Process each incoming message
                for msg in value.get("messages", []):
                    try:
                        await _process_whatsapp_cloud_message(msg, contact_map)
                    except Exception as msg_err:
                        import traceback
                        logger.error(f"[WA Cloud Webhook] Error processing message {msg.get('id')}: {msg_err}")
                        traceback.print_exc()
                        # Continue with next message — never let one failure block others

    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"[WA Cloud Webhook] Error processing webhook: {e}")

    # Always return 200 to acknowledge receipt (Meta requirement — prevents retries)
    return {"status": "received"}


async def _process_whatsapp_cloud_message(msg: Dict[str, Any], contact_map: Dict[str, str]) -> None:
    """
    Core handler for a single WhatsApp Cloud API message object.
    Parses message type, saves to DB, and adds to the AI buffer.
    """
    msg_type = msg.get("type", "")
    msg_id = msg.get("id", "")
    phone_raw = msg.get("from", "")
    wa_id = phone_raw  # Cloud API sends the wa_id as the "from" field

    # Normalise phone number (adds 9th digit for BR DDDs >= 29, strips country code, etc.)
    phone = MetaService.normalize_whatsapp_number(phone_raw) or phone_raw

    pushname = contact_map.get(wa_id, "")

    logger.info(f"[WA Cloud Webhook] Message from={phone} wa_id={wa_id} type={msg_type} id={msg_id}")

    # ── 1. Skip reaction messages entirely ───────────────────────────────────
    if msg_type == "reaction":
        logger.info(f"[WA Cloud Webhook] Skipping reaction message from {phone}")
        return

    # ── 2. Mark as read (fire-and-forget — do not await result) ─────────────
    if msg_id:
        asyncio.create_task(asyncio.to_thread(meta_service.mark_whatsapp_read, msg_id))

    # ── 3. Idempotency check: ignore already-processed message IDs ───────────
    if msg_id:
        try:
            from services.message_service import MessageService
            _msg_svc = MessageService()
            _lead_res = _msg_svc.supabase.table("leads").select("id").eq("phone", phone).execute()
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
                        logger.info(f"[WA Cloud Webhook] DUPLICATE: msg_id {msg_id} already in DB, skipping")
                        return
        except Exception as dup_err:
            # Never block a message due to dedup check failure
            logger.error(f"[WA Cloud Webhook] Idempotency check error (allowing message through): {dup_err}")

    # ── 4. Parse message content based on type ───────────────────────────────
    text: Optional[str] = None
    message_type = "text"
    wa_media_id: Optional[str] = None  # media_id for images (used by frontend proxy)

    if msg_type == "text":
        text = msg.get("text", {}).get("body", "")
        message_type = "text"

    elif msg_type == "audio":
        message_type = "audio"
        audio_id = msg.get("audio", {}).get("id")
        if audio_id and audio_transcription_service.is_enabled():
            try:
                audio_bytes = await asyncio.to_thread(meta_service.download_whatsapp_media, audio_id)
                if audio_bytes:
                    mime = msg.get("audio", {}).get("mime_type", "audio/ogg")
                    if "ogg" in mime:
                        ext = ".ogg"
                    elif "m4a" in mime:
                        ext = ".m4a"
                    else:
                        ext = ".mp3"
                    transcription = await asyncio.to_thread(
                        audio_transcription_service.transcribe_from_bytes,
                        audio_bytes,
                        f"audio{ext}",
                    )
                    if transcription:
                        text = f"🔊 {transcription}"
                    else:
                        text = "[Áudio enviado pelo cliente]"
                else:
                    text = "[Áudio enviado pelo cliente]"
            except Exception as audio_err:
                logger.error(f"[WA Cloud Webhook] Audio transcription failed: {audio_err}")
                text = "[Áudio enviado pelo cliente]"
        else:
            text = "[Áudio enviado pelo cliente]"

    elif msg_type == "image":
        caption = msg.get("image", {}).get("caption", "")
        image_id = msg.get("image", {}).get("id")
        image_description = ""

        # Tenta descrever a imagem via Groq Vision
        if image_id:
            try:
                image_bytes = await asyncio.to_thread(meta_service.download_whatsapp_media, image_id)
                if image_bytes:
                    import base64
                    from groq import Groq

                    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
                    if groq_key:
                        b64 = base64.b64encode(image_bytes).decode("utf-8")
                        mime = msg.get("image", {}).get("mime_type", "image/jpeg")
                        groq_client = Groq(api_key=groq_key)
                        vision_resp = await asyncio.to_thread(
                            lambda: groq_client.chat.completions.create(
                                model="meta-llama/llama-4-scout-17b-16e-instruct",
                                messages=[{
                                    "role": "user",
                                    "content": [
                                        {"type": "text", "text": "Descreva esta imagem de forma objetiva em português, em no máximo 2 frases."},
                                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                                    ],
                                }],
                                max_completion_tokens=256,
                                temperature=0.3,
                            )
                        )
                        image_description = vision_resp.choices[0].message.content.strip()
                        logger.info(f"[WA Cloud Webhook] Image described: {image_description[:100]}...")
            except Exception as img_err:
                logger.error(f"[WA Cloud Webhook] Image description failed: {img_err}")

        # Monta o texto final com descrição + caption
        parts = []
        if image_description:
            parts.append(f"[Imagem: {image_description}]")
        else:
            parts.append("[Imagem recebida]")
        if caption:
            parts.append(caption)
        text = " ".join(parts)
        message_type = "image"
        wa_media_id = image_id  # Save for metadata

    elif msg_type == "document":
        filename = msg.get("document", {}).get("filename", "arquivo")
        caption = msg.get("document", {}).get("caption", "")
        text = f"[Documento: {filename}]"
        if caption:
            text += f" {caption}"
        message_type = "text"

    elif msg_type == "video":
        text = "[Vídeo recebido]"
        message_type = "text"

    elif msg_type == "sticker":
        text = "[Sticker recebido]"
        message_type = "text"

    elif msg_type == "location":
        lat = msg.get("location", {}).get("latitude")
        lon = msg.get("location", {}).get("longitude")
        text = f"[Localização: {lat}, {lon}]"
        message_type = "text"

    elif msg_type == "interactive":
        interactive = msg.get("interactive", {})
        interactive_type = interactive.get("type", "")
        if interactive_type == "button_reply":
            # Use the ID (not title) — AI tools set descriptive IDs
            text = interactive.get("button_reply", {}).get("id", "")
        elif interactive_type == "list_reply":
            text = interactive.get("list_reply", {}).get("id", "")
        else:
            text = f"[Interação: {interactive_type}]"
        message_type = "text"

    elif msg_type == "button":
        # Template button response (user tapped a quick-reply button)
        text = msg.get("button", {}).get("text", "")
        message_type = "text"

    else:
        # Unknown or unsupported type — log and store a placeholder
        logger.warning(f"[WA Cloud Webhook] Unsupported message type: {msg_type}")
        text = f"[{msg_type} recebido]"
        message_type = "text"

    # ── 5. Guard: must have a phone and some text content ────────────────────
    if not phone or not text:
        logger.warning(f"[WA Cloud Webhook] Dropping message: phone={phone!r} text={text!r}")
        return

    # ── 6. Special command: #resetdb (admin only) ────────────────────────────
    if text.strip().lower() == RESET_DB_COMMAND:
        logger.info(f"[WA Cloud Webhook] #resetdb command received from {phone}")
        await handle_reset_db_command(phone)
        return

    # ── 7. Special command: #apagar ──────────────────────────────────────────
    if text.strip().lower() == CLEAR_COMMAND:
        logger.info(f"[WA Cloud Webhook] #apagar command received from {phone}")
        await handle_clear_command(phone, channel="whatsapp")
        return

    # ── 8. Spam / bot filter ─────────────────────────────────────────────────
    if _is_spam_or_bot(text):
        logger.warning(f"[WA Cloud Webhook] Message from {phone} rejected as spam/bot/ad")
        return

    # ── 9. Save message to DB ────────────────────────────────────────────────
    try:
        from services.message_service import MessageService
        msg_service = MessageService()
        extra_meta = {"wa_media_id": wa_media_id} if wa_media_id else None
        result = msg_service.save_message(
            phone,
            text,
            "lead",
            whatsapp_msg_id=msg_id,
            message_type=message_type,
            wa_pushname=pushname,
            extra_metadata=extra_meta,
        )
        logger.info(f"[WA Cloud Webhook] save_message result: {result}")

        asyncio.create_task(
            analytics_cache_service.queue_recalculation("message_webhook")
        )
    except Exception as db_err:
        import traceback
        logger.error(f"[WA Cloud Webhook] DB Error: {db_err}")
        traceback.print_exc()

    # ── 10. Add to AI buffer ─────────────────────────────────────────────────
    await add_to_buffer(phone, text, msg_id, pushname=pushname)


@router.get("/webhook/meta")
async def verify_webhook(request: Request):
    """
    Meta (Facebook) Verification Challenge.
    Used when configuring the webhook URL in Meta Developer dashboard.
    """
    verify_token = os.environ.get("META_VERIFY_TOKEN")
    if not verify_token:
        raise HTTPException(status_code=500, detail="META_VERIFY_TOKEN not configured")

    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and hmac.compare_digest(token, verify_token):
            logger.info(f"[Meta Webhook] Verification successful")
            return int(challenge)
        else:
            logger.warning(f"[Meta Webhook] Verification failed: token mismatch")
            raise HTTPException(status_code=403, detail="Verification failed")
    return {"status": "ok"}

@router.post("/webhook/meta")
async def handle_webhook(request: Request):
    """
    Receive incoming Instagram DM messages via Meta Webhooks.
    Parses the Instagram Messaging payload and processes through the same AI pipeline.
    """
    try:
        # Verify Meta signature before processing
        import json as _json
        raw_body = await verify_meta_signature(request)
        data = _json.loads(raw_body)
        logger.info("[Meta Webhook] Received: %s", data)

        obj_type = data.get("object")
        if obj_type != "instagram":
            logger.info(f"[Meta Webhook] Ignoring non-instagram object: {obj_type}")
            return {"status": "ignored"}

        for entry in data.get("entry", []):
            # entry.id is our own Instagram Business Account ID or Page ID
            # Any message where sender.id matches entry.id is from us (echo)
            entry_id = entry.get("id", "")

            # Filter: only process messages from the expected Instagram page
            expected_page_id = os.environ.get("META_PAGE_ID")
            if expected_page_id and entry_id != expected_page_id:
                logger.warning(f"[Meta Webhook] Ignoring message from unexpected page: {entry_id} (expected: {expected_page_id})")
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
                    logger.info(f"[Meta Webhook] Skipping non-message event (keys: {event_keys})")
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
                        logger.info(f"[Meta Webhook] Non-text message converted: type={att_type}")
                    elif message.get("sticker"):
                        text = "[Sticker enviado pelo cliente]"
                    elif message.get("reply_to"):
                        # Story reply without text (just a reaction to a story)
                        text = "[Reagiu ao seu story]"

                # --- MECHANISM 1: Check if this is a message we sent (by MID) ---
                if meta_service.is_own_message(msg_id):
                    meta_service.learn_own_igsid(sender_id)
                    logger.info(f"[Meta Webhook] Ignoring own message (matched sent MID: {msg_id})")
                    continue
                # ----------------------------------------------------------------

                # --- MECHANISM 2: Meta's is_echo flag ---
                if message.get("is_echo"):
                    meta_service.learn_own_igsid(sender_id)
                    logger.info(f"[Meta Webhook] Ignoring echo message")
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
                    logger.info(f"[Meta Webhook] Ignoring message from our own account ({sender_id})")
                    continue

                if not sender_id or not text:
                    logger.warning(f"[Meta Webhook] DROPPED: sender_id={sender_id}, text={text}, message_keys={list(message.keys())}")
                    continue

                # Learn our own IGSID from incoming messages.
                # If we are here, it's a real message from a user TO us.
                # So recipient_id is OUR IGSID.
                meta_service.learn_own_igsid(recipient_id)

                # Use ig: prefix to differentiate Instagram leads from WhatsApp
                lead_identifier = f"ig:{sender_id}"
                logger.info(f"[Meta Webhook] Processing Instagram DM from {lead_identifier}: {text}")

                # Accept message request immediately (mark as seen/read)
                # This must happen ASAP so the conversation is accepted before we reply
                try:
                    meta_service.mark_instagram_seen(sender_id)
                except Exception as seen_err:
                    logger.error(f"[Meta Webhook] mark_seen failed (non-blocking): {seen_err}")

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
                                    logger.info(f"[Meta Webhook] DUPLICATE: msg_id {msg_id} already in DB for this lead, skipping")
                                    continue
                    except Exception as dup_err:
                        # Never block a message due to dedup check failure
                        logger.error(f"[Meta Webhook] Idempotency check error (allowing message through): {dup_err}")
                # ---------------------------------------------------------------

                # Verificar comando especial #apagar
                if text.strip().lower() == CLEAR_COMMAND:
                    logger.info(f"🗑️ [CLEAR] Comando de limpeza recebido de {lead_identifier} (Instagram)")
                    await handle_clear_command(lead_identifier, channel="instagram")
                    continue

                # Filtrar spam, bots e propagandas — NÃO salvar no CRM nem responder
                if _is_spam_or_bot(text):
                    logger.warning(f"🚫 [SpamFilter] Mensagem Instagram de {lead_identifier} rejeitada como spam/bot/propaganda")
                    continue

                # Fetch Instagram profile (name + username) for the sender
                ig_profile = meta_service.get_instagram_profile(sender_id)
                if ig_profile:
                    logger.info(f"[Meta Webhook] Instagram profile: {ig_profile}")
                else:
                    logger.warning(f"[Meta Webhook] Could not fetch Instagram profile for {sender_id}")

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
                    logger.info(f"[Meta Webhook] save_message result: {result}")

                    asyncio.create_task(
                        analytics_cache_service.queue_recalculation('message_webhook')
                    )
                except Exception as db_err:
                    import traceback
                    logger.error(f"[Meta Webhook] DB Error: {db_err}")
                    traceback.print_exc()

                # Send to buffer with instagram channel
                await add_to_buffer(lead_identifier, text, msg_id, channel="instagram")

    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"[Meta Webhook] Error processing: {e}")

    # Always return 200 to acknowledge receipt (Meta requirement)
    return {"status": "received"}
