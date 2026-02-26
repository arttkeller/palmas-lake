from typing import Optional, List
import json
import asyncio
from services.uazapi_service import UazapiService
from services.message_service import MessageService
from services.calendar_service import CalendarService
from services.supabase_client import create_client
from agno.agent import Agent

from agno.tools import Toolkit

class SofiaTools(Toolkit):
    def __init__(self, lead_id: str):
        super().__init__(name="sofia_tools")
        self.lead_id = lead_id
        # Extrair telefone limpo se lead_id for email ou tiver @
        self.phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
        
        # Registrar tools explicitamente
        self.register(self.enviar_mensagem)
        self.register(self.reagir_nome)
        self.register(self.atualizar_nome)
        # Tool de agendamento desativada para IA (humano agenda pelo dashboard)
        # self.register(self.agenda)
        self.register(self.enviar_imagens)
        self.register(self.enviar_carrossel)
        self.register(self.atualizar_status_lead)
        self.register(self.transferir_para_humano)

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
        
        # Simular delay de digitacao se houver múltiplas partes (logica simplificada aqui)
        # O Agno executa a funcao. Se precisarmos de async/await, o Agno suporta, mas vamos manter simples por enquanto.
        
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
        u_service.send_reaction(self.lead_id, message_id, emoji="❤️")

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
            supabase.table("leads").update({"full_name": nome}).eq("phone", self.phone).execute()
        except Exception as e:
            print(f"Error updating name: {e}")

    def agenda(self, nome: str, email: str, telefone: str, horario_inicio: str, horario_fim: str):
        """
        Agenda uma visita ao stand de vendas do Palmas Lake. 
        Use quando o cliente confirmar interesse em visitar e você tiver coletado todos os dados.
        
        Args:
            nome: Nome completo do cliente.
            email: Email do cliente.
            telefone: Telefone com DDD (apenas números).
            horario_inicio: Data e hora de início (ISO 8601, ex: 2025-01-20T10:00:00).
            horario_fim: Data e hora de fim.
        """
        print(f"[Tool] Agendar Visita: {horario_inicio}")
        cal_service = CalendarService()
        link = None
        
        # 1. Google Calendar
        try:
            link = cal_service.create_event(
                summary=f"Visita Palmas Lake - {nome}",
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
            lead_res = supabase.table("leads").select("id").eq("phone", self.phone).execute()
            lead_uuid = lead_res.data[0]["id"] if lead_res.data else None
            
            # Criar evento na tabela events
            event_data = {
                "title": f"Visita - {nome}",
                "description": f"Visita agendada via Sofia\nTelefone: {telefone}\nEmail: {email}",
                "start_time": horario_inicio,
                "end_time": horario_fim,
                "color": "green",
                "category": "Visita",
                "lead_id": lead_uuid,
                "lead_name": nome,
                "lead_phone": telefone,
                "lead_email": email,
                "location": "Stand Palmas Lake",
                "status": "confirmado",
                "created_by": "ai_sofia",
                "notes": f"Google Calendar: {link}" if link else "Criado apenas no sistema"
            }
            
            result = supabase.table("events").insert(event_data).execute()
            if result.data:
                print(f"[Agenda] Event saved to database: {result.data[0]['id']}")
            
            # Atualizar status do lead
            if lead_uuid:
                supabase.table("leads").update({
                    "status": "visita_agendada",
                    "temperature": "quente"
                }).eq("id", lead_uuid).execute()
        
        except Exception as e:
            print(f"[Agenda] Error saving event to database: {e}")
            import traceback
            traceback.print_exc()

        return "Visita agendada com sucesso e registrada no calendário."

    def enviar_imagens(self, file: str, text: str):
        """
        Envia UMA imagem do empreendimento Palmas Lake via WhatsApp. 
        
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

            supabase.table("leads").update(update_data).eq("phone", self.phone).execute()
        except Exception as e:
            print(f"Error updating lead status: {e}")

    def transferir_para_humano(self, motivo: str, resumo_conversa: str, nome_lead: Optional[str] = None, interesse: Optional[str] = None, objetivo: Optional[str] = None):
        """
        Transfere o atendimento para o gerente comercial humano.
        Envia um resumo da conversa para o WhatsApp do gerente.
        Use quando: visita for agendada com sucesso, lead perguntar sobre preços/valores,
        quiser negociar, ou quando a conversa precisar de atendimento humano especializado.
        🚨 OBRIGATÓRIO após TODA visita agendada.

        Args:
            motivo: Motivo da transferência (ex: "Visita agendada - lead qualificado")
            resumo_conversa: Resumo breve da conversa até o momento, incluindo nome do lead, interesse e principais pontos discutidos.
            nome_lead: Nome do lead se conhecido na conversa (opcional, complementa dados do banco).
            interesse: Tipo de imóvel mencionado pelo lead (opcional).
            objetivo: Objetivo do lead - morar ou investir (opcional).
        """
        from services.round_robin_service import RoundRobinService

        print(f"[Tool] Transferir para humano: {motivo}")
        print(f"[Tool] Params: nome_lead={nome_lead}, interesse={interesse}, objetivo={objetivo}")

        supabase = create_client()
        try:
            # 1. Buscar dados do lead no banco
            lead_res = supabase.table("leads").select(
                "id, full_name, phone, source, interest_type, objective"
            ).eq("phone", self.phone).execute()

            lead_info = lead_res.data[0] if lead_res.data else {}
            print(f"[Tool] DB lead_info: {lead_info}")

            # Fallback: parâmetro da IA > banco de dados > self.phone > default
            lead_name = nome_lead or lead_info.get("full_name") or "Desconhecido"
            lead_phone = lead_info.get("phone") or self.phone or "N/A"
            lead_source = lead_info.get("source") or "instagram"
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
            lead_id = lead_info.get("id")

            assignment = None
            if lead_id:
                rr_service = RoundRobinService()
                assignment = rr_service.assign_next_seller(
                    lead_id=lead_id,
                    transfer_reason=motivo,
                    channel="instagram",
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
                f"*Transferência de Lead — Palmas Lake Residence*\n\n"
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
            u_service = UazapiService()
            u_service.send_whatsapp_message(target_phone, msg)
            print(f"[Tool] Resumo enviado para {seller_label} ({target_phone})")

            # 5. Pausar IA e marcar como transferido
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
