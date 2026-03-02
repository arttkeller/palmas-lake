"""
Events Router - API para gerenciamento de agendamentos
"""
import asyncio
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from services.supabase_client import create_client
from services.meta_service import MetaService

router = APIRouter(prefix="/api/events", tags=["Events"])


def normalize_whatsapp_phone(value: Optional[str]) -> str:
    """Normaliza número no padrão ddidddnumero."""
    return MetaService.normalize_whatsapp_number(value or "")

# Models
class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    color: Optional[str] = "blue"
    category: Optional[str] = "Visita"
    lead_id: Optional[str] = None
    lead_name: Optional[str] = None
    lead_phone: Optional[str] = None
    lead_email: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "confirmado"

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    color: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


@router.get("")
async def list_events(
    start_date: Optional[str] = Query(None, description="Filter by start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter by end date (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, le=500)
):
    """Lista todos os eventos/agendamentos"""
    try:
        supabase = create_client()
        query = supabase.table("events").select("*")

        if start_date:
            query = query.gte("start_time", f"{start_date}T00:00:00")
        if end_date:
            query = query.lte("start_time", f"{end_date}T23:59:59")
        if status:
            query = query.eq("status", status)

        query = query.order("start_time", direction="asc").limit(limit)

        result = await asyncio.to_thread(query.execute)
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{event_id}")
async def get_event(event_id: str):
    """Busca um evento específico"""
    try:
        supabase = create_client()
        result = await asyncio.to_thread(
            supabase.table("events").select("*").eq("id", event_id).execute
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Event not found")

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_event(event: EventCreate):
    """Cria um novo evento/agendamento"""
    try:
        supabase = create_client()

        resolved_lead_phone = normalize_whatsapp_phone(event.lead_phone)
        if event.lead_id:
            lead_res = await asyncio.to_thread(
                supabase
                .table("leads")
                .select("phone, source, instagram_id")
                .eq("id", event.lead_id)
                .execute
            )
            lead_data = lead_res.data[0] if lead_res.data else {}
            if not resolved_lead_phone:
                resolved_lead_phone = normalize_whatsapp_phone(lead_data.get("phone"))

            is_instagram_lead = (
                str(lead_data.get("source") or "").strip().lower() == "instagram"
                or bool(lead_data.get("instagram_id"))
            )
            if is_instagram_lead and not resolved_lead_phone:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Para leads do Instagram, informe um telefone WhatsApp válido "
                        "no formato ddidddnumero "
                        "antes de agendar."
                    ),
                )
        
        event_data = {
            "title": event.title,
            "description": event.description,
            "start_time": event.start_time.isoformat(),
            "end_time": event.end_time.isoformat(),
            "color": event.color,
            "category": event.category,
            "lead_id": event.lead_id,
            "lead_name": event.lead_name,
            "lead_phone": resolved_lead_phone or None,
            "lead_email": event.lead_email,
            "location": event.location,
            "notes": event.notes,
            "status": event.status,
            "created_by": "manual"
        }
        
        result = await asyncio.to_thread(
            supabase.table("events").insert(event_data).execute
        )

        if result.data:
            return result.data[0]
        else:
            raise HTTPException(status_code=500, detail="Failed to create event")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{event_id}")
async def update_event(event_id: str, event: EventUpdate):
    """Atualiza um evento existente"""
    try:
        supabase = create_client()
        
        # Build update data (only non-None fields)
        update_data = {}
        for field, value in event.model_dump().items():
            if value is not None:
                if isinstance(value, datetime):
                    update_data[field] = value.isoformat()
                else:
                    update_data[field] = value

        # If the visit time changes, reminder must be recalculated/sent again.
        if "start_time" in update_data:
            update_data["reminder_1h_sent"] = False
            update_data["reminder_1h_sent_at"] = None
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = await asyncio.to_thread(
            supabase.table("events").update(update_data).eq("id", event_id).execute
        )

        if result.data:
            return result.data[0]
        else:
            raise HTTPException(status_code=404, detail="Event not found")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{event_id}")
async def delete_event(event_id: str):
    """Remove um evento"""
    try:
        supabase = create_client()
        result = await asyncio.to_thread(
            supabase.table("events").delete().eq("id", event_id).execute
        )

        if result.data:
            return {"deleted": True, "id": event_id}
        else:
            raise HTTPException(status_code=404, detail="Event not found")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
