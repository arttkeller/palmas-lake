
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from services.analytics_service import AnalyticsService
from services.analytics_cache_service import shared_cache_service as cache_service
import io
import asyncio

router = APIRouter()
service = AnalyticsService()

@router.get("/analytics/dashboard")
def get_dashboard_metrics():
    return service.get_dashboard_metrics()


@router.get("/analytics/cached")
async def get_cached_analytics(metric_type: str = Query(default="dashboard", description="Type of metrics to retrieve")):
    """
    Returns cached analytics metrics instantly from the analytics_cache table.
    
    This endpoint provides pre-calculated metrics without waiting for computation,
    enabling instant dashboard loading. Includes an is_stale flag to indicate
    if the data is older than 5 minutes.
    
    If the cache is empty, triggers a background calculation automatically
    and returns is_calculating: true so the frontend knows to poll again.
    
    Args:
        metric_type: Type of metrics to retrieve (default: 'dashboard')
        
    Returns:
        Cached metrics with metadata including:
        - data: The cached metrics
        - calculated_at: When the metrics were last calculated
        - calculation_duration_ms: How long the calculation took
        - is_stale: True if data is older than 5 minutes
        - trigger_source: What triggered the last calculation
        - is_calculating: True if a background calculation was just triggered
        
    Requirements: 1.1 - Provide cached metrics within 100ms
    Requirements: 3.3 - Trigger background calculation when cache is empty
    """
    cached = cache_service.get_cached_metrics(metric_type=metric_type)
    
    if cached is None:
        # Trigger background calculation when cache is empty (Requirement 3.3)
        asyncio.create_task(
            cache_service.process_analytics_background(
                trigger_source='auto_empty_cache',
                metric_type=metric_type
            )
        )
        return {
            "data": None,
            "calculated_at": None,
            "calculation_duration_ms": None,
            "is_stale": True,
            "trigger_source": None,
            "is_calculating": True,
            "message": "Cache is empty. Background calculation has been triggered."
        }
    
    # Normalize cached row into consistent response format (Requirements 2.1, 2.2)
    return {
        "data": cached.get("data"),
        "calculated_at": cached.get("calculated_at"),
        "calculation_duration_ms": cached.get("calculation_duration_ms"),
        "is_stale": cached.get("is_stale", False),
        "trigger_source": cached.get("trigger_source"),
        "is_calculating": False,
    }


@router.post("/analytics/refresh")
async def refresh_analytics(
    metric_type: str = Query(default="dashboard", description="Type of metrics to refresh")
):
    """
    Triggers immediate analytics recalculation, bypassing the debounce window.
    
    This endpoint is used for manual refresh requests where the user expects
    immediate results. The calculation happens in the background and the
    response is returned immediately without waiting for completion.
    
    Args:
        metric_type: Type of metrics to refresh (default: 'dashboard')
        
    Returns:
        Acknowledgment that the refresh has been triggered.
        
    Requirements: 4.3 - Manual refresh triggers immediate calculation
    """
    # Define the async refresh function
    async def do_refresh():
        await cache_service.force_recalculation(trigger_source='manual_refresh')
    
    # Schedule the force recalculation in the background
    # Use asyncio.create_task to run the coroutine
    asyncio.create_task(do_refresh())
    
    return {
        "status": "refresh_triggered",
        "message": "Analytics recalculation has been triggered. The cache will be updated shortly.",
        "metric_type": metric_type
    }

@router.get("/analytics/sentiment")
def analyze_all_sentiments():
    """
    Analisa o sentimento de TODOS os leads.
    Usa OpenAI para análise das mensagens e retorna scores de -100 a +100.
    CUIDADO: Pode consumir tokens se tiver muitos leads.
    """
    return service.analyze_lead_sentiment()

@router.get("/analytics/sentiment/{lead_id}")
def analyze_lead_sentiment(lead_id: str):
    """
    Analisa o sentimento de um lead específico.
    """
    return service.analyze_lead_sentiment(lead_id=lead_id)

@router.get("/analytics/export")
def export_analytics_excel():
    """
    Exporta relatório de analytics em formato Excel.
    Retorna arquivo .xlsx com todas as métricas.
    """
    import pandas as pd
    from datetime import datetime
    
    data = service.get_dashboard_metrics()
    
    # Criar arquivo Excel em memória
    output = io.BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Aba 1: Resumo Geral
        summary_data = {
            'Métrica': ['Total de Leads', 'Taxa de Conversão (%)', 'Taxa de Transferência (%)', 'Transferências para Humano'],
            'Valor': [
                data.get('total_leads', 0),
                data.get('conversion_rate', 0),
                data.get('transfer_rate', 0),
                data.get('transfer_count', 0)
            ]
        }
        df_summary = pd.DataFrame(summary_data)
        df_summary.to_excel(writer, sheet_name='Resumo', index=False)
        
        # Aba 2: Distribuição de Status
        if data.get('status_distribution'):
            status_data = [{'Status': k, 'Quantidade': v} for k, v in data['status_distribution'].items()]
            df_status = pd.DataFrame(status_data)
            df_status.to_excel(writer, sheet_name='Status', index=False)
        
        # Aba 3: Histórico Diário
        if data.get('history'):
            df_history = pd.DataFrame(data['history'])
            df_history.to_excel(writer, sheet_name='Histórico', index=False)
        
        # Aba 4: Canais
        if data.get('channels'):
            df_channels = pd.DataFrame(data['channels'])
            df_channels.to_excel(writer, sheet_name='Canais', index=False)
        
        # Aba 5: Objeções
        if data.get('objections'):
            df_objections = pd.DataFrame(data['objections'])
            df_objections.to_excel(writer, sheet_name='Objeções', index=False)
        
        # Aba 6: FAQ - Perguntas Frequentes
        if data.get('faq'):
            df_faq = pd.DataFrame(data['faq'])
            df_faq.to_excel(writer, sheet_name='FAQ', index=False)
        
        # Aba 7: Tempos de Resposta
        if data.get('response_times'):
            rt = data['response_times']
            rt_data = {
                'Métrica': ['Tempo Médio IA (segundos)', 'Tempo Médio Lead (minutos)'],
                'Valor': [rt.get('ai_avg_seconds', 0), rt.get('lead_avg_minutes', 0)]
            }
            df_rt = pd.DataFrame(rt_data)
            df_rt.to_excel(writer, sheet_name='Tempos de Resposta', index=False)
    
    output.seek(0)
    
    filename = f"relatorio_analytics_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
