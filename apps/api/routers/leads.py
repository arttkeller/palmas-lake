from fastapi import APIRouter, HTTPException, Depends, Query
from services.supabase_client import create_client
from services.sentiment_service import SentimentService
import os
from pydantic import BaseModel
from typing import Any, List, Optional

router = APIRouter()

def get_db():
    try:
        return create_client()
    except Exception as e:
        print(f"Error connecting to Supabase: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")

class LeadBase(BaseModel):
    full_name: str
    phone: str
    email: Optional[str] = None
    status: Optional[str] = 'novo_lead'
    notes: Optional[str] = None

class LeadCreate(LeadBase):
    source: Optional[str] = None
    temperature: Optional[str] = None
    tags: Optional[List[str]] = None
    conversation_summary: Optional[str] = None
    interest_type: Optional[str] = None
    classification_type: Optional[str] = None
    budget_range: Optional[str] = None
    city_origin: Optional[str] = None

class Lead(LeadBase):
    id: str
    created_at: str
    sentiment_score: Optional[int] = None
    sentiment_label: Optional[str] = None
    interest_type: Optional[str] = None
    temperature: Optional[str] = None
    tags: Optional[Any] = None
    adjectives: Optional[Any] = None
    last_analysis: Optional[Any] = None
    conversation_summary: Optional[str] = None
    source: Optional[str] = None
    instagram_id: Optional[str] = None

@router.get("/leads")
def get_leads(limit: int = Query(default=100, le=500), offset: int = Query(default=0, ge=0)):
    """Returns leads with pagination. Default: 100 per page."""
    supabase = get_db()
    response = supabase.table("leads").select("*").order("created_at", "desc").limit(limit).offset(offset).execute()
    return response.data

@router.post("/leads", response_model=Lead)
def create_lead(lead: LeadCreate):
    supabase = get_db()
    data = lead.dict(exclude_unset=True)
    response = supabase.table("leads").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Could not create lead")
    return response.data[0]

class LeadStatusUpdate(BaseModel):
    status: str

@router.patch("/leads/{lead_id}")
def update_lead(lead_id: str, body: LeadStatusUpdate):
    supabase = get_db()
    response = supabase.table("leads").update({"status": body.status}).eq("id", lead_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=400, detail=f"Could not update lead {lead_id}")
    
    # Trigger sentiment recalculation on status change
    try:
        sentiment_service = SentimentService()
        sentiment_service.update_on_status_change(lead_id, body.status)
    except Exception as e:
        print(f"Sentiment update failed (non-blocking): {e}")
    
    return response.data
