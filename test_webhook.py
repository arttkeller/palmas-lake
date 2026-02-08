
import requests
import json

url = "http://127.0.0.1:8000/api/webhook/uazapi"
payload = {
    "event": "messages.upsert",
    "data": {
        "key": {
            "remoteJid": "5511999999999@s.whatsapp.net",
            "fromMe": False
        },
        "message": {
            "conversation": "Teste Local de Webhook"
        }
    }
}

try:
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")
