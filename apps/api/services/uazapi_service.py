
import os
import requests
import json
from typing import List, Dict

class UazapiService:
    def __init__(self):
        self.base_url = os.environ.get("UAZAPI_URL", "https://blackai.uazapi.com")
        self.msg_token = os.environ.get("UAZAPI_TOKEN") # Instance Token (or API Token)

    def _get_headers(self):
        return {
            "token": self.msg_token,
            "Content-Type": "application/json"
        }

    def send_whatsapp_message(self, number: str, text: str, reply_id: str = None):
        """
        Sends a text message via UazAPI /send/text.
        """
        clean_number = number.replace("+", "").replace(" ", "").replace("-", "")
        
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
        clean_number = number.replace("+", "").replace(" ", "").replace("-", "")
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
        clean_number = number.replace("+", "").replace(" ", "").replace("-", "")
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

    def send_reaction(self, number: str, message_id: str, emoji: str = "❤️"):
        """
        Sends a reaction via UazAPI /message/react.
        """
        clean_number = number.replace("+", "").replace(" ", "").replace("-", "")
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
