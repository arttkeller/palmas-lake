
from dotenv import load_dotenv
load_dotenv()

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import leads, webhook, analytics, chat, events, ai_specialist, debug, follow_ups


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Follow-ups são processados pelo cron job do Supabase (pg_cron + pg_net)
    # que chama POST /api/webhook/follow-up-cron a cada 5 minutos.
    # Nenhum scheduler in-process é necessário.
    print("[Startup] Follow-ups gerenciados pelo cron job do Supabase")
    print("[Startup] Endpoint: POST /api/webhook/follow-up-cron")
    yield
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

@app.get("/")
def read_root():
    return {"message": "Palmas Lake Agent API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
