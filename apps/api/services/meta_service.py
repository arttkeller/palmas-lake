
import os
import re
import requests
import time
import json
from pathlib import Path
from typing import Optional, Dict, Set, List, Any

# Persistence for learned IGSID (survives restarts)
_STATE_DIR = Path(os.environ.get("META_STATE_DIR", os.path.dirname(os.path.abspath(__file__))))
_STATE_FILE = _STATE_DIR / ".meta_state.json"


def remove_markdown_for_instagram(text: str) -> str:
    """
    Remove markdown formatting from text for Instagram (which doesn't support it).
    Removes **bold**, *italic*, and other markdown syntax.
    
    Args:
        text: Text that may contain markdown formatting
        
    Returns:
        Text with markdown removed
    """
    # Remove **bold** (double asterisks)
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    # Remove *italic* (single asterisks that aren't part of **)
    text = re.sub(r'(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)', r'\1', text)
    # Remove other common markdown: `code`, _underline_, etc.
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'_(.+?)_', r'\1', text)
    return text.strip()

class MetaService:
    """
    Singleton MetaService: ensures all modules share the same instance,
    so sent message IDs and learned IGSIDs are shared across webhook and buffer.
    """
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        # Only initialize once (singleton)
        if self._initialized:
            return
        self._initialized = True
        # Strip whitespace/newlines from token to prevent "Cannot parse access token" errors
        raw_token = os.environ.get("META_ACCESS_TOKEN", "")
        self.access_token = raw_token.strip() if raw_token else ""
        self.phone_number_id = os.environ.get("META_PHONE_NUMBER_ID")
        self.base_url = "https://graph.facebook.com/v24.0"
        
        # Page Access Token and Page ID for Instagram Messaging
        # System User tokens don't work on graph.instagram.com, so we use
        # graph.facebook.com with a Page Access Token derived from me/accounts
        self.page_access_token = None
        self.page_id = None
        
        # Official Instagram Business Account ID
        # Can be set via env var (override) or fetched from API
        self.instagram_business_account_id = os.environ.get("META_INSTAGRAM_ID")
        
        # Cache for sent message IDs to detect echoes
        # Format: {message_id: timestamp}
        self._sent_message_ids: Dict[str, float] = {}
        self._sent_ids_ttl = 300  # 5 minutes
        
        # Our own Instagram Scoped ID (IGSID)
        # Priority: 1) env var  2) persisted file  3) learn at runtime
        env_igsid = os.environ.get("META_INSTAGRAM_SCOPED_ID")
        if env_igsid:
            self.instagram_scoped_id = env_igsid.strip()
            print(f"[MetaService] IGSID from env var: {self.instagram_scoped_id}")
        else:
            self.instagram_scoped_id = self._load_persisted_igsid()
        
        if self.access_token:
            print(f"[MetaService] Token loaded (length={len(self.access_token)}, starts_with={self.access_token[:10]}...)")
            self._init_page_token()
        else:
            print("[MetaService] WARNING: META_ACCESS_TOKEN is not set!")
        
        print(f"[MetaService] Singleton initialized. page_id={self.page_id}, ig_biz_id={self.instagram_business_account_id}")

    def _init_page_token(self):
        """
        Fetch the Page Access Token and Page ID from me/accounts.
        System User tokens require a Page Access Token for Instagram Messaging API.
        Also fetches the linked Instagram Business Account ID.
        """
        try:
            url = f"{self.base_url}/me/accounts"
            # Request instagram_business_account field to get the IGSID
            params = {
                "access_token": self.access_token,
                "fields": "access_token,name,id,tasks,instagram_business_account"
            }
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            pages = data.get("data", [])
            
            if pages:
                # If META_PAGE_ID is set, use that specific page instead of auto-selecting
                target_page_id = os.environ.get("META_PAGE_ID")

                for page in pages:
                    if target_page_id and page["id"] != target_page_id:
                        continue
                    tasks = page.get("tasks", [])
                    if target_page_id or "MESSAGING" in tasks or not tasks:
                        self.page_access_token = page["access_token"]
                        self.page_id = page["id"]
                        
                        # Extract Instagram Business Account ID if available
                        ig_account = page.get("instagram_business_account", {})
                        if ig_account and "id" in ig_account:
                            # Only update if not set via env var
                            if not self.instagram_business_account_id:
                                self.instagram_business_account_id = ig_account["id"]
                                print(f"[MetaService] Fetched Instagram Business ID from API: {self.instagram_business_account_id}")
                            else:
                                print(f"[MetaService] Using env var Instagram Business ID: {self.instagram_business_account_id}")
                        
                        print(f"[MetaService] Page token acquired for '{page.get('name', 'unknown')}' (ID: {self.page_id})")
                        return
                
                # Fallback: use first page
                self.page_access_token = pages[0]["access_token"]
                self.page_id = pages[0]["id"]
                
                # Extract Instagram Business Account ID from fallback page
                ig_account = pages[0].get("instagram_business_account", {})
                if ig_account and "id" in ig_account and not self.instagram_business_account_id:
                    self.instagram_business_account_id = ig_account["id"]
                    print(f"[MetaService] Fetched Instagram Business ID from API (fallback): {self.instagram_business_account_id}")
                
                print(f"[MetaService] Page token acquired (fallback) for '{pages[0].get('name', 'unknown')}' (ID: {self.page_id})")
            else:
                print("[MetaService] WARNING: No Facebook Pages found. Instagram messaging will not work.")
                print("[MetaService] Assign a Facebook Page to the System User in Business Manager.")
        except Exception as e:
            print(f"[MetaService] ERROR initializing page token: {e}")

    def _cleanup_sent_ids(self):
        """Remove expired message IDs from the cache."""
        now = time.time()
        expired = [mid for mid, ts in self._sent_message_ids.items() if now - ts > self._sent_ids_ttl]
        for mid in expired:
            del self._sent_message_ids[mid]

    def is_own_message(self, message_id: str) -> bool:
        """Check if a message ID corresponds to a message we sent."""
        self._cleanup_sent_ids()
        return message_id in self._sent_message_ids

    def learn_own_igsid(self, igsid: str):
        """
        Learn our own Instagram Scoped ID.
        Called with recipient_id from incoming messages OR sender_id from caught echoes.
        Persists to file so it survives restarts.
        """
        if not igsid:
            return
        if not self.instagram_scoped_id:
            self.instagram_scoped_id = igsid
            self._persist_igsid(igsid)
            print(f"[MetaService] Learned and persisted own IGSID: {self.instagram_scoped_id}")

    def _load_persisted_igsid(self) -> Optional[str]:
        """Load the persisted IGSID from the state file."""
        try:
            if _STATE_FILE.exists():
                data = json.loads(_STATE_FILE.read_text())
                igsid = data.get("instagram_scoped_id")
                if igsid:
                    print(f"[MetaService] Loaded persisted IGSID from file: {igsid}")
                    return igsid
        except Exception as e:
            print(f"[MetaService] Error loading persisted IGSID: {e}")
        return None

    def _persist_igsid(self, igsid: str):
        """Persist the IGSID to the state file for restart survival."""
        try:
            _STATE_DIR.mkdir(parents=True, exist_ok=True)
            data = {}
            if _STATE_FILE.exists():
                try:
                    data = json.loads(_STATE_FILE.read_text())
                except Exception:
                    pass
            data["instagram_scoped_id"] = igsid
            _STATE_FILE.write_text(json.dumps(data))
            print(f"[MetaService] Persisted IGSID to file: {igsid}")
        except Exception as e:
            print(f"[MetaService] Error persisting IGSID: {e}")

    def get_instagram_profile(self, user_id: str) -> Optional[Dict]:
        """
        Fetch Instagram user profile (name and username) via Graph API.
        Uses the Page Access Token on graph.facebook.com.
        
        Args:
            user_id: The Instagram Scoped User ID (IGSID)
        
        Returns:
            Dict with 'name' and 'username' keys, or None on failure
        """
        token = self.page_access_token or self.access_token
        if not token:
            print("[MetaService] No token available for profile fetch")
            return None
            
        url = f"{self.base_url}/{user_id}"
        params = {
            "fields": "name,username,profile_pic",
            "access_token": token,
        }
        try:
            print(f"[MetaService] Fetching Instagram profile for {user_id}...")
            response = requests.get(url, params=params, timeout=5)
            print(f"[MetaService] Profile response: {response.status_code} - {response.text}")
            response.raise_for_status()
            data = response.json()
            return {
                "name": data.get("name", ""),
                "username": data.get("username", ""),
                "profile_pic": data.get("profile_pic", ""),
            }
        except requests.exceptions.RequestException as e:
            print(f"[MetaService] Error fetching Instagram profile: {e}")
            return None

    # ── WhatsApp Cloud API ─────────────────────────────────────────────

    @staticmethod
    def normalize_whatsapp_number(number: str, default_ddi: str = "55") -> str:
        """
        Normaliza número no formato ddidddnumero (somente dígitos).
        Adiciona DDI 55 se ausente e nono dígito (9) para DDDs >= 29.
        """
        raw = (number or "").strip().lower()
        if not raw or raw.startswith("ig:"):
            return ""

        if "@" in raw:
            raw = raw.split("@")[0]

        digits = "".join(ch for ch in raw if ch.isdigit())
        if not digits:
            return ""

        if digits.startswith("00") and len(digits) > 2:
            digits = digits[2:]

        if len(digits) in (10, 11):
            digits = f"{default_ddi}{digits}"
        elif len(digits) not in (12, 13):
            return ""

        if len(digits) == 12 and digits[:2] == "55":
            ddd = int(digits[2:4])
            local = digits[4:]
            if ddd >= 29 and local[0] in ("6", "7", "8", "9"):
                digits = f"55{ddd}9{local}"

        return digits

    def _get_wa_headers(self) -> dict:
        """Headers para chamadas à WhatsApp Cloud API."""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _extract_wa_error_code(self, response: requests.Response) -> Optional[int]:
        """Extrai o código de erro da resposta da Cloud API."""
        try:
            error_data = response.json().get("error", {})
            return error_data.get("code")
        except Exception:
            return None

    def send_whatsapp_text(self, to: str, text: str, reply_message_id: str = None) -> Optional[dict]:
        """
        Envia mensagem de texto via WhatsApp Cloud API.
        Retorna dict da resposta ou None em caso de erro.
        """
        clean = self.normalize_whatsapp_number(to)
        if not clean:
            print(f"[MetaService] Invalid WA number: {to}")
            return None

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        payload: Dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean,
            "type": "text",
            "text": {"preview_url": True, "body": text},
        }
        if reply_message_id:
            payload["context"] = {"message_id": reply_message_id}

        try:
            resp = requests.post(url, headers=self._get_wa_headers(), json=payload, timeout=15)
            if resp.status_code != 200:
                error_code = self._extract_wa_error_code(resp)
                print(f"[MetaService] WA text failed: HTTP {resp.status_code}, code={error_code}, body={resp.text[:200]}")
                return {"error": True, "error_code": error_code, "status_code": resp.status_code}
            result = resp.json()
            msg_ids = result.get("messages", [])
            if msg_ids:
                self._sent_message_ids[msg_ids[0]["id"]] = time.time()
            return result
        except Exception as e:
            print(f"[MetaService] Error sending WA text: {e}")
            return None

    # Backward compat alias
    def send_whatsapp_message(self, to: str, text: str) -> Optional[dict]:
        """Alias para send_whatsapp_text (compatibilidade)."""
        return self.send_whatsapp_text(to, text)

    def send_whatsapp_image(self, to: str, image_url: str, caption: str = "") -> Optional[dict]:
        """Envia imagem via WhatsApp Cloud API usando URL pública."""
        clean = self.normalize_whatsapp_number(to)
        if not clean:
            print(f"[MetaService] Invalid WA number for image: {to}")
            return None

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        payload: Dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean,
            "type": "image",
            "image": {"link": image_url},
        }
        if caption:
            payload["image"]["caption"] = caption

        try:
            resp = requests.post(url, headers=self._get_wa_headers(), json=payload, timeout=15)
            if resp.status_code != 200:
                print(f"[MetaService] WA image failed: {resp.status_code} - {resp.text[:200]}")
                return None
            return resp.json()
        except Exception as e:
            print(f"[MetaService] Error sending WA image: {e}")
            return None

    def send_whatsapp_reaction(self, to: str, message_id: str, emoji: str = "❤️") -> Optional[dict]:
        """Envia reação (emoji) a uma mensagem via WhatsApp Cloud API."""
        clean = self.normalize_whatsapp_number(to)
        if not clean:
            return None

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean,
            "type": "reaction",
            "reaction": {"message_id": message_id, "emoji": emoji},
        }
        try:
            resp = requests.post(url, headers=self._get_wa_headers(), json=payload, timeout=10)
            if resp.status_code != 200:
                print(f"[MetaService] WA reaction failed: {resp.status_code} - {resp.text[:200]}")
                return None
            return resp.json()
        except Exception as e:
            print(f"[MetaService] Error sending WA reaction: {e}")
            return None

    def send_whatsapp_interactive_buttons(
        self, to: str, body_text: str, buttons: List[Dict],
        header_text: str = None, footer_text: str = None,
    ) -> Optional[dict]:
        """
        Envia mensagem interativa com botões (max 3) via WhatsApp Cloud API.
        buttons: [{"id": "btn_id", "title": "Texto do Botão"}, ...]
        """
        clean = self.normalize_whatsapp_number(to)
        if not clean:
            return None

        wa_buttons = []
        for i, b in enumerate(buttons[:3]):
            wa_buttons.append({
                "type": "reply",
                "reply": {
                    "id": str(b.get("id", f"btn_{i}"))[:256],
                    "title": str(b.get("title", b.get("text", "Opção")))[:20],
                },
            })

        interactive: Dict[str, Any] = {
            "type": "button",
            "body": {"text": body_text[:1024]},
            "action": {"buttons": wa_buttons},
        }
        if header_text:
            interactive["header"] = {"type": "text", "text": header_text[:60]}
        if footer_text:
            interactive["footer"] = {"text": footer_text[:60]}

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean,
            "type": "interactive",
            "interactive": interactive,
        }
        try:
            resp = requests.post(url, headers=self._get_wa_headers(), json=payload, timeout=15)
            if resp.status_code != 200:
                print(f"[MetaService] WA buttons failed: {resp.status_code} - {resp.text[:200]}")
                return None
            return resp.json()
        except Exception as e:
            print(f"[MetaService] Error sending WA buttons: {e}")
            return None

    def send_whatsapp_interactive_list(
        self, to: str, header: str, body: str,
        button_label: str, sections: List[Dict],
    ) -> Optional[dict]:
        """
        Envia mensagem interativa de lista (max 10 itens) via WhatsApp Cloud API.
        sections: [{"title": "Seção", "rows": [{"id": "row_id", "title": "...", "description": "..."}]}]
        """
        clean = self.normalize_whatsapp_number(to)
        if not clean:
            return None

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "header": {"type": "text", "text": header[:60]},
                "body": {"text": body[:1024]},
                "action": {
                    "button": button_label[:20],
                    "sections": sections,
                },
            },
        }
        try:
            resp = requests.post(url, headers=self._get_wa_headers(), json=payload, timeout=15)
            if resp.status_code != 200:
                print(f"[MetaService] WA list failed: {resp.status_code} - {resp.text[:200]}")
                return None
            return resp.json()
        except Exception as e:
            print(f"[MetaService] Error sending WA list: {e}")
            return None

    def send_whatsapp_carousel(self, to: str, title: str, items: List[Dict]) -> None:
        """
        Adapta o formato de carrossel UazAPI para Cloud API.
        Envia: título → (imagem + caption) por card → botões interativos por card.
        """
        clean = self.normalize_whatsapp_number(to)
        if not clean:
            return

        self.send_whatsapp_text(clean, title)
        time.sleep(0.5)

        for item in items[:3]:
            image_url = item.get("image")
            card_text = item.get("text", "")
            buttons = item.get("buttons", [])

            if image_url:
                self.send_whatsapp_image(clean, image_url, caption=card_text)
                time.sleep(0.5)

            if not buttons:
                buttons = [
                    {"id": f"Quero agendar uma visita para ver {card_text}", "title": "Agendar Visita"},
                    {"id": f"Me conte mais detalhes sobre {card_text}", "title": "Mais Info"},
                ]
            else:
                buttons = [
                    {"id": b.get("id", ""), "title": b.get("text", b.get("title", "Opção"))}
                    for b in buttons[:3]
                ]

            body = card_text or title
            self.send_whatsapp_interactive_buttons(clean, body, buttons)
            time.sleep(0.5)

    def send_whatsapp_template(
        self, to: str, template_name: str,
        language: str = "pt_BR",
        components: List[Dict] = None,
    ) -> Optional[dict]:
        """
        Envia Template Message via WhatsApp Cloud API.
        Necessário para mensagens fora da janela de 24h.
        """
        clean = self.normalize_whatsapp_number(to)
        if not clean:
            return None

        template_payload: Dict[str, Any] = {
            "name": template_name,
            "language": {"code": language},
        }
        if components:
            template_payload["components"] = components

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean,
            "type": "template",
            "template": template_payload,
        }
        try:
            resp = requests.post(url, headers=self._get_wa_headers(), json=payload, timeout=15)
            if resp.status_code != 200:
                error_code = self._extract_wa_error_code(resp)
                print(f"[MetaService] WA template failed: HTTP {resp.status_code}, code={error_code}")
                return None
            return resp.json()
        except Exception as e:
            print(f"[MetaService] Error sending WA template: {e}")
            return None

    def mark_whatsapp_read(self, message_id: str) -> bool:
        """Marca uma mensagem recebida como lida no WhatsApp."""
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        }
        try:
            resp = requests.post(url, headers=self._get_wa_headers(), json=payload, timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    def download_whatsapp_media(self, media_id: str) -> Optional[bytes]:
        """
        Download de mídia da WhatsApp Cloud API.
        Passo 1: GET /{media_id} para obter URL de download.
        Passo 2: GET na URL com Bearer token para baixar os bytes.
        """
        try:
            url_resp = requests.get(
                f"{self.base_url}/{media_id}",
                headers=self._get_wa_headers(),
                timeout=10,
            )
            url_resp.raise_for_status()
            media_url = url_resp.json().get("url")
            if not media_url:
                print(f"[MetaService] No URL in media response for {media_id}")
                return None

            dl_resp = requests.get(
                media_url,
                headers={"Authorization": f"Bearer {self.access_token}"},
                timeout=30,
            )
            dl_resp.raise_for_status()
            return dl_resp.content
        except Exception as e:
            print(f"[MetaService] Error downloading WA media {media_id}: {e}")
            return None

    def send_instagram_message(self, recipient_id: str, text: str) -> Optional[dict]:
        """
        Send a text message via Instagram Messaging API.
        Uses graph.facebook.com/{page_id}/messages with the Page Access Token.
        Automatically removes markdown formatting since Instagram doesn't support it.
        
        Args:
            recipient_id: The Instagram Scoped User ID (IGSID) of the recipient
            text: The text message to send (markdown will be removed automatically)
        
        Returns:
            API response dict on success, None on failure
        """
        if not self.page_id or not self.page_access_token:
            print("[MetaService] ERROR: No Page token/ID available. Cannot send Instagram message.")
            print("[MetaService] Ensure a Facebook Page is assigned to the System User.")
            return None
        
        # Remove markdown formatting for Instagram
        clean_text = remove_markdown_for_instagram(text)
        
        url = f"{self.base_url}/{self.page_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.page_access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "recipient": {"id": recipient_id},
            "messaging_type": "RESPONSE",
            "message": {"text": clean_text},
        }
        try:
            print(f"[MetaService] Sending Instagram DM to {recipient_id} via page {self.page_id}: {text[:50]}...")
            response = requests.post(url, headers=headers, json=payload)
            print(f"[MetaService] Instagram response: {response.status_code} - {response.text}")
            response.raise_for_status()
            
            result = response.json()
            # Capture the message ID to filter echoes later
            if result and "message_id" in result:
                mid = result["message_id"]
                self._sent_message_ids[mid] = time.time()
                print(f"[MetaService] Captured sent message ID: {mid}")
            
            return result
        except requests.exceptions.RequestException as e:
            print(f"[MetaService] Error sending Instagram message: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"[MetaService] Response body: {e.response.text}")
            return None

    def mark_instagram_seen(self, recipient_id: str) -> bool:
        """
        Send 'mark_seen' sender action to accept message requests and mark as read.
        Must be called before sending a reply to ensure the conversation is accepted.
        """
        if not self.page_id or not self.page_access_token:
            print("[MetaService] No Page token/ID for mark_seen")
            return False

        url = f"{self.base_url}/{self.page_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.page_access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "recipient": {"id": recipient_id},
            "sender_action": "mark_seen",
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=5)
            print(f"[MetaService] mark_seen for {recipient_id}: {response.status_code}")
            return response.status_code == 200
        except Exception as e:
            print(f"[MetaService] mark_seen failed (non-blocking): {e}")
            return False
