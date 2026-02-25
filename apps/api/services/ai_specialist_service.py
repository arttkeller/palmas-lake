"""
AI Specialist Service - Serviço principal para processamento de perguntas do AI Specialist.

Este serviço integra com o EventsQueryService para buscar dados de agendamentos
e usa Agno/OpenAI para gerar respostas contextualizadas.

**Feature: ai-specialist-agendamentos**
"""

import os
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Any
import pytz

from agno.agent import Agent
from agno.models.openai import OpenAIChat

from services.events_query_service import EventsQueryService
from services.supabase_client import create_client


# =============================================================================
# Custom Exceptions
# =============================================================================

class AISpecialistServiceError(Exception):
    """Base exception for AI Specialist Service errors."""
    pass


class DatabaseQueryError(AISpecialistServiceError):
    """Raised when there's an error querying the database."""
    pass


class AIGenerationError(AISpecialistServiceError):
    """Raised when there's an error generating AI response."""
    pass


class AISpecialistService:
    """
    Serviço principal do AI Specialist.
    
    Processa perguntas dos usuários sobre diferentes contextos do sistema,
    buscando dados relevantes e gerando respostas usando IA.
    
    **Validates: Requirements 1.1, 2.5, 3.5**
    """
    
    def __init__(self):
        self.events_service = EventsQueryService()
        self.supabase = create_client()
        self.brasilia_tz = pytz.timezone('America/Sao_Paulo')
    
    def _get_current_datetime(self) -> datetime:
        """Retorna a data/hora atual no fuso horário de Brasília."""
        return datetime.now(self.brasilia_tz)
    
    def _format_date_pt_br(self, dt: datetime) -> str:
        """
        Formata uma data em português brasileiro.
        
        Ex: "15 de fevereiro de 2026"
        
        **Validates: Requirements 4.4**
        """
        months = {
            1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril',
            5: 'maio', 6: 'junho', 7: 'julho', 8: 'agosto',
            9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro'
        }
        return f"{dt.day} de {months[dt.month]} de {dt.year}"
    
    def _format_time_pt_br(self, dt: datetime) -> str:
        """Formata horário em formato brasileiro (HH:MM)."""
        return dt.strftime("%H:%M")

    def _normalize_temperature_pt(self, raw_temperature: Optional[str]) -> str:
        """Normaliza temperatura para rótulo em português."""
        if not raw_temperature:
            return "frio"

        temp = str(raw_temperature).strip().lower()
        mapping = {
            "hot": "quente",
            "warm": "morno",
            "cold": "frio",
            "quente": "quente",
            "morno": "morno",
            "frio": "frio",
        }
        return mapping.get(temp, "frio")

    def _format_source_label(self, raw_source: Optional[str]) -> str:
        """Converte origem do lead para rótulo amigável."""
        if not raw_source:
            return "WhatsApp"

        source = str(raw_source).strip().lower()
        source_mapping = {
            "whatsapp": "WhatsApp",
            "instagram": "Instagram",
            "site": "Site",
            "facebook": "Facebook",
            "indicacao": "Indicação",
            "indicação": "Indicação",
        }
        return source_mapping.get(source, source.title())

    def _format_interest_focus(self, lead: dict[str, Any]) -> str:
        """Monta foco principal do lead (objetivo/interesse)."""
        objective = (lead.get("objective") or "").strip().lower()
        interest_type = (lead.get("interest_type") or "").strip().lower()

        objective_mapping = {
            "morar": "Morar no imóvel",
            "investir": "Investir",
            "morar_investir": "Morar e investir",
        }
        interest_mapping = {
            "apartamento": "Apartamento",
            "sala_comercial": "Sala comercial",
            "office": "Office",
            "flat": "Flat",
            "loft": "Loft",
        }

        if objective in objective_mapping:
            return objective_mapping[objective]
        if interest_type in interest_mapping:
            return interest_mapping[interest_type]
        return "Interesse não informado"

    def _rank_leads_by_interest(self, leads: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Ordena leads por potencial (temperatura) e recência."""
        temp_priority = {
            "quente": 3,
            "hot": 3,
            "morno": 2,
            "warm": 2,
            "frio": 1,
            "cold": 1,
        }

        return sorted(
            leads,
            key=lambda lead: (
                temp_priority.get(str(lead.get("temperature", "")).strip().lower(), 0),
                str(lead.get("created_at") or ""),
            ),
            reverse=True,
        )

    def _build_top_interest_leads(self, leads: list[dict[str, Any]], limit: int = 5) -> str:
        """Constrói lista priorizada de leads com maior potencial (máx. 5)."""
        if not leads:
            return "        Nenhum lead encontrado."

        ranked_leads = self._rank_leads_by_interest(leads)

        lines: list[str] = []
        for lead in ranked_leads[:limit]:
            lead_id = lead.get("id", "")
            lead_name = lead.get("full_name") or "Lead sem nome"
            focus = self._format_interest_focus(lead)
            source_label = self._format_source_label(lead.get("source"))
            temperature = self._normalize_temperature_pt(lead.get("temperature"))
            lines.append(
                f"- id={lead_id}; nome={lead_name}; foco={focus}; "
                f"origem={source_label}; temperatura={temperature}; "
                f"link=/dashboard/quadro?leadId={lead_id}"
            )

        return "\n".join(lines) if lines else "        Nenhum lead encontrado."

    def _is_top_leads_query(self, message: str) -> bool:
        """Detecta perguntas sobre maiores interesses/leads."""
        lowered = (message or "").lower()
        keywords = (
            "maiores interesses",
            "interesses registrados",
            "maiores leads",
            "top leads",
            "lead mais quente",
            "leads mais quentes",
            "maior potencial",
        )
        return any(keyword in lowered for keyword in keywords)

    def _fetch_top_interest_leads_data(self, limit: int = 30) -> list[dict[str, Any]]:
        """Busca leads para ranking de interesse (usado em resposta direta)."""
        try:
            leads_res = self.supabase.table("leads").select(
                "id, full_name, temperature, source, interest_type, objective, created_at"
            ).order("created_at", direction="desc").limit(limit).execute()
            return leads_res.data if leads_res.data else []
        except Exception as e:
            print(f"[AISpecialistService] Error fetching top interest leads: {e}")
            raise DatabaseQueryError(f"Erro ao consultar leads para ranking: {e}")

    def _build_direct_top_leads_response(self, leads: list[dict[str, Any]], limit: int = 5) -> str:
        """Gera resposta pronta no formato objetivo para maiores interesses."""
        ranked_leads = self._rank_leads_by_interest(leads)[:limit]
        if not ranked_leads:
            return (
                "Os maiores interesses registrados são:\n"
                "- Nenhum lead com interesse registrado no momento.\n\n"
                "Priorize leads quentes para aumentar a taxa de conversão.\n\n"
                "Quer uma sugestão de mensagem para te ajudar a fechar o lead quente?"
            )

        lines: list[str] = []
        for lead in ranked_leads:
            lead_id = lead.get("id", "")
            lead_name = lead.get("full_name") or "Lead sem nome"
            focus = self._format_interest_focus(lead)
            source = self._format_source_label(lead.get("source"))
            temperature = self._normalize_temperature_pt(lead.get("temperature")).capitalize()
            lines.append(
                f"- [{lead_name}](/dashboard/quadro?leadId={lead_id}) - "
                f"{focus} (Lead {lead_name} - {source} - {temperature})"
            )

        return (
            "Os maiores interesses registrados são:\n"
            f"{chr(10).join(lines)}\n\n"
            "Priorize leads quentes para aumentar a taxa de conversão.\n\n"
            "Quer uma sugestão de mensagem para te ajudar a fechar o lead quente?"
        )

    def _post_process_top_leads_response(self, content: str, user_message: str = "") -> str:
        """
        Garante formato objetivo para respostas sobre maiores leads/interesses.
        """
        if not content:
            return content

        trigger_text = f"{user_message} {content}".lower()
        trigger_terms = (
            "maiores interesses",
            "maiores leads",
            "maior potencial",
            "interesses registrados",
        )
        if not any(term in trigger_text for term in trigger_terms):
            return content

        lines = [line.rstrip() for line in content.splitlines()]
        filtered_lines: list[str] = []
        bullet_count = 0

        for line in lines:
            stripped = line.lstrip()
            is_bullet = stripped.startswith("-") or stripped.startswith("*") or stripped.startswith("•")
            if is_bullet:
                if bullet_count >= 5:
                    continue
                bullet_count += 1
            filtered_lines.append(line)

        if not any("os maiores interesses registrados são" in line.lower() for line in filtered_lines):
            filtered_lines.insert(0, "Os maiores interesses registrados são:")

        normalized_response = "\n".join(filtered_lines).strip()

        conversion_line = "Priorize leads quentes para aumentar a taxa de conversão."
        cta_line = "Quer uma sugestão de mensagem para te ajudar a fechar o lead quente?"

        if conversion_line.lower() not in normalized_response.lower():
            normalized_response = f"{normalized_response}\n\n{conversion_line}"
        if cta_line.lower() not in normalized_response.lower():
            normalized_response = f"{normalized_response}\n\n{cta_line}"

        return normalized_response
    
    def _build_events_context(self) -> str:
        """
        Constrói o contexto de eventos para a IA.
        
        Busca dados relevantes do EventsQueryService e formata
        para inclusão no prompt da IA.
        
        Raises:
            DatabaseQueryError: Se houver erro ao consultar o banco
        
        **Validates: Requirements 2.5**
        """
        try:
            now = self._get_current_datetime()
            
            # Get summary
            summary = self.events_service.get_events_summary()
            
            # Get upcoming events
            upcoming = self.events_service.get_upcoming_events(limit=10)
            
            # Get events for current month
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if now.month == 12:
                month_end = now.replace(year=now.year + 1, month=1, day=1) - timedelta(seconds=1)
            else:
                month_end = now.replace(month=now.month + 1, day=1) - timedelta(seconds=1)
            
            # Format upcoming events for context
            upcoming_str = ""
            if upcoming:
                for event in upcoming[:5]:
                    try:
                        start_str = event.get('start_time', '')
                        if start_str:
                            if start_str.endswith('Z'):
                                start_dt = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                            else:
                                start_dt = datetime.fromisoformat(start_str)
                            
                            # Convert to Brasilia timezone
                            start_dt = start_dt.astimezone(self.brasilia_tz)
                            
                            lead_name = event.get('lead_name', 'Não informado')
                            lead_id = event.get('lead_id', '')
                            title = event.get('title', 'Evento')
                            location = event.get('location', '')

                            upcoming_str += f"- {self._format_date_pt_br(start_dt)} às {self._format_time_pt_br(start_dt)}: {title}"
                            if lead_name and lead_name != 'Não informado':
                                upcoming_str += f" com {lead_name}"
                                if lead_id:
                                    upcoming_str += f" (lead_id={lead_id}; link=/dashboard/quadro?leadId={lead_id})"
                            if location:
                                upcoming_str += f" em {location}"
                            upcoming_str += "\n"
                    except Exception:
                        pass
            
            context = f"""
<dados_agendamentos>
    <data_atual>{self._format_date_pt_br(now)}</data_atual>
    <hora_atual>{self._format_time_pt_br(now)}</hora_atual>
    
    <resumo>
        <total_eventos>{summary.get('total', 0)}</total_eventos>
        <eventos_futuros>{summary.get('future_events', 0)}</eventos_futuros>
        <eventos_mes_atual>{summary.get('current_month', 0)}</eventos_mes_atual>
        <por_status>
            <confirmados>{summary.get('by_status', {}).get('confirmado', 0)}</confirmados>
            <cancelados>{summary.get('by_status', {}).get('cancelado', 0)}</cancelados>
            <realizados>{summary.get('by_status', {}).get('realizado', 0)}</realizados>
        </por_status>
    </resumo>
    
    <proximos_eventos>
{upcoming_str if upcoming_str else "        Nenhum evento futuro agendado."}
    </proximos_eventos>
</dados_agendamentos>
"""
            return context
            
        except Exception as e:
            print(f"[AISpecialistService] Database error building context: {e}")
            raise DatabaseQueryError(f"Erro ao consultar agendamentos: {e}")
    
    async def process_agendamentos_query(self, message: str) -> str:
        """
        Processa perguntas sobre agendamentos usando IA.
        
        1. Busca dados relevantes do EventsQueryService
        2. Constrói contexto para a IA
        3. Gera resposta contextualizada
        
        Args:
            message: Pergunta do usuário
            
        Returns:
            Resposta da IA em português
            
        Raises:
            DatabaseQueryError: Se houver erro ao consultar o banco
            AIGenerationError: Se houver erro ao gerar resposta da IA
            
        **Validates: Requirements 1.1, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5**
        """
        try:
            # Build context with events data
            # May raise DatabaseQueryError
            events_context = self._build_events_context()
            
            # System prompt for the AI Specialist
            system_prompt = f"""Você é um assistente especializado em agendamentos do sistema Palmas Lake CRM.

Sua função é responder perguntas sobre visitas e eventos agendados de forma clara e amigável.

{events_context}

## REGRAS DE RESPOSTA:

1. Sempre responda em português brasileiro
2. Use linguagem profissional mas amigável
3. Formate datas como "15 de fevereiro de 2026"
4. Formate horários como "14:30"
5. Se não houver eventos no período perguntado, informe de forma gentil
6. Seja conciso mas informativo
7. Quando listar eventos, inclua: data, horário e nome do lead (se disponível)
8. SEMPRE que mencionar um lead pelo nome, use o formato de link clicável: [Nome do Lead](/dashboard/quadro?leadId=ID_DO_LEAD)
   - Os dados dos eventos incluem "lead_id" e "link" — use-os para criar links clicáveis

## INTERPRETAÇÃO DE PERGUNTAS:

- "quantas visitas tenho esse mês" → consulta de contagem do mês atual
- "quais são minhas próximas visitas" → listagem de eventos futuros
- "tem alguma visita amanhã" → consulta do dia seguinte
- "visitas da semana que vem" → calcular datas da próxima semana
- Perguntas sobre um lead específico → filtrar por nome mencionado

Responda a pergunta do usuário baseado nos dados fornecidos acima."""

            try:
                # Create AI agent
                agent = Agent(
                    model=OpenAIChat(
                        id="gpt-5-mini",
                        reasoning_effort="low",
                        max_completion_tokens=500
                    ),
                    description="Assistente de agendamentos do Palmas Lake CRM",
                    instructions=system_prompt,
                    markdown=False
                )
                
                # Generate response (thread pool para não bloquear event loop)
                response = await asyncio.to_thread(agent.run, message)
                
                if not response or not response.content:
                    raise AIGenerationError("Resposta vazia da IA")
                
                return response.content
                
            except AIGenerationError:
                raise
            except Exception as e:
                print(f"[AISpecialistService] AI generation error: {e}")
                raise AIGenerationError(f"Erro ao gerar resposta: {e}")
            
        except DatabaseQueryError:
            # Re-raise database errors
            raise
        except AIGenerationError:
            # Re-raise AI errors
            raise
        except Exception as e:
            print(f"[AISpecialistService] Unexpected error processing query: {e}")
            # Return friendly error message for unexpected errors
            # **Validates: Requirements 1.5, 4.5**
            return "Desculpe, não consegui processar sua pergunta sobre agendamentos. Tente novamente em alguns instantes."

    # =============================================================================
    # CRM Context Methods
    # =============================================================================
    
    def _build_crm_context(self) -> str:
        """
        Constrói o contexto de CRM para a IA.
        """
        try:
            now = self._get_current_datetime()
            
            # Get leads summary
            leads_res = self.supabase.table("leads").select(
                "id, full_name, status, temperature, source, interest_type, objective, created_at"
            ).execute()
            leads = leads_res.data if leads_res.data else []
            
            # Count by status
            status_counts = {}
            temp_counts = {}
            for lead in leads:
                status = lead.get('status', 'unknown')
                temp = lead.get('temperature', 'unknown')
                status_counts[status] = status_counts.get(status, 0) + 1
                temp_counts[temp] = temp_counts.get(temp, 0) + 1
            
            # Get recent conversations
            conv_res = self.supabase.table("conversations").select(
                "id, last_message, updated_at, leads(full_name)"
            ).order("updated_at", direction="desc").limit(5).execute()
            convs = conv_res.data if conv_res.data else []
            
            recent_convs_str = ""
            for conv in convs:
                lead_name = conv.get('leads', {}).get('full_name', 'Desconhecido')
                last_msg = conv.get('last_message', '')[:50]
                recent_convs_str += f"- {lead_name}: {last_msg}...\n"
            
            top_interest_leads = self._build_top_interest_leads(leads, limit=5)

            context = f"""
<dados_crm>
    <data_atual>{self._format_date_pt_br(now)}</data_atual>
    
    <resumo_leads>
        <total>{len(leads)}</total>
        <por_status>
            {chr(10).join([f'<{k}>{v}</{k}>' for k, v in status_counts.items()])}
        </por_status>
        <por_temperatura>
            {chr(10).join([f'<{k}>{v}</{k}>' for k, v in temp_counts.items()])}
        </por_temperatura>
    </resumo_leads>
    
    <conversas_recentes>
{recent_convs_str if recent_convs_str else "        Nenhuma conversa recente."}
    </conversas_recentes>

    <maiores_interesses>
{top_interest_leads}
    </maiores_interesses>
</dados_crm>
"""
            return context
            
        except Exception as e:
            print(f"[AISpecialistService] Error building CRM context: {e}")
            raise DatabaseQueryError(f"Erro ao consultar dados do CRM: {e}")
    
    async def process_crm_query(self, message: str) -> str:
        """
        Processa perguntas sobre o CRM usando IA.
        """
        try:
            if self._is_top_leads_query(message):
                leads_data = self._fetch_top_interest_leads_data(limit=30)
                return self._build_direct_top_leads_response(leads_data, limit=5)

            crm_context = self._build_crm_context()
            
            system_prompt = f"""Você é um assistente especializado no CRM do Palmas Lake.

Sua função é responder perguntas sobre leads, conversas e o pipeline de vendas.

{crm_context}

## REGRAS DE RESPOSTA:

1. Sempre responda em português brasileiro
2. Use linguagem profissional, humanizada e objetiva
3. Prefira frases curtas e diretas
4. Quando mencionar números, seja preciso
5. Nunca liste mais de 5 leads em uma resposta
6. SEMPRE que mencionar um lead pelo nome, use o formato de link clicável: [Nome do Lead](/dashboard/quadro?leadId=ID_DO_LEAD)
   - Os dados dos leads incluem os campos "id" e "link" — use-os para criar links clicáveis
7. Se a pergunta for sobre "maiores interesses", "maiores leads" ou "leads com maior potencial":
   - Comece com: "Os maiores interesses registrados são:"
   - Liste no máximo 5 leads priorizando temperatura: quente > morno > frio
   - Cada item deve ter o nome clicável neste formato: [Nome do Lead](/dashboard/quadro?leadId=ID)
   - Inclua foco/interesse, origem e temperatura em cada item
   - Finalize com: "Priorize leads quentes para aumentar a taxa de conversão."
   - Em seguida pergunte: "Quer uma sugestão de mensagem para te ajudar a fechar o lead quente?"

Responda a pergunta do usuário baseado nos dados fornecidos acima."""

            agent = Agent(
                model=OpenAIChat(
                    id="gpt-5-mini",
                    reasoning_effort="low",
                    max_completion_tokens=500
                ),
                description="Assistente de CRM do Palmas Lake",
                instructions=system_prompt,
                markdown=False
            )
            
            response = await asyncio.to_thread(agent.run, message)
            
            if not response or not response.content:
                raise AIGenerationError("Resposta vazia da IA")
            
            return self._post_process_top_leads_response(response.content, message)
            
        except Exception as e:
            print(f"[AISpecialistService] Error processing CRM query: {e}")
            return "Desculpe, não consegui processar sua pergunta sobre o CRM. Tente novamente."
    
    # =============================================================================
    # Leads Context Methods
    # =============================================================================
    
    def _build_leads_context(self) -> str:
        """
        Constrói o contexto de leads para a IA.
        """
        try:
            now = self._get_current_datetime()
            
            # Get all leads with details
            leads_res = self.supabase.table("leads").select(
                "id, full_name, phone, status, temperature, source, created_at, interest_type, objective"
            ).order("created_at", direction="desc").limit(20).execute()
            leads = leads_res.data if leads_res.data else []
            
            leads_str = ""
            for lead in leads[:5]:
                lead_id = lead.get('id', '')
                name = lead.get('full_name', 'Sem nome')
                status = lead.get('status', 'novo')
                temp = self._normalize_temperature_pt(lead.get('temperature'))
                source = self._format_source_label(lead.get('source'))
                focus = self._format_interest_focus(lead)
                leads_str += (
                    f"- id={lead_id}; nome={name}; status={status}; "
                    f"temperatura={temp}; origem={source}; foco={focus}; "
                    f"link=/dashboard/quadro?leadId={lead_id}\n"
                )

            top_interest_leads = self._build_top_interest_leads(leads, limit=5)
            
            context = f"""
<dados_leads>
    <data_atual>{self._format_date_pt_br(now)}</data_atual>
    <total_leads>{len(leads)}</total_leads>
    
    <leads_recentes>
{leads_str if leads_str else "        Nenhum lead cadastrado."}
    </leads_recentes>

    <maiores_interesses>
{top_interest_leads}
    </maiores_interesses>
</dados_leads>
"""
            return context
            
        except Exception as e:
            print(f"[AISpecialistService] Error building leads context: {e}")
            raise DatabaseQueryError(f"Erro ao consultar leads: {e}")
    
    async def process_leads_query(self, message: str) -> str:
        """
        Processa perguntas sobre leads usando IA.
        """
        try:
            if self._is_top_leads_query(message):
                leads_data = self._fetch_top_interest_leads_data(limit=30)
                return self._build_direct_top_leads_response(leads_data, limit=5)

            leads_context = self._build_leads_context()
            
            system_prompt = f"""Você é um assistente especializado em leads do Palmas Lake CRM.

Sua função é responder perguntas sobre leads, seus status e temperaturas.

{leads_context}

## REGRAS DE RESPOSTA:

1. Sempre responda em português brasileiro
2. Use linguagem profissional, humanizada e objetiva
3. Prefira frases curtas e diretas
4. Explique os status: novo_lead, transferido, visita_agendada, visita_realizada, proposta_enviada
5. Explique as temperaturas: quente (alta probabilidade), morno (engajado), frio (baixo interesse)
6. Nunca liste mais de 5 leads em uma resposta
7. SEMPRE que mencionar um lead pelo nome, use o formato de link clicável: [Nome do Lead](/dashboard/quadro?leadId=ID_DO_LEAD)
   - Os dados dos leads incluem os campos "id" e "link" — use-os para criar links clicáveis
8. Se a pergunta for sobre "maiores interesses", "maiores leads" ou "leads com maior potencial":
   - Comece com: "Os maiores interesses registrados são:"
   - Liste no máximo 5 leads priorizando temperatura: quente > morno > frio
   - Cada item deve ter o nome clicável neste formato: [Nome do Lead](/dashboard/quadro?leadId=ID)
   - Inclua foco/interesse, origem e temperatura em cada item
   - Finalize com: "Priorize leads quentes para aumentar a taxa de conversão."
   - Em seguida pergunte: "Quer uma sugestão de mensagem para te ajudar a fechar o lead quente?"

Responda a pergunta do usuário baseado nos dados fornecidos acima."""

            agent = Agent(
                model=OpenAIChat(
                    id="gpt-5-mini",
                    reasoning_effort="low",
                    max_completion_tokens=500
                ),
                description="Assistente de Leads do Palmas Lake",
                instructions=system_prompt,
                markdown=False
            )
            
            response = await asyncio.to_thread(agent.run, message)
            
            if not response or not response.content:
                raise AIGenerationError("Resposta vazia da IA")
            
            return self._post_process_top_leads_response(response.content, message)
            
        except Exception as e:
            print(f"[AISpecialistService] Error processing leads query: {e}")
            return "Desculpe, não consegui processar sua pergunta sobre leads. Tente novamente."
    
    # =============================================================================
    # Chat Context Methods
    # =============================================================================
    
    def _build_chat_context(self) -> str:
        """
        Constrói o contexto de conversas para a IA.
        """
        try:
            now = self._get_current_datetime()
            
            # Get recent conversations
            conv_res = self.supabase.table("conversations").select(
                "id, platform, last_message, updated_at, lead_id, leads(id, full_name, phone)"
            ).order("updated_at", direction="desc").limit(10).execute()
            convs = conv_res.data if conv_res.data else []

            convs_str = ""
            for conv in convs:
                lead = conv.get('leads', {}) or {}
                lead_id = lead.get('id', '') or conv.get('lead_id', '')
                name = lead.get('full_name', 'Desconhecido')
                platform = conv.get('platform', 'whatsapp')
                last_msg = conv.get('last_message', '')[:40]
                convs_str += (
                    f"- id_lead={lead_id}; nome={name} ({platform}): {last_msg}...; "
                    f"link=/dashboard/quadro?leadId={lead_id}\n"
                )
            
            context = f"""
<dados_conversas>
    <data_atual>{self._format_date_pt_br(now)}</data_atual>
    <total_conversas>{len(convs)}</total_conversas>
    
    <conversas_recentes>
{convs_str if convs_str else "        Nenhuma conversa encontrada."}
    </conversas_recentes>
</dados_conversas>
"""
            return context
            
        except Exception as e:
            print(f"[AISpecialistService] Error building chat context: {e}")
            raise DatabaseQueryError(f"Erro ao consultar conversas: {e}")
    
    async def process_chat_query(self, message: str) -> str:
        """
        Processa perguntas sobre conversas usando IA.
        """
        try:
            chat_context = self._build_chat_context()
            
            system_prompt = f"""Você é um assistente especializado em conversas do Palmas Lake CRM.

Sua função é responder perguntas sobre conversas com leads via WhatsApp e Instagram.

{chat_context}

## REGRAS DE RESPOSTA:

1. Sempre responda em português brasileiro
2. Use linguagem profissional mas amigável
3. Seja conciso mas informativo
4. SEMPRE que mencionar um lead pelo nome, use o formato de link clicável: [Nome do Lead](/dashboard/quadro?leadId=ID_DO_LEAD)
   - Os dados das conversas incluem "id_lead" e "link" — use-os para criar links clicáveis

Responda a pergunta do usuário baseado nos dados fornecidos acima."""

            agent = Agent(
                model=OpenAIChat(
                    id="gpt-5-mini",
                    reasoning_effort="low",
                    max_completion_tokens=500
                ),
                description="Assistente de Conversas do Palmas Lake",
                instructions=system_prompt,
                markdown=False
            )
            
            response = await asyncio.to_thread(agent.run, message)
            
            if not response or not response.content:
                raise AIGenerationError("Resposta vazia da IA")
            
            return response.content
            
        except Exception as e:
            print(f"[AISpecialistService] Error processing chat query: {e}")
            return "Desculpe, não consegui processar sua pergunta sobre conversas. Tente novamente."
    
    # =============================================================================
    # Analytics Context Methods
    # =============================================================================
    
    def _build_analytics_context(self) -> str:
        """
        Constrói o contexto de analytics para a IA.
        """
        try:
            now = self._get_current_datetime()
            
            # Get leads for analytics
            leads_res = self.supabase.table("leads").select(
                "id, full_name, status, temperature, source, created_at"
            ).execute()
            leads = leads_res.data if leads_res.data else []
            
            # Calculate metrics
            total_leads = len(leads)
            by_status = {}
            by_temp = {}
            by_source = {}
            
            for lead in leads:
                status = lead.get('status', 'unknown')
                temp = lead.get('temperature', 'unknown')
                source = lead.get('source') or 'whatsapp'
                
                by_status[status] = by_status.get(status, 0) + 1
                by_temp[temp] = by_temp.get(temp, 0) + 1
                by_source[source] = by_source.get(source, 0) + 1
            
            # Calculate conversion rate (leads with proposta_enviada / total)
            propostas = by_status.get('proposta_enviada', 0)
            conversion_rate = (propostas / total_leads * 100) if total_leads > 0 else 0
            
            # Build individual leads list for linking
            leads_str = ""
            for lead in leads[:10]:
                lead_id = lead.get('id', '')
                name = lead.get('full_name', 'Sem nome')
                status = lead.get('status', 'novo_lead')
                temp = self._normalize_temperature_pt(lead.get('temperature'))
                source_label = self._format_source_label(lead.get('source'))
                leads_str += (
                    f"- id={lead_id}; nome={name}; status={status}; "
                    f"temperatura={temp}; origem={source_label}; "
                    f"link=/dashboard/quadro?leadId={lead_id}\n"
                )

            context = f"""
<dados_analytics>
    <data_atual>{self._format_date_pt_br(now)}</data_atual>

    <metricas>
        <total_leads>{total_leads}</total_leads>
        <taxa_conversao>{conversion_rate:.1f}%</taxa_conversao>
        <leads_quentes>{by_temp.get('hot', 0)}</leads_quentes>
        <leads_mornos>{by_temp.get('warm', 0)}</leads_mornos>
        <leads_frios>{by_temp.get('cold', 0)}</leads_frios>
    </metricas>

    <por_status>
        {chr(10).join([f'<{k}>{v}</{k}>' for k, v in by_status.items()])}
    </por_status>

    <por_origem>
        {chr(10).join([f'<{k}>{v}</{k}>' for k, v in by_source.items()])}
    </por_origem>

    <leads_individuais>
{leads_str if leads_str else "        Nenhum lead cadastrado."}
    </leads_individuais>
</dados_analytics>
"""
            return context
            
        except Exception as e:
            print(f"[AISpecialistService] Error building analytics context: {e}")
            raise DatabaseQueryError(f"Erro ao consultar analytics: {e}")
    
    async def process_analytics_query(self, message: str) -> str:
        """
        Processa perguntas sobre analytics usando IA.
        """
        try:
            analytics_context = self._build_analytics_context()
            
            system_prompt = f"""Você é um assistente especializado em analytics do Palmas Lake CRM.

Sua função é responder perguntas sobre métricas, conversões e performance.

{analytics_context}

## REGRAS DE RESPOSTA:

1. Sempre responda em português brasileiro
2. Use linguagem profissional mas amigável
3. Seja conciso mas informativo
4. Quando mencionar porcentagens, use uma casa decimal
5. SEMPRE que mencionar um lead pelo nome, use o formato de link clicável: [Nome do Lead](/dashboard/quadro?leadId=ID_DO_LEAD)
   - Os dados dos leads incluem "id" e "link" — use-os para criar links clicáveis

Responda a pergunta do usuário baseado nos dados fornecidos acima."""

            agent = Agent(
                model=OpenAIChat(
                    id="gpt-5-mini",
                    reasoning_effort="low",
                    max_completion_tokens=500
                ),
                description="Assistente de Analytics do Palmas Lake",
                instructions=system_prompt,
                markdown=False
            )
            
            response = await asyncio.to_thread(agent.run, message)
            
            if not response or not response.content:
                raise AIGenerationError("Resposta vazia da IA")
            
            return response.content
            
        except Exception as e:
            print(f"[AISpecialistService] Error processing analytics query: {e}")
            return "Desculpe, não consegui processar sua pergunta sobre analytics. Tente novamente."
