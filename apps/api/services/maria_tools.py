from typing import Optional, List
import json
import asyncio
import time
from datetime import datetime, timezone, timedelta

import pytz

from services.uazapi_service import UazapiService
from services.message_service import MessageService
from services.calendar_service import CalendarService
from services.supabase_client import create_client
from agno.agent import Agent

from agno.tools import Toolkit

BRASILIA_TZ = pytz.timezone("America/Sao_Paulo")

class MariaTools(Toolkit):
    def __init__(self, lead_id: str):
        super().__init__(name="maria_tools")
        self.lead_id = lead_id
        # Extrair telefone limpo se lead_id for email ou tiver @
        self.phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
        # Instagram conversations use lead_id in the format ig:<IGSID>
        self.instagram_id = lead_id[3:] if lead_id.startswith("ig:") else None
        
        # Registrar tools explicitamente
        self.register(self.enviar_mensagem)
        self.register(self.reagir_nome)
        self.register(self.atualizar_nome)
        self.register(self.atualizar_interesse)
        self.register(self.consultar_disponibilidade)
        self.register(self.agenda)
        self.register(self.enviar_imagens)
        self.register(self.enviar_carrossel)
        self.register(self.atualizar_status_lead)

    def _lead_query(self, query):
        """
        Aplica o filtro correto para encontrar o lead atual,
        independentemente do canal (WhatsApp ou Instagram).
        """
        if self.instagram_id:
            return query.eq("instagram_id", self.instagram_id)
        return query.eq("phone", self.phone)

    def enviar_mensagem(self, texto: str, reply_id: Optional[str] = None):
        """
        Envia uma mensagem de texto ao cliente. 
        Use este campo obrigatoriamente quando quiser RESPONDER diretamente a uma PERGUNTA específica do lead.
        
        Args:
            texto: O conteúdo da mensagem de resposta.
            reply_id: O ID da mensagem à qual você está respondendo (opcional).
        """
        print(f"[Tool] Enviar Mensagem: {texto[:50]}...")
        u_service = UazapiService()
        msg_service = MessageService()
        
        parts = [p.strip() for p in texto.split('\n\n') if p.strip()]
        for i, part in enumerate(parts):
            # Enviar via WhatsApp
            u_service.send_whatsapp_message(self.lead_id, part, reply_id=reply_id if i == 0 else None)
            
            # Salvar no banco
            try:
                msg_service.save_message(self.lead_id, part, "ai", message_type="text")
            except Exception as db_err:
                print(f"DB Error saving tool response: {db_err}")

    def reagir_nome(self, message_id: str):
        """
        Reage com um emoji de coração (❤️) à mensagem exata onde o lead informou seu nome. 
        Use IMEDIATAMENTE após o cliente dizer como se chama.
        
        Args:
            message_id: O ID da mensagem à qual você deve reagir.
        """
        print(f"[Tool] Reagir Nome: {message_id}")
        u_service = UazapiService()
        msg_service = MessageService()
        
        # Verify message exists before sending WhatsApp reaction (Requirements 3.1)
        message_exists = self._verify_message_exists(msg_service, message_id)
        
        if not message_exists:
            # Retry once after 500ms delay to handle race conditions (Requirements 3.2)
            print(f"[Tool] Message not found, retrying after 500ms delay...")
            time.sleep(0.5)
            message_exists = self._verify_message_exists(msg_service, message_id)
            
            if not message_exists:
                # Log error with full context if both attempts fail (Requirements 3.3)
                print(f"[Tool] ERROR: Message with whatsapp_msg_id={message_id} not found after 2 attempts. "
                      f"Lead: {self.lead_id}, Phone: {self.phone}. "
                      f"Reaction will be sent to WhatsApp but may not be persisted correctly.")
        
        # Enviar reação via WhatsApp (always send, even if message not found in DB)
        u_service.send_reaction(self.lead_id, message_id, emoji="❤️")
        
        # Salvar reação no banco de dados
        try:
            result = msg_service.save_reaction(self.lead_id, message_id, "❤️")
            if result:
                print(f"[Tool] Reaction saved successfully to message {result}")
            else:
                print(f"[Tool] Warning: Reaction sent to WhatsApp but not saved to DB (message not found)")
        except Exception as e:
            print(f"[Tool] Error saving reaction to DB: {e}")
            import traceback
            traceback.print_exc()
    
    def _verify_message_exists(self, msg_service: MessageService, whatsapp_msg_id: str) -> bool:
        """
        Verifies if a message with the given whatsapp_msg_id exists in the database.
        
        Args:
            msg_service: MessageService instance
            whatsapp_msg_id: WhatsApp message ID to look for
        
        Returns:
            True if message exists, False otherwise
        """
        try:
            supabase = create_client()
            
            # Find lead
            lead_res = self._lead_query(supabase.table("leads").select("id")).execute()
            if not lead_res.data:
                if self.instagram_id:
                    print(f"[Tool] Lead not found for instagram_id {self.instagram_id}")
                else:
                    print(f"[Tool] Lead not found for phone {self.phone}")
                return False
            
            lead_id = lead_res.data[0]["id"]
            
            # Find conversation
            conv_res = supabase.table("conversations").select("id").eq("lead_id", lead_id).execute()
            if not conv_res.data:
                print(f"[Tool] Conversation not found for lead {lead_id}")
                return False
            
            conversation_id = conv_res.data[0]["id"]
            
            # Check if message exists using find_message_by_whatsapp_id
            msg = msg_service.find_message_by_whatsapp_id(conversation_id, whatsapp_msg_id)
            return msg is not None
            
        except Exception as e:
            print(f"[Tool] Error verifying message existence: {e}")
            return False

    @staticmethod
    def _ensure_brasilia_tz(iso_str: str) -> str:
        """
        Normalize an ISO 8601 datetime string to America/Sao_Paulo (-03:00).

        - Naive strings (no tz info) are assumed to already represent Brasília local time.
        - UTC strings ('Z' or '+00:00') are converted to Brasília.
        - Strings with any other offset are converted to Brasília.

        Returns an ISO 8601 string with the -03:00 offset.
        """
        # Handle the 'Z' suffix that fromisoformat doesn't support in Python < 3.11
        cleaned = iso_str.strip()
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"

        dt = datetime.fromisoformat(cleaned)

        if dt.tzinfo is None:
            # Naive → assume it's already Brasília local time
            dt = BRASILIA_TZ.localize(dt)
        else:
            # Aware → convert to Brasília
            dt = dt.astimezone(BRASILIA_TZ)

        return dt.isoformat()

    def _event_exists(self, telefone: str, horario_inicio: str) -> bool:
        """
        Check if an event already exists for the given phone and overlapping time.

        Queries the ``events`` table for rows where ``lead_phone`` matches
        *telefone* and ``start_time`` falls within a 30-minute window around
        *horario_inicio*.

        Returns True when a duplicate is found, False otherwise.
        """
        try:
            dt = datetime.fromisoformat(horario_inicio)
            window_start = (dt - timedelta(minutes=30)).isoformat()
            window_end = (dt + timedelta(minutes=30)).isoformat()

            supabase = create_client()
            result = (
                supabase.table("events")
                .select("id")
                .eq("lead_phone", telefone)
                .gte("start_time", window_start)
                .lte("start_time", window_end)
                .execute()
            )

            if result.data and len(result.data) > 0:
                print(f"[Agenda] Duplicate event found for {telefone} near {horario_inicio}")
                return True
            return False
        except Exception as e:
            # Fail-open: if the check fails, allow creation and log the error
            print(f"[Agenda] Error checking for duplicate event: {e}")
            return False

    def atualizar_nome(self, nome: str):
        """
        Atualiza o nome do cliente no CRM. 
        Use imediatamente após o cliente informar o nome. Acione de forma silenciosa.
        
        Args:
            nome: Nome informado pelo cliente.
        """
        print(f"[Tool] Atualizar Nome: {nome}")
        supabase = create_client()
        try:
            self._lead_query(
                supabase.table("leads").update({"full_name": nome})
            ).execute()
        except Exception as e:
            print(f"Error updating name: {e}")

    def atualizar_interesse(self, tipo_interesse: str, objetivo: Optional[str] = None):
        """
        Atualiza o tipo de interesse e objetivo do lead no CRM.
        🚨 OBRIGATÓRIO: Use SEMPRE quando o cliente mencionar o tipo de imóvel que busca.
        
        Args:
            tipo_interesse: Tipo de imóvel (apartamento, cobertura, office, flat, sala_comercial).
            objetivo: Objetivo do cliente - morar ou investir (opcional).
        """
        print(f"[Tool] Atualizar Interesse: {tipo_interesse}, Objetivo: {objetivo}")
        supabase = create_client()
        try:
            # Normalizar cobertura para apartamento
            tipo_normalizado = "apartamento" if tipo_interesse.lower() in ["cobertura", "penthouse", "duplex", "triplex"] else tipo_interesse.lower()
            
            update_data = {
                "interest_type": tipo_normalizado,
                "status": "qualificado"  # Atualiza status quando captura interesse
            }
            if objetivo:
                update_data["objective"] = objetivo.lower()
                
            result = self._lead_query(
                supabase.table("leads").update(update_data)
            ).execute()
            print(f"[Tool] Interesse atualizado com sucesso: {update_data}, Result: {result.data}")
        except Exception as e:
            print(f"Error updating interest: {e}")
            import traceback
            traceback.print_exc()

    @staticmethod
    def extract_phone_from_jid(jid: str) -> str:
        """
        Extract the phone number (digits only) from a WhatsApp JID.

        A JID typically looks like ``5563999991234@s.whatsapp.net``.
        This helper strips the ``@…`` suffix and returns only the digit
        portion of the phone segment.
        """
        phone_part = jid.split("@")[0] if "@" in jid else jid
        return "".join(ch for ch in phone_part if ch.isdigit())

    def consultar_disponibilidade(self) -> str:
        """
        Consulta o calendário do stand de vendas e retorna os próximos horários disponíveis para visita.
        Use OBRIGATORIAMENTE antes de oferecer agendamento ao cliente.
        Retorna datas e horários livres para a Maria oferecer ao lead.
        """
        print(f"[Tool] Consultando disponibilidade do calendário...")
        try:
            cal_service = CalendarService()
            slots = cal_service.get_available_slots(num_days=4, slots_per_day=2)
            
            if not slots:
                return "Não foi possível consultar o calendário. Horário de funcionamento: Segunda a Sexta, 9h às 19h."
            
            # Format slots for the agent to use in the conversation
            formatted = "HORÁRIOS DISPONÍVEIS NO STAND:\n\n"
            for slot in slots:
                formatted += f"- {slot['weekday']} ({slot['date']}) às {slot['time']}\n"
            
            formatted += "\nEscolha 2 datas com horários diferentes (manhã e tarde) para oferecer ao cliente."
            
            print(f"[Tool] Disponibilidade encontrada: {len(slots)} slots")
            return formatted
            
        except Exception as e:
            print(f"[Tool] Erro ao consultar disponibilidade: {e}")
            return "Não foi possível consultar o calendário. Horário de funcionamento: Segunda a Sexta, 9h às 19h."

    def agenda(self, nome: str, email: str, telefone: str, horario_inicio: str, horario_fim: str):
        """
        Agenda uma visita ao stand de vendas do Palmas Lake Towers. 
        Use quando o cliente confirmar interesse em visitar e você tiver coletado todos os dados.
        
        Args:
            nome: Nome completo do cliente.
            email: Email do cliente.
            telefone: Telefone com DDD (apenas números). Se vazio ou não informado, usa o telefone da conversa.
            horario_inicio: Data e hora de início (ISO 8601, ex: 2025-01-20T10:00:00).
            horario_fim: Data e hora de fim.
        """
        # Default telefone to the phone from the current conversation (Requirements 4.1, 4.2)
        if not telefone or telefone.strip() == "":
            telefone = self.phone
            print(f"[Agenda] telefone not provided, defaulting to conversation phone: {telefone}")

        print(f"[Tool] Agendar Visita: {horario_inicio}")
        cal_service = CalendarService()
        link = None

        # Normalize timestamps to Brasília timezone
        horario_inicio = self._ensure_brasilia_tz(horario_inicio)
        horario_fim = self._ensure_brasilia_tz(horario_fim)

        # Check for duplicate event before creating
        if self._event_exists(telefone, horario_inicio):
            print(f"[Agenda] Duplicate detected — skipping creation for {telefone} at {horario_inicio}")
            return "Visita já agendada para este horário. Não foi criado um novo evento."

        # 1. Google Calendar
        try:
            link = cal_service.create_event(
                summary=f"Visita Palmas Lake Towers - {nome}",
                description=f"Cliente: {nome}\nTel: {telefone}\nEmail: {email}",
                start_time=horario_inicio,
                end_time=horario_fim,
                attendee_email=email
            )
            print(f"[Agenda] Google Calendar event created: {link}")
        except Exception as e:
            print(f"[Agenda] Error creating calendar event (non-blocking): {e}")

        # 2. Database (Events & Leads)
        try:
            supabase = create_client()
            
            # Buscar lead_id
            lead_res = self._lead_query(supabase.table("leads").select("id")).execute()
            lead_uuid = lead_res.data[0]["id"] if lead_res.data else None
            
            # Criar evento na tabela events
            event_data = {
                "title": f"Visita - {nome}",
                "description": f"Visita agendada via Maria\nTelefone: {telefone}\nEmail: {email}",
                "start_time": horario_inicio,
                "end_time": horario_fim,
                "color": "green",
                "category": "Visita",
                "lead_id": lead_uuid,
                "lead_name": nome,
                "lead_phone": telefone,
                "lead_email": email,
                "location": "Stand Palmas Lake - AV JK, Orla 14",
                "status": "confirmado",
                "created_by": "ai_maria",
                "notes": f"Google Calendar: {link}" if link else "Criado apenas no sistema"
            }
            
            result = supabase.table("events").insert(event_data).execute()
            if result.data:
                print(f"[Agenda] Event saved to database: {result.data[0]['id']}")
            
            # Atualizar status do lead para visita_agendada + sentimento positivo
            if lead_uuid:
                supabase.table("leads").update({
                    "status": "visita_agendada",
                    "temperature": "quente",
                    "sentiment_label": "Positivo",
                    "sentiment_score": 70
                }).eq("id", lead_uuid).execute()
                print(f"[Agenda] Lead {lead_uuid} updated: status=visita_agendada, temperature=quente, sentiment=Positivo")
        
        except Exception as e:
            print(f"[Agenda] Error saving event to database: {e}")
            import traceback
            traceback.print_exc()

        return "Visita agendada com sucesso e registrada no calendário."

    def enviar_imagens(self, file: str, text: str):
        """
        Envia UMA imagem do empreendimento Palmas Lake Towers via WhatsApp. 
        
        Args:
            file: Link da imagem.
            text: Legenda descritiva.
        """
        print(f"[Tool] Enviar Imagem")
        u_service = UazapiService()
        msg_service = MessageService()
        
        u_service.send_image(self.lead_id, file, caption=text)
        
        try:
            content_str = f"{text} [Imagem: {file}]"
            msg_service.save_message(self.lead_id, content_str, "ai", message_type="image")
        except Exception as db_err:
            print(f"DB Error saving image tool response: {db_err}")

    def enviar_carrossel(self, titulo: str, items: List[dict]):
        """
        Envia um CARROSSEL (galeria) com múltiplas imagens e botões interativos.
        
        Args:
            titulo: Título geral do carrossel.
            items: Lista de itens (dicionários com image_url, text, buttons).
        """
        print(f"[Tool] Enviar Carrossel")
        u_service = UazapiService()
        msg_service = MessageService()
        
        carousel_items = []
        for item in items:
            itm = {
                "text": item.get('text', ''),
                "image": item.get('image_url', ''),
            }
            if 'buttons' in item:
                itm['buttons'] = item['buttons']
            carousel_items.append(itm)
            
        u_service.send_carousel(self.lead_id, titulo, carousel_items)
        
        try:
            content_str = f"{titulo} [Carrossel com {len(carousel_items)} itens]"
            msg_service.save_message(self.lead_id, content_str, "ai", message_type="carousel")
        except Exception as db_err:
            print(f"DB Error saving carousel tool response: {db_err}")

    def atualizar_status_lead(self, temperature: str, status: Optional[str] = None):
        """
        Atualiza o status e a temperatura do lead no CRM.
        
        Args:
            temperature: Classificação (quente, morno, frio).
            status: Novo status do lead no funil (opcional).
        """
        print(f"[Tool] Atualizar Status: {temperature}")
        supabase = create_client()
        try:
            update_data = {"temperature": temperature}
            if status:
                update_data["status"] = status
                
            self._lead_query(
                supabase.table("leads").update(update_data)
            ).execute()
        except Exception as e:
            print(f"Error updating lead status: {e}")
