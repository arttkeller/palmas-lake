"""
Execution Logs API router.
Exposes individual pipeline execution events for the monitoring dashboard.
"""
from fastapi import APIRouter, Depends, Query
from auth import verify_jwt
from services.supabase_client import create_client

router = APIRouter(prefix="/api", tags=["executions"], dependencies=[Depends(verify_jwt)])


@router.get("/executions")
async def get_executions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    type: str | None = Query(None, description="Filter by type: IN, OUT, PROCESS, TOOL, ERROR"),
    lead_id: str | None = Query(None, description="Filter by lead_id"),
):
    """
    Returns execution log entries ordered by timestamp DESC.
    Supports pagination via limit/offset and optional type/lead_id filters.
    """
    sb = create_client()
    query = (
        sb.table("execution_logs")
        .select("*")
        .order("timestamp", desc=True)
        .limit(limit)
        .offset(offset)
    )
    if type:
        query = query.eq("type", type.upper())
    if lead_id:
        query = query.eq("lead_id", lead_id)

    result = query.execute()
    return {"data": result.data or [], "count": len(result.data or [])}


@router.get("/executions/{execution_id}")
async def get_execution_detail(execution_id: str):
    """Returns a single execution log entry by ID."""
    sb = create_client()
    result = (
        sb.table("execution_logs")
        .select("*")
        .eq("id", execution_id)
        .single()
        .execute()
    )
    return result.data
