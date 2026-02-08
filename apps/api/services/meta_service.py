
import os
import requests
from typing import Optional, Dict

class MetaService:
    def __init__(self):
        # Strip whitespace/newlines from token to prevent "Cannot parse access token" errors
        raw_token = os.environ.get("META_ACCESS_TOKEN", "")
        self.access_token = raw_token.strip() if raw_token else ""
        self.phone_number_id = os.environ.get("META_PHONE_NUMBER_ID")
        self.whatsapp_base_url = "https://graph.facebook.com/v24.0"
        self.instagram_base_url = "https://graph.instagram.com/v24.0"
        
        if self.access_token:
            print(f"[MetaService] Token loaded (length={len(self.access_token)}, starts_with={self.access_token[:10]}...)")
        else:
            print("[MetaService] WARNING: META_ACCESS_TOKEN is not set!")

    def get_instagram_profile(self, user_id: str) -> Optional[Dict]:
        """
        Fetch Instagram user profile (name and username) via Graph API.
        
        Args:
            user_id: The Instagram Scoped User ID (IGSID)
        
        Returns:
            Dict with 'name' and 'username' keys, or None on failure
        """
        url = f"{self.instagram_base_url}/{user_id}"
        params = {
            "fields": "name,username",
            "access_token": self.access_token,
        }
        try:
            print(f"[MetaService] Fetching Instagram profile for {user_id}...")
            response = requests.get(url, params=params)
            print(f"[MetaService] Profile response: {response.status_code} - {response.text}")
            response.raise_for_status()
            data = response.json()
            return {
                "name": data.get("name", ""),
                "username": data.get("username", ""),
            }
        except requests.exceptions.RequestException as e:
            print(f"[MetaService] Error fetching Instagram profile: {e}")
            return None

    def send_whatsapp_message(self, to: str, text: str):
        """Send a text message via Meta WhatsApp Business API."""
        url = f"{self.whatsapp_base_url}/{self.phone_number_id}/messages"
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
        Send a text message via Instagram Messaging API.
        
        Args:
            recipient_id: The Instagram Scoped User ID (IGSID) of the recipient
            text: The text message to send
        
        Returns:
            API response dict on success, None on failure
        """
        url = f"{self.instagram_base_url}/me/messages"
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
