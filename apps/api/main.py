
from dotenv import load_dotenv
load_dotenv()

import os
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import redis.asyncio as aioredis

# Centralized logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)

import sentry_sdk
from sentry_sdk.integrations.openai import OpenAIIntegration

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN"),
    traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
    send_default_pii=False,
    environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
    integrations=[
        OpenAIIntegration(
            include_prompts=False,
        ),
    ],
)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from routers import leads, webhook, analytics, chat, events, ai_specialist, debug, follow_ups, users, sellers
from auth import verify_jwt

# Startup validation: fail fast if critical env vars are missing
REQUIRED_ENV_VARS = [
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_JWT_SECRET",
    "OPENAI_API_KEY",
    "META_ACCESS_TOKEN",
    "META_PHONE_NUMBER_ID",
    "CORS_ORIGINS",
]
_missing = [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]
if _missing:
    raise RuntimeError(f"Missing required environment variables: {_missing}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Thread pool amplo para chamadas AI concorrentes (asyncio.to_thread)
    # Default do Python e ~5-8 threads, insuficiente para GPT-5.2 + sentiment em paralelo
    loop = asyncio.get_running_loop()
    executor = ThreadPoolExecutor(max_workers=50)
    loop.set_default_executor(executor)
    print("[Startup] Thread pool configurado com 50 workers")

    # Redis connection pool for buffer_service (shared state across workers)
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=False, max_connections=20)
    app.state.redis = redis_client

    from services import buffer_service
    buffer_service.init_redis(redis_client)
    timer_task = asyncio.create_task(buffer_service.run_timer_loop())
    print(f"[Startup] Redis conectado: {redis_url}")

    print("[Startup] Follow-ups + lembretes de visita gerenciados pelo cron job do Supabase")
    print("[Startup] Endpoint: POST /api/webhook/follow-up-cron")
    yield
    timer_task.cancel()
    try:
        await timer_task
    except asyncio.CancelledError:
        pass
    await redis_client.aclose()
    executor.shutdown(wait=False)
    print("[Shutdown] API encerrada")


app = FastAPI(title="Palmas Lake Agent API", lifespan=lifespan)

# Configure CORS
cors_origins_str = os.getenv("CORS_ORIGINS")
if not cors_origins_str:
    raise RuntimeError("CORS_ORIGINS environment variable must be set (comma-separated origins)")
cors_origins = [o.strip() for o in cors_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "x-user-id"],
)

# Protected routes — require Supabase JWT (dashboard endpoints)
_jwt = [Depends(verify_jwt)]
app.include_router(leads.router, prefix="/api", tags=["leads"], dependencies=_jwt)
app.include_router(analytics.router, prefix="/api", tags=["analytics"], dependencies=_jwt)
app.include_router(chat.router, prefix="/api", tags=["chat"], dependencies=_jwt)
app.include_router(events.router, tags=["events"], dependencies=_jwt)
app.include_router(users.router, prefix="/api", tags=["users"], dependencies=_jwt)
app.include_router(sellers.router, prefix="/api", tags=["sellers"], dependencies=_jwt)

# Unprotected routes — called by external services (UAZAPI, Meta, Supabase cron)
app.include_router(webhook.router, prefix="/api", tags=["webhook"])
app.include_router(follow_ups.router, prefix="/api", tags=["follow-ups"])
app.include_router(ai_specialist.router, tags=["AI Specialist"])

if os.getenv("ENVIRONMENT") == "development":
    app.include_router(debug.router, prefix="/api", tags=["debug"])

@app.get("/")
def read_root():
    return {"message": "Palmas Lake Agent API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
