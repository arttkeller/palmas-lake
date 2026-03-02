from typing import Optional, List
import json
import asyncio
import time
from datetime import datetime, timezone, timedelta

import pytz

from services.meta_service import MetaService
from services.message_service import MessageService
from services.calendar_service import CalendarService
from services.supabase_client import create_client
from agno.agent import Agent

from agno.tools import Toolkit

BRASILIA_TZ = pytz.timezone("America/Sao_Paulo")

# Status ordering for lead merge (higher = more advanced in funnel)
_STATUS_ORDER = {
    "novo_lead": 0, "transferido": 1, "qualificado": 1, "visita_agendada": 2,
    "visita_realizada": 3, "proposta_enviada": 4, "convertido": 5,
}

def _prefer_advanced_status(status_a: Optional[str], status_b: Optional[str]) -> str:
    """Return whichever status is further along the sales funnel."""
    a = _STATUS_ORDER.get(status_a or "", 0)
    b = _STATUS_ORDER.get(status_b or "", 0)
    return (status_a or "novo_lead") if a >= b else (status_b or "novo_lead")


class MariaTools(Toolkit):
    def __init__(self, lead_id: str):
        super().__init__(name="maria_tools")
        self.lead_id = lead_id
        # Extrair telefone limpo se lead_id for email ou tiver @
        self.phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
        # Instagram conversations use lead_id in the format ig:<IGSID>
        self.instagram_id = lead_id[3:] if lead_id.startswith("ig:") else None
        
        # Flag to track if enviar_mensagem was called (prevents buffer_service from re-sending)
        self._messages_sent_via_tool = False

        # Registrar tools explicitamente
        self.register(self.enviar_mensagem)
        self.register(self.reagir_nome)
        self.register(self.atualizar_nome)
        self.register(self.atualizar_interesse)
        # Tools de agendamento desativadas para IA (humano agenda pelo dashboard)
        # self.register(self.consultar_disponibilidade)
        # self.register(self.agenda)
        self.register(self.enviar_imagens)
        self.register(self.enviar_carrossel)
        self.register(self.atualizar_status_lead)
        self.register(self.transferir_para_humano)

    def _lead_query(self, query):
        """
        Aplica o filtro correto para encontrar o lead atual,
        independentemente do canal (WhatsApp ou Instagram).
        """
        if self.instagram_id:
            return query.eq("instagram_id", self.instagram_id)
        return query.eq("phone", self.phone)

    @staticmethod
    def _normalize_phone_for_whatsapp(value: Optional[str]) -> str:
        """
        Normaliza telefone no padrão ddidddnumero.
        Retorna string vazia quando inválido para envio WhatsApp.
        """
        return MetaService.normalize_whatsapp_number(value or "")

    def enviar_mensagem(self, texto: str, reply_id: Optional[str] = None):
        """
        Envia uma mensagem de texto ao cliente. 
        Use este campo obrigatoriamente quando quiser RESPONDER diretamente a uma PERGUNTA específica do lead.
        
        Args:
            texto: O conteúdo da mensagem de resposta.
            reply_id: O ID da mensagem à qual você está respondendo (opcional).
        """
        self._messages_sent_via_tool = True
        print(f"[Tool] Enviar Mensagem: {texto[:50]}...")
        m_service = MetaService()
        msg_service = MessageService()

        parts = [p.strip() for p in texto.split('\n\n') if p.strip()]
        for i, part in enumerate(parts):
            # Enviar via WhatsApp
            m_service.send_whatsapp_text(self.lead_id, part, reply_message_id=reply_id if i == 0 else None)
            
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
        m_service = MetaService()
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
        m_service.send_whatsapp_reaction(self.lead_id, message_id, emoji="❤️")
        
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

            # Cross-check with events table to exclude already-booked slots
            slots = self._filter_booked_slots(slots)

            if not slots:
                return "Todos os horários próximos estão ocupados. Horário de funcionamento: Segunda a Sexta, 9h às 19h. Pergunte ao cliente se prefere outro horário."

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

    @staticmethod
    def _filter_booked_slots(slots: list) -> list:
        """
        Remove slots that already have events booked in the Supabase events table.
        This prevents double-booking when Google Calendar sync is delayed or unavailable.
        """
        if not slots:
            return slots
        try:
            supabase = create_client()
            # Get all future events from the events table
            now = datetime.now(timezone(timedelta(hours=-3))).isoformat()
            result = supabase.table("events").select("start_time").gte("start_time", now).execute()

            if not result.data:
                return slots

            # Build set of booked (date, hour) tuples
            booked = set()
            for event in result.data:
                try:
                    dt = datetime.fromisoformat(event["start_time"])
                    booked.add((dt.strftime("%d/%m/%Y"), f"{dt.hour:02d}:00"))
                except Exception:
                    pass

            if not booked:
                return slots

            filtered = [s for s in slots if (s["date"], s["time"]) not in booked]
            removed = len(slots) - len(filtered)
            if removed:
                print(f"[Tool] Filtered out {removed} already-booked slot(s) from availability")
            return filtered
        except Exception as e:
            print(f"[Tool] Error checking events table for booked slots (non-blocking): {e}")
            return slots

    def _try_merge_instagram_whatsapp(self, phone: str) -> bool:
        """
        If this is an Instagram lead and the phone already belongs to a WhatsApp lead,
        merge both into a single lead (keep the WhatsApp lead as primary).
        Returns True if merge happened.
        """
        if not self.instagram_id:
            return False

        supabase = create_client()

        # 1. Find existing WhatsApp lead with this phone
        wa_lead_res = supabase.table("leads").select("*").eq("phone", phone).execute()
        if not wa_lead_res.data:
            return False  # New phone, no conflict

        wa_data = wa_lead_res.data[0]
        wa_lead_id = wa_data["id"]

        # 2. Find current Instagram lead
        ig_lead_res = supabase.table("leads").select("*").eq("instagram_id", self.instagram_id).execute()
        if not ig_lead_res.data:
            return False

        ig_data = ig_lead_res.data[0]
        ig_lead_id = ig_data["id"]

        if wa_lead_id == ig_lead_id:
            return False  # Already the same lead

        print(f"[Merge] Merging Instagram lead {ig_lead_id} into WhatsApp lead {wa_lead_id} (phone={phone})")

        # 3. Move conversations from IG lead to WA lead
        ig_convs = supabase.table("conversations").select("id, platform").eq("lead_id", ig_lead_id).execute()
        for conv in (ig_convs.data or []):
            existing = (
                supabase.table("conversations")
                .select("id")
                .eq("lead_id", wa_lead_id)
                .eq("platform", conv["platform"])
                .execute()
            )
            if existing.data:
                # WA lead already has a conversation for this platform — move messages
                supabase.table("messages").update(
                    {"conversation_id": existing.data[0]["id"]}
                ).eq("conversation_id", conv["id"]).execute()
                supabase.table("conversations").delete().eq("id", conv["id"]).execute()
                print(f"[Merge] Moved messages from conv {conv['id']} into existing conv {existing.data[0]['id']}")
            else:
                # Move the whole conversation
                supabase.table("conversations").update(
                    {"lead_id": wa_lead_id}
                ).eq("id", conv["id"]).execute()
                print(f"[Merge] Moved conversation {conv['id']} to WA lead")

        # 4. Move events
        try:
            supabase.table("events").update({"lead_id": wa_lead_id}).eq("lead_id", ig_lead_id).execute()
        except Exception as e:
            print(f"[Merge] Error moving events (non-blocking): {e}")

        # 5. Move follow_up_queue
        try:
            supabase.table("follow_up_queue").update({"lead_id": wa_lead_id}).eq("lead_id", ig_lead_id).execute()
        except Exception:
            pass

        # 6. Enrich WA lead with IG data
        enrichment = {"instagram_id": self.instagram_id}

        ig_name = ig_data.get("full_name", "")
        wa_name = wa_data.get("full_name", "")
        if ig_name and not ig_name.startswith("Instagram ") and (wa_name.startswith("Lead ") or not wa_name):
            enrichment["full_name"] = ig_name

        if ig_data.get("email") and not wa_data.get("email"):
            enrichment["email"] = ig_data["email"]

        ig_tags = ig_data.get("tags") or []
        wa_tags = wa_data.get("tags") or []
        if ig_tags:
            enrichment["tags"] = list(set(wa_tags + ig_tags))

        enrichment["status"] = _prefer_advanced_status(
            wa_data.get("status"), ig_data.get("status")
        )

        supabase.table("leads").update(enrichment).eq("id", wa_lead_id).execute()
        print(f"[Merge] Enriched WA lead with: {list(enrichment.keys())}")

        # 7. Delete IG lead (cascades remaining FK rows)
        supabase.table("leads").delete().eq("id", ig_lead_id).execute()
        print(f"[Merge] Deleted Instagram lead {ig_lead_id}")

        # 8. Broadcast deletion to frontend
        try:
            from routers.webhook import _broadcast_lead_deleted
            _broadcast_lead_deleted(ig_lead_id)
        except Exception as bc_err:
            print(f"[Merge] Broadcast error (non-blocking): {bc_err}")

        # 9. Update internal references so the current agent session uses the merged lead
        self.phone = phone
        print(f"[Merge] Successfully merged IG lead into WA lead {wa_lead_id}")
        return True

    def agenda(self, nome: str, email: str, telefone: str, horario_inicio: str, horario_fim: str):
        """
        Agenda uma visita ao stand de vendas do Palmas Lake Towers. 
        Use quando o cliente confirmar interesse em visitar e você tiver coletado todos os dados.
        
        Args:
            nome: Nome completo do cliente.
            email: Email do cliente.
            telefone: Telefone no formato ddidddnumero (apenas números). Para leads do Instagram é obrigatório.
            horario_inicio: Data e hora de início (ISO 8601, ex: 2025-01-20T10:00:00).
            horario_fim: Data e hora de fim.
        """
        # Validate nome completo (must have at least first and last name)
        if not nome or len(nome.strip().split()) < 2:
            print(f"[Agenda] BLOCKED: nome completo not provided. Got: '{nome}'")
            return "❌ ERRO: Você precisa coletar o NOME COMPLETO do cliente (nome e sobrenome) antes de agendar. Pergunte ao cliente o nome completo."

        # Validate email (must be a real email, not placeholder)
        invalid_emails = ["pendente@email.com", "pendente", ""]
        if not email or email.strip().lower() in invalid_emails or "@" not in email:
            print(f"[Agenda] BLOCKED: email not provided or is placeholder. Got: '{email}'")
            return "❌ ERRO: Você precisa coletar o EMAIL REAL do cliente antes de agendar. Pergunte ao cliente o email."

        is_instagram_lead = bool(self.instagram_id)
        provided_phone = (telefone or "").strip()

        # Instagram policy: proactive reminders must be sent via WhatsApp.
        if is_instagram_lead and not provided_phone:
            print("[Agenda] BLOCKED: Instagram lead without explicit phone for WhatsApp reminder")
            return (
                "❌ ERRO: Para leads do Instagram, o telefone WhatsApp é obrigatório antes do agendamento. "
                "Peça o telefone com DDD ao cliente e tente novamente."
            )

        if not provided_phone:
            provided_phone = self.phone
            print(f"[Agenda] telefone not provided, defaulting to conversation phone: {provided_phone}")

        telefone_normalizado = self._normalize_phone_for_whatsapp(provided_phone)
        if not telefone_normalizado:
            print(f"[Agenda] BLOCKED: invalid phone for WhatsApp reminder. Got: '{provided_phone}'")
            return "❌ ERRO: Telefone inválido. Peça o telefone com DDD novamente ao cliente."

        # Try to merge Instagram lead with existing WhatsApp lead (same phone)
        if is_instagram_lead and telefone_normalizado:
            try:
                self._try_merge_instagram_whatsapp(telefone_normalizado)
            except Exception as merge_err:
                print(f"[Agenda] Merge attempt failed (non-blocking): {merge_err}")

        print(f"[Tool] Agendar Visita: {horario_inicio}")
        cal_service = CalendarService()
        link = None

        # Normalize timestamps to Brasília timezone
        horario_inicio = self._ensure_brasilia_tz(horario_inicio)
        horario_fim = self._ensure_brasilia_tz(horario_fim)

        # Check for duplicate event before creating
        if self._event_exists(telefone_normalizado, horario_inicio):
            print(f"[Agenda] Duplicate detected — skipping creation for {telefone_normalizado} at {horario_inicio}")
            return "Visita já agendada para este horário. Não foi criado um novo evento."

        # 1. Google Calendar
        try:
            link = cal_service.create_event(
                summary=f"Visita Palmas Lake Towers - {nome}",
                description=f"Cliente: {nome}\nTel: {telefone_normalizado}\nEmail: {email}",
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
                "description": f"Visita agendada via Maria\nTelefone: {telefone_normalizado}\nEmail: {email}",
                "start_time": horario_inicio,
                "end_time": horario_fim,
                "color": "green",
                "category": "Visita",
                "lead_id": lead_uuid,
                "lead_name": nome,
                "lead_phone": telefone_normalizado,
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

                # Keep WhatsApp phone synced for Instagram leads (required for reminders).
                if is_instagram_lead:
                    try:
                        supabase.table("leads").update({
                            "phone": telefone_normalizado
                        }).eq("id", lead_uuid).execute()
                    except Exception as phone_sync_err:
                        print(f"[Agenda] Warning: could not sync lead phone (non-blocking): {phone_sync_err}")
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
        m_service = MetaService()
        msg_service = MessageService()

        m_service.send_whatsapp_image(self.lead_id, file, caption=text)
        
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
        m_service = MetaService()
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

        m_service.send_whatsapp_carousel(self.lead_id, titulo, carousel_items)
        
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
            # Block protected statuses — only specific tools can set these
            protected = ("visita_agendada", "visita_realizada", "proposta_enviada", "transferido")
            if status and status.lower() not in protected:
                update_data["status"] = status
            elif status:
                print(f"[Tool] BLOCKED: status '{status}' can only be set by the agenda tool")
                
            self._lead_query(
                supabase.table("leads").update(update_data)
            ).execute()
        except Exception as e:
            print(f"Error updating lead status: {e}")

    def transferir_para_humano(self, motivo: str, resumo_conversa: str, nome_lead: Optional[str] = None, interesse: Optional[str] = None, objetivo: Optional[str] = None):
        """
        Transfere o atendimento para o gerente comercial humano.
        Envia um resumo da conversa para o WhatsApp do gerente.
        Use quando: o lead perguntar sobre preços/valores, quiser negociar,
        ou quando a conversa precisar de atendimento humano especializado.

        Args:
            motivo: Motivo da transferência (ex: "Lead perguntou sobre valores")
            resumo_conversa: Resumo breve da conversa até o momento, incluindo nome do lead, interesse e principais pontos discutidos.
            nome_lead: Nome do lead se conhecido na conversa (opcional, complementa dados do banco).
            interesse: Tipo de imóvel mencionado pelo lead - apartamento, flat, office, sala_comercial (opcional).
            objetivo: Objetivo do lead - morar ou investir (opcional).
        """
        from services.round_robin_service import RoundRobinService

        print(f"[Tool] Transferir para humano: {motivo}")
        print(f"[Tool] Params: nome_lead={nome_lead}, interesse={interesse}, objetivo={objetivo}")

        supabase = create_client()
        try:
            # 1. Buscar dados do lead no banco
            lead_res = self._lead_query(
                supabase.table("leads").select("id, full_name, phone, instagram_id, source, interest_type, objective")
            ).execute()

            lead_info = lead_res.data[0] if lead_res.data else {}
            print(f"[Tool] DB lead_info: {lead_info}")

            # Fallback: parâmetro da IA > banco de dados > self.phone > default
            lead_name = nome_lead or lead_info.get("full_name") or "Desconhecido"
            lead_phone = lead_info.get("phone") or self.phone or "N/A"
            lead_source = lead_info.get("source") or "whatsapp"
            interest_val = interesse or lead_info.get("interest_type") or "N/A"
            objective_val = objetivo or lead_info.get("objective") or "N/A"

            # Salvar no banco dados fornecidos pela IA que o DB não tem
            if lead_info:
                update_data = {}
                if nome_lead and not lead_info.get("full_name"):
                    update_data["full_name"] = nome_lead
                if interesse and not lead_info.get("interest_type"):
                    update_data["interest_type"] = interesse.lower()
                if objetivo and not lead_info.get("objective"):
                    update_data["objective"] = objetivo.lower()
                if update_data:
                    supabase.table("leads").update(update_data).eq("id", lead_info["id"]).execute()
                    print(f"[Tool] Updated lead with missing data: {update_data}")

            # 2. Round-robin: atribuir proximo vendedor (ou fallback para gerente)
            channel = "instagram" if getattr(self, 'instagram_id', None) else "whatsapp"
            lead_id = lead_info.get("id")

            assignment = None
            if lead_id:
                rr_service = RoundRobinService()
                assignment = rr_service.assign_next_seller(
                    lead_id=lead_id,
                    transfer_reason=motivo,
                    channel=channel,
                )

            if assignment and assignment.seller:
                target_phone = assignment.seller.whatsapp_number
                seller_label = assignment.seller.full_name
            else:
                from services.round_robin_service import FALLBACK_PHONE
                target_phone = FALLBACK_PHONE
                seller_label = "Gerente Comercial"

            # 3. Montar mensagem para o vendedor/gerente
            frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
            crm_link = f"{frontend_url}/dashboard/quadro?leadId={lead_id}" if lead_id else ""

            msg = (
                f"*Transferência de Lead*\n\n"
                f"*Nome:* {lead_name}\n"
                f"*Telefone:* {lead_phone}\n"
                f"*Canal:* {lead_source}\n"
                f"*Interesse:* {interest_val}\n"
                f"*Objetivo:* {objective_val}\n"
                f"*Motivo:* {motivo}\n\n"
                f"*Resumo:*\n{resumo_conversa}"
            )
            if crm_link:
                msg += f"\n\n*Abrir no CRM:*\n{crm_link}"

            # 4. Enviar via WhatsApp para o vendedor atribuido
            m_service = MetaService()
            m_service.send_whatsapp_text(target_phone, msg)
            print(f"[Tool] Resumo enviado para {seller_label} ({target_phone})")

            # 5. Criar notificação no CRM para o vendedor
            if assignment and assignment.seller and lead_id:
                try:
                    # Resolver seller_id real (fallback tem id="" que viola FK UUID)
                    notification_seller_id = assignment.seller.id
                    if not notification_seller_id or assignment.is_fallback:
                        # Buscar admin/user pelo whatsapp_number do fallback
                        admin_lookup = supabase.table("users").select("id").eq(
                            "whatsapp_number", target_phone
                        ).limit(1).execute()
                        if not admin_lookup.data:
                            # Tentar sem código do país (55)
                            phone_without_country = target_phone[2:] if target_phone.startswith("55") and len(target_phone) > 10 else target_phone
                            admin_lookup = supabase.table("users").select("id").eq(
                                "whatsapp_number", phone_without_country
                            ).limit(1).execute()
                        if not admin_lookup.data:
                            # Último recurso: pegar o primeiro admin
                            admin_lookup = supabase.table("users").select("id").eq(
                                "role", "admin"
                            ).limit(1).execute()
                        if admin_lookup.data:
                            notification_seller_id = admin_lookup.data[0]["id"]
                            print(f"[Tool] Fallback: notificação será criada para user {notification_seller_id}")
                        else:
                            print(f"[Tool] Nenhum admin encontrado para notificação de fallback")
                            notification_seller_id = None

                    if notification_seller_id:
                        supabase.table("notifications").insert({
                            "seller_id": notification_seller_id,
                            "lead_id": lead_id,
                            "type": "transfer",
                            "title": f"Lead {lead_name} foi designado a você",
                            "body": resumo_conversa,
                            "metadata": {
                                "motivo": motivo,
                                "canal": lead_source,
                                "interesse": interest_val,
                                "objetivo": objective_val
                            }
                        }).execute()
                        print(f"[Tool] Notificação criada para {seller_label}")
                except Exception as notif_err:
                    print(f"[Tool] Erro ao criar notificação (não fatal): {notif_err}")

            # 6. Pausar IA e marcar como transferido
            if lead_res.data:
                supabase.table("leads").update({
                    "ai_paused": True,
                    "status": "transferido"
                }).eq("id", lead_info["id"]).execute()
                print(f"[Tool] IA pausada e lead {lead_info['id']} marcado como transferido")

        except Exception as e:
            print(f"[Tool] Erro ao transferir para humano: {e}")
            import traceback
            traceback.print_exc()
            return f"Erro ao transferir: {e}"

        return "Lead transferido com sucesso. Resumo enviado para o vendedor."
