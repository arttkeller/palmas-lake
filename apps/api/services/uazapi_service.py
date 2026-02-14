
import os
import requests
import json
from typing import List, Dict, Any

class UazapiService:
    def __init__(self):
        self.base_url = os.environ.get("UAZAPI_URL", "https://blackai.uazapi.com")
        self.msg_token = os.environ.get("UAZAPI_TOKEN") # Instance Token (or API Token)

    def _get_headers(self):
        return {
            "token": self.msg_token,
            "Content-Type": "application/json"
        }

    @staticmethod
    def normalize_whatsapp_number(number: str, default_ddi: str = "55") -> str:
        """
        Normaliza número no formato ddidddnumero (somente dígitos).
        Adiciona DDI 55 se ausente e nono dígito (9) para DDDs >= 29.
        Exemplos válidos:
        - 5563999991234
        - 5511999999999
        """
        raw = (number or "").strip().lower()
        if not raw or raw.startswith("ig:"):
            return ""

        if "@" in raw:
            raw = raw.split("@")[0]

        digits = "".join(ch for ch in raw if ch.isdigit())
        if not digits:
            return ""

        # Remove prefixo internacional "00" quando presente (ex.: 0055...)
        if digits.startswith("00") and len(digits) > 2:
            digits = digits[2:]

        # Local BR (DDD + número) => adiciona DDI padrão
        if len(digits) in (10, 11):
            digits = f"{default_ddi}{digits}"
        # Já possui DDI + DDD + número
        elif len(digits) not in (12, 13):
            return ""

        # Agora digits tem formato 55DDDNUMERO (12 ou 13 dígitos)
        # Adicionar nono dígito para celulares de DDDs >= 29 que ainda não têm
        if len(digits) == 12 and digits[:2] == "55":
            ddd = int(digits[2:4])
            local = digits[4:]  # 8 dígitos
            # DDDs >= 29 (fora de SP metro) usam nono dígito obrigatório
            # Celulares começam com 9, 8, 7 ou 6
            if ddd >= 29 and local[0] in ("6", "7", "8"):
                digits = f"55{ddd}9{local}"
                print(f"[Normalize] Added 9th digit: {digits}")

        return digits

    def send_whatsapp_message(self, number: str, text: str, reply_id: str = None):
        """
        Sends a text message via UazAPI /send/text.
        """
        clean_number = self.normalize_whatsapp_number(number)
        if not clean_number:
            print(f"Error sending UazAPI message: invalid WhatsApp number format '{number}' (expected ddidddnumero)")
            return None
        
        url = f"{self.base_url}/send/text"
        
        payload = {
            "number": clean_number,
            "text": text,
            "linkPreview": True,
            "delay": 1000
        }
        
        if reply_id:
             payload["replyid"] = reply_id

        try:
            print(f"Sending Text to UazAPI: {url}")
            response = requests.post(url, headers=self._get_headers(), json=payload)
            print(f"UazAPI Response: {response.status_code} - {response.text}")
            return response.json()
        except Exception as e:
            print(f"Error sending UazAPI message: {e}")
            return None

    def send_image(self, number: str, image_url: str, caption: str = ""):
        """
        Sends an image via UazAPI /send/media.
        """
        clean_number = self.normalize_whatsapp_number(number)
        if not clean_number:
            print(f"Error sending UazAPI image: invalid WhatsApp number format '{number}' (expected ddidddnumero)")
            return None
        url = f"{self.base_url}/send/media"
        
        payload = {
            "number": clean_number,
            "type": "image",
            "file": image_url,
            "text": caption,
            "delay": 1000
        }
        
        try:
            print(f"Sending Media to UazAPI: {url}")
            response = requests.post(url, headers=self._get_headers(), json=payload)
            print(f"UazAPI Image Response: {response.status_code} - {response.text}")
            return response.json()
        except Exception as e:
            print(f"Error sending UazAPI image: {e}")
            return None

    def send_carousel(self, number: str, title: str, items: List[Dict[str, Any]]):
        """
        Sends a carousel of images/cards via UazAPI /send/carousel.
        
        items should be a list of dicts with:
        - text: Card Text
        - image: Image URL
        - buttons: List of button dicts (optional)
        """
        clean_number = self.normalize_whatsapp_number(number)
        if not clean_number:
            print(f"Error sending UazAPI carousel: invalid WhatsApp number format '{number}' (expected ddidddnumero)")
            return None
        url = f"{self.base_url}/send/carousel"
        
        carousel_cards = []
        for item in items:
            raw_buttons = item.get("buttons")
            if not raw_buttons:
                # Default interactive buttons
                # In UazAPI carousels, 'id' is the text sent back to the chat for REPLY types.
                # So we make the ID more descriptive for the AI to handle the response.
                card_name = item.get('text', 'este item')
                buttons = [
                    {
                        "id": f"Quero agendar uma visita para ver {card_name}",
                        "text": "📅 Agendar Visita",
                        "type": "REPLY"
                    },
                    {
                        "id": f"Me conte mais detalhes sobre {card_name}",
                        "text": "ℹ️ Mais Info",
                        "type": "REPLY"
                    }
                ]
            else:
                buttons = []
                for b in raw_buttons:
                    # UazAPI uses 'text' as the visible label and 'id' as the action/value
                    btn = {
                        "type": b.get("type", "REPLY").upper(),
                        "text": b.get("text") or b.get("label", "Botão"),
                        "id": b.get("id") or b.get("url") or b.get("phone", "")
                    }
                    buttons.append(btn)

            card = {
                "text": item.get("text", "Detalhes"),
                "image": item.get("image"),
                "buttons": buttons
            }
            carousel_cards.append(card)

        payload = {
            "number": clean_number,
            "text": title,
            "carousel": carousel_cards,
            "delay": 1000,
            "readchat": True
        }
        
        try:
            print(f"Sending Carousel to UazAPI: {url}")
            response = requests.post(url, headers=self._get_headers(), json=payload)
            print(f"UazAPI Carousel Response: {response.status_code} - {response.text}")
            return response.json()
        except Exception as e:
            print(f"Error sending UazAPI carousel: {e}")
            return None

    def download_audio(
        self,
        url: str,
        media_key: str,
        mimetype: str,
        file_sha256: str,
        file_length: int,
        file_enc_sha256: str = None,
    ) -> str | None:
        """
        Downloads and decrypts an audio file via UazAPI /chat/downloadaudio.
        Returns the base64-encoded decrypted audio, or None on failure.
        """
        endpoint = f"{self.base_url}/chat/downloadaudio"
        payload = {
            "Url": url,
            "MediaKey": media_key,
            "Mimetype": mimetype,
            "FileSHA256": file_sha256,
            "FileLength": int(file_length),
        }
        if file_enc_sha256:
            payload["FileEncSHA256"] = file_enc_sha256

        try:
            print(f"[UazAPI] Downloading audio from {endpoint}")
            response = requests.post(
                endpoint, headers=self._get_headers(), json=payload, timeout=30
            )
            if response.status_code != 200:
                print(f"[UazAPI] downloadaudio failed: HTTP {response.status_code} - {response.text[:300]}")
                return None

            data = response.json()
            # WuzAPI/UazAPI returns base64 in various possible keys
            b64 = data.get("Data") or data.get("data") or data.get("base64")
            if isinstance(b64, str) and b64.strip():
                print(f"[UazAPI] Audio downloaded successfully ({len(b64)} base64 chars)")
                return b64.strip()

            # If the response itself is a plain base64 string
            text = response.text.strip()
            if len(text) > 100 and not text.startswith("{"):
                print(f"[UazAPI] Audio downloaded as raw base64 ({len(text)} chars)")
                return text

            print(f"[UazAPI] downloadaudio returned unexpected format: {response.text[:300]}")
            return None
        except Exception as exc:
            print(f"[UazAPI] Error downloading audio: {exc}")
            return None

    def send_reaction(self, number: str, message_id: str, emoji: str = "❤️"):
        """
        Sends a reaction via UazAPI /message/react.
        """
        clean_number = self.normalize_whatsapp_number(number)
        if not clean_number:
            print(f"Error sending UazAPI reaction: invalid WhatsApp number format '{number}' (expected ddidddnumero)")
            return None
        url = f"{self.base_url}/message/react"
        
        payload = {
            "number": clean_number,
            "text": emoji,
            "id": message_id
        }
        
        try:
            print(f"Sending Reaction to UazAPI: {url}")
            response = requests.post(url, headers=self._get_headers(), json=payload)
            print(f"UazAPI Reaction Response: {response.status_code} - {response.text}")
            return response.json()
        except Exception as e:
            print(f"Error sending UazAPI reaction: {e}")
            return None
