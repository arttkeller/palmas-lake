
import requests
import os
from dotenv import load_dotenv

load_dotenv("apps/api/.env")

url_base = os.environ.get("UAZAPI_URL")
token = os.environ.get("UAZAPI_TOKEN")
instance = "blackai-site"
number = "5527998724593" # User's number from log

endpoints = [
    f"{url_base}/message/sendText/5527997463733",
]

payload = {
    "number": number,
    "text": "test"
}

headers = {
    "apikey": token,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

for url in endpoints:
    try:
        print(f"Testing: {url}")
        res = requests.post(url, headers=headers, json=payload, timeout=5)
        print(f"Response {res.status_code}: {res.text}\n")
    except Exception as e:
        print(f"Error on {url}: {e}\n")
