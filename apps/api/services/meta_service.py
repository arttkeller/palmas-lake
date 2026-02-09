
import os
import re
import requests
import time
from typing import Optional, Dict, Set


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
        # Learned automatically from incoming messages
        self.instagram_scoped_id: Optional[str] = None
        
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
                # Use the first page that has MESSAGING task
                for page in pages:
                    tasks = page.get("tasks", [])
                    if "MESSAGING" in tasks or not tasks:
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

    def learn_own_igsid(self, recipient_id: str):
        """
        Learn our own Instagram Scoped ID from an incoming message.
        The recipient_id of a message sent TO us is OUR ID.
        """
        if not self.instagram_scoped_id and recipient_id:
            self.instagram_scoped_id = recipient_id
            print(f"[MetaService] Learned own IGSID: {self.instagram_scoped_id}")

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
            "fields": "name,username",
            "access_token": token,
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
