
from dotenv import load_dotenv
load_dotenv()

import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import sentry_sdk
from sentry_sdk.integrations.openai import OpenAIIntegration

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN"),
    # Required for AI agent monitoring
    traces_sample_rate=1.0,
    # Add data like inputs and responses to/from LLMs and tools
    send_default_pii=True,
    environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
    integrations=[
        OpenAIIntegration(
            include_prompts=True,
        ),
    ],
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import leads, webhook, analytics, chat, events, ai_specialist, debug, follow_ups, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Thread pool amplo para chamadas AI concorrentes (asyncio.to_thread)
    # Default do Python e ~5-8 threads, insuficiente para GPT-5.2 + sentiment em paralelo
    loop = asyncio.get_running_loop()
    executor = ThreadPoolExecutor(max_workers=50)
    loop.set_default_executor(executor)
    print("[Startup] Thread pool configurado com 50 workers")

    print("[Startup] Follow-ups + lembretes de visita gerenciados pelo cron job do Supabase")
    print("[Startup] Endpoint: POST /api/webhook/follow-up-cron")
    yield
    executor.shutdown(wait=False)
    print("[Shutdown] API encerrada")


app = FastAPI(title="Palmas Lake Agent API", lifespan=lifespan)

# Configure CORS
cors_origins_str = os.getenv("CORS_ORIGINS", "*")
cors_origins = ["*"] if cors_origins_str == "*" else [o.strip() for o in cors_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(leads.router, prefix="/api", tags=["leads"])
app.include_router(webhook.router, prefix="/api", tags=["webhook"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(events.router, tags=["events"])
app.include_router(ai_specialist.router, tags=["AI Specialist"])
if os.getenv("ENVIRONMENT") != "production":
    app.include_router(debug.router, prefix="/api", tags=["debug"])
app.include_router(follow_ups.router, prefix="/api", tags=["follow-ups"])
app.include_router(users.router, prefix="/api", tags=["users"])

@app.get("/")
def read_root():
    return {"message": "Palmas Lake Agent API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
