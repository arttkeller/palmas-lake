"""
Metrics API router.
Exposes aggregated AI, HTTP, business, routing, and cache metrics.
"""
from fastapi import APIRouter, Depends
from auth import verify_jwt
from services.observability import metrics

router = APIRouter(prefix="/api", tags=["metrics"], dependencies=[Depends(verify_jwt)])


@router.get("/metrics/summary")
async def get_metrics_summary():
    """Returns aggregated metrics from Redis counters."""
    return await metrics.get_summary()
