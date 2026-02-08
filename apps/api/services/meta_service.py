
import os
import requests
from typing import Optional

class MetaService:
    def __init__(self):
        self.access_token = os.environ.get("META_ACCESS_TOKEN")
        self.phone_number_id = os.environ.get("META_PHONE_NUMBER_ID")
        self.base_url = "https://graph.facebook.com/v21.0"

    def send_whatsapp_message(self, to: str, text: str):
        """Send a text message via Meta WhatsApp Business API."""
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }
        data = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        try:
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error sending Meta WhatsApp message: {e}")
            return None

    def send_instagram_message(self, recipient_id: str, text: str) -> Optional[dict]:
        """
        Send a text message via Instagram Messaging API (Meta Graph API).
        
        Args:
            recipient_id: The Instagram Scoped User ID (IGSID) of the recipient
            text: The text message to send
        
        Returns:
            API response dict on success, None on failure
        """
        url = f"{self.base_url}/me/messages"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "recipient": {"id": recipient_id},
            "message": {"text": text},
        }
        try:
            print(f"[MetaService] Sending Instagram DM to {recipient_id}: {text[:50]}...")
            response = requests.post(url, headers=headers, json=payload)
            print(f"[MetaService] Instagram response: {response.status_code} - {response.text}")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"[MetaService] Error sending Instagram message: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"[MetaService] Response body: {e.response.text}")
            return None
