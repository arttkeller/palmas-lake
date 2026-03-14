"""
Metrics API router.
Exposes aggregated AI, HTTP, business, routing, and cache metrics.
"""
from fastapi import APIRouter, Depends, Query
from auth import verify_jwt
from services.observability import metrics

router = APIRouter(prefix="/api", tags=["metrics"], dependencies=[Depends(verify_jwt)])


@router.get("/metrics/summary")
async def get_metrics_summary(
    period: str = Query(default="today", description="Period: today, 7d, 30d, 90d, all"),
):
    """
    Returns aggregated metrics.

    - ``today``: live counters from Redis (24 h rolling window)
    - ``7d``, ``30d``, ``90d``, ``all``: reconstructed from Supabase execution_logs
    """
    if period == "today":
        return await metrics.get_summary()
    return await metrics.get_summary_from_logs(period)
