
import os
import requests
from typing import Dict, Any

class MetaService:
    def __init__(self):
        self.access_token = os.environ.get("META_ACCESS_TOKEN")
        self.phone_number_id = os.environ.get("META_PHONE_NUMBER_ID")
        self.base_url = "https://graph.facebook.com/v18.0"

    def send_whatsapp_message(self, to: str, text: str):
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
            print(f"Error sending Meta message: {e}")
            return None

    def send_instagram_message(self, recipient_id: str, text: str):
         # Logic for Instagram Send API
        pass
