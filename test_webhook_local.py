
import requests
import json
import time

URL = "http://localhost:8000/api/webhook/uazapi"

payload = {
    "event": "messages.upsert",
    "instance": "PalmasLakeBot",
    "data": {
        "key": {
            "remoteJid": "5563999999999@c.us",
            "fromMe": False,
            "id": "MSG_TEST_LOCAL_123"
        },
        "message": {
            "conversation": "Olá Sofia, quero agendar uma visita amanha as 10h. Meu nome é Teste Local Silva."
        },
        "messageType": "conversation"
    },
    "destination": "webhook_url"
}

print(f"Sending POST to {URL}...")
print(f"Payload: {json.dumps(payload, indent=2)}")

try:
    response = requests.post(URL, json=payload, timeout=5)
    with open("test_result.txt", "w") as f:
        f.write(f"Status: {response.status_code}\nOutput: {response.text}")
    
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        print("\n✅ Webhook accepted locally.")
    else:
        print("\n❌ Webhook rejected.")
except Exception as e:
    with open("test_result.txt", "w") as f:
        f.write(f"Error: {e}")
    print(f"\n❌ Connection failed: {e}")
    print("Is the backend running?")
