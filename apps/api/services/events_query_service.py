"""
Events Query Service - Serviço para consultas de eventos/agendamentos.

Este serviço fornece métodos para consultar eventos do banco de dados Supabase,
incluindo contagem por período, listagem de próximos eventos, e filtros por lead.

**Feature: ai-specialist-agendamentos**
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from services.supabase_client import create_client


class EventsQueryService:
    """
    Serviço para consultas de eventos/agendamentos.
    
    Fornece métodos para:
    - Contar eventos em um período
    - Listar próximos eventos ordenados por data
    - Filtrar eventos por lead (nome ou telefone)
    - Obter resumo geral dos eventos
    """
    
    def __init__(self):
        self.supabase = create_client()
    
    def get_events_count(self, start_date: datetime, end_date: datetime) -> int:
        """
        Retorna a contagem de eventos em um período específico.
        
        Args:
            start_date: Data/hora de início do período
            end_date: Data/hora de fim do período
            
        Returns:
            Número de eventos no período
            
        **Validates: Requirements 1.2**
        """
        try:
            # Format dates for PostgREST query
            start_str = start_date.isoformat()
            end_str = end_date.isoformat()
            
            result = (
                self.supabase.table("events")
                .select("id")
                .gte("start_time", start_str)
                .lte("start_time", end_str)
                .execute()
            )
            
            if result.data is None:
                return 0
            
            return len(result.data)
            
        except Exception as e:
            print(f"[EventsQueryService] Error getting events count: {e}")
            return 0
    
    def get_upcoming_events(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Retorna os próximos eventos ordenados por data.
        
        Apenas eventos com start_time maior que o momento atual são retornados,
        ordenados em ordem crescente de data.
        
        Args:
            limit: Número máximo de eventos a retornar (padrão: 10)
            
        Returns:
            Lista de eventos futuros ordenados por data
            
        **Validates: Requirements 1.3**
        """
        try:
            now = datetime.now(timezone.utc).isoformat()
            
            result = (
                self.supabase.table("events")
                .select("*")
                .gt("start_time", now)
                .order("start_time", direction="asc")
                .limit(limit)
                .execute()
            )
            
            if result.data is None:
                return []
            
            return result.data
            
        except Exception as e:
            print(f"[EventsQueryService] Error getting upcoming events: {e}")
            return []
    
    def get_events_by_lead(
        self, 
        lead_name: Optional[str] = None, 
        lead_phone: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retorna eventos filtrados por lead (nome ou telefone).
        
        Pelo menos um dos parâmetros (lead_name ou lead_phone) deve ser fornecido.
        A busca por nome é case-insensitive e usa correspondência parcial.
        
        Args:
            lead_name: Nome do lead para filtrar (opcional)
            lead_phone: Telefone do lead para filtrar (opcional)
            
        Returns:
            Lista de eventos do lead especificado
            
        **Validates: Requirements 1.4**
        """
        try:
            if not lead_name and not lead_phone:
                return []
            
            # Build query based on provided filters
            query = self.supabase.table("events").select("*")
            
            if lead_name and lead_phone:
                # Use OR filter for both conditions
                # PostgREST OR syntax: or=(lead_name.ilike.*value*,lead_phone.eq.value)
                query = query.or_(
                    f"lead_name.ilike.*{lead_name}*,lead_phone.eq.{lead_phone}"
                )
            elif lead_name:
                # Case-insensitive partial match on name
                query = query.ilike("lead_name", f"*{lead_name}*")
            else:
                # Exact match on phone
                query = query.eq("lead_phone", lead_phone)
            
            query = query.order("start_time", direction="desc")
            
            result = query.execute()
            
            if result.data is None:
                return []
            
            return result.data
            
        except Exception as e:
            print(f"[EventsQueryService] Error getting events by lead: {e}")
            return []
    
    def get_events_summary(self) -> Dict[str, Any]:
        """
        Retorna um resumo geral dos eventos.
        
        Inclui:
        - Total de eventos
        - Eventos por status (confirmado, cancelado, realizado)
        - Eventos futuros
        - Eventos do mês atual
        
        Returns:
            Dicionário com resumo dos eventos
        """
        try:
            now = datetime.now(timezone.utc)
            
            # Get all events
            all_events_result = (
                self.supabase.table("events")
                .select("id,status,start_time")
                .execute()
            )
            
            all_events = all_events_result.data or []
            total = len(all_events)
            
            # Count by status
            status_counts = {
                "confirmado": 0,
                "cancelado": 0,
                "realizado": 0
            }
            
            future_count = 0
            current_month_count = 0
            
            for event in all_events:
                status = event.get("status", "").lower()
                if status in status_counts:
                    status_counts[status] += 1
                
                # Check if future event
                start_time_str = event.get("start_time")
                if start_time_str:
                    try:
                        # Parse ISO format datetime
                        if start_time_str.endswith('Z'):
                            start_time = datetime.fromisoformat(
                                start_time_str.replace('Z', '+00:00')
                            )
                        elif '+' in start_time_str or start_time_str.endswith('00'):
                            start_time = datetime.fromisoformat(start_time_str)
                        else:
                            start_time = datetime.fromisoformat(
                                start_time_str
                            ).replace(tzinfo=timezone.utc)
                        
                        if start_time > now:
                            future_count += 1
                        
                        # Check if same month and year
                        if (start_time.year == now.year and 
                            start_time.month == now.month):
                            current_month_count += 1
                            
                    except (ValueError, TypeError):
                        pass
            
            return {
                "total": total,
                "by_status": status_counts,
                "future_events": future_count,
                "current_month": current_month_count
            }
            
        except Exception as e:
            print(f"[EventsQueryService] Error getting events summary: {e}")
            return {
                "total": 0,
                "by_status": {
                    "confirmado": 0,
                    "cancelado": 0,
                    "realizado": 0
                },
                "future_events": 0,
                "current_month": 0
            }
