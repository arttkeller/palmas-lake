
import os
import json
import asyncio
from typing import List, Dict, Any
from tenacity import retry, stop_after_attempt, wait_fixed
from datetime import datetime
import pytz
import re
import time

# Agno imports
from agno.agent import Agent
from agno.models.openai import OpenAIChat

from services.maria_tools import MariaTools
from services.temperature_service import TemperatureService, classify_lead_temperature

def _lookup_lead(supabase, lead_id: str, select_fields: str = "id"):
    """
    Look up a lead by phone or instagram_id based on the lead_id format.
    
    Args:
        supabase: Supabase client instance
        lead_id: Lead identifier - 'ig:<igsid>' for Instagram, phone/jid for WhatsApp
        select_fields: Comma-separated fields to select
    
    Returns:
        Supabase query result
    """
    if lead_id.startswith("ig:"):
        ig_id = lead_id[3:]
        return supabase.table("leads").select(select_fields).eq("instagram_id", ig_id).execute()
    else:
        phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
        return supabase.table("leads").select(select_fields).eq("phone", phone).execute()


class AgentManager:
    def __init__(self):
        # As chaves sao pegas do ambiente automaticamente pelo Agno ou OpenAI
        self.prompt_path = os.path.join(os.path.dirname(__file__), "../prompts/MARIA_SYSTEM.md")
        self.reasoning_effort_main = "medium"
        self.reasoning_effort_analysis = "medium"

    def _load_system_prompt(self, channel: str = "whatsapp") -> str:
        """Lê o prompt do arquivo MD e injeta variáveis dinâmicas"""
        try:
            # Carregar System Prompt e injetar regra de formatação WhatsApp
            try:
                with open(self.prompt_path, "r", encoding="utf-8") as f:
                    base_prompt = f.read()
            except:
                base_prompt = "Você é a Maria, assistente virtual do Palmas Lake Towers."

            # Regras de formatação específicas por canal
            if channel == "instagram":
                formatting_rules = """
IMPORTANTE DE FORMATAÇÃO INSTAGRAM:
- 🚨 PROIBIDO usar asteriscos para formatação (*texto* ou **texto**). Instagram não suporta markdown.
- Use apenas texto simples, sem formatação especial.
- Evite listas com hífens se possível, prefira texto fluido ou emojis.
- 🚨 PROIBIDO usar travessão (—) ou meia-risca (–). Use vírgula, ponto ou quebre em frases separadas.
- Use emojis para dar ênfase quando necessário."""
            else:  # whatsapp
                formatting_rules = """
IMPORTANTE DE FORMATAÇÃO WHATSAPP:
- Use APENAS UM asterisco para negrito (ex: *texto*). NUNCA use dois asteriscos (**texto**).
- Evite listas com hífens se possível, prefira texto fluido ou emojis.
- 🚨 PROIBIDO usar travessão (—) ou meia-risca (–). Use vírgula, ponto ou quebre em frases separadas."""

            system_prompt = f"{base_prompt}\n\nDATA ATUAL (Horário de Brasília): {datetime.now(pytz.timezone('America/Sao_Paulo')).strftime('%d/%m/%Y %H:%M')}{formatting_rules}"

            return system_prompt
        except Exception as e:
            print(f"Error loading system prompt: {e}")
            return "Erro crítico ao carregar personalidade da IA."

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
    async def generate_response(self, conversation_history: List[Dict[str, str]], lead_id: str = None, channel: str = "whatsapp") -> str:
        try:
            # 1. Preparar Tools com contexto do lead
            maria_tools = MariaTools(lead_id) if lead_id else []
            tools_list = [maria_tools] if maria_tools else []

            # 2. Carregar Prompt com regras específicas do canal
            system_prompt = self._load_system_prompt(channel=channel)
            
            # 3. Configurar Agente Agno (Maria)
            # Usando GPT-5.2 conforme solicitado
            agent_maria = Agent(
                model=OpenAIChat(
                    id="gpt-5.2",
                    reasoning_effort=self.reasoning_effort_main,
                    max_completion_tokens=2000
                ),
                description="Você é Maria, a assistente virtual do Palmas Lake Towers.",
                instructions=system_prompt,
                tools=tools_list,
                markdown=True
            )

            # 4. Construir Prompt com Histórico
            last_user_msg = "Olá"
            chat_context = ""
            
            if conversation_history:
                # Se a ultima for user, extraímos como input principal
                # se não, usamos todo histórico como contexto
                if conversation_history[-1]['role'] == 'user':
                    last_user_msg = conversation_history[-1]['content']
                    prev_msgs = conversation_history[:-1]
                else:
                    prev_msgs = conversation_history
                
                # Formatar histórico para contexto
                for msg in prev_msgs:
                    role_display = "Cliente" if msg['role'] == 'user' else "Maria"
                    chat_context += f"{role_display}: {msg['content']}\n"
            
            if chat_context:
                prompt_input = f"""
Histórico da conversa:
{chat_context}

Mensagem atual do Cliente:
{last_user_msg}
"""
            else:
                prompt_input = last_user_msg

            # 5. Executar Agente (em thread separada para não bloquear o event loop)
            print(f"[Maria] Running Agno Agent with GPT-5.2 for {lead_id}...")
            
            run_response = await asyncio.to_thread(agent_maria.run, prompt_input)
            
            return run_response.content

        except Exception as e:
            import traceback
            error_msg = f"Error generating AI response with Agno: {e}\n{traceback.format_exc()}"
            print(error_msg)
            try:
                with open("agent_error.log", "a") as f:
                    f.write(f"\n--- Error at {datetime.now()} ---\n{error_msg}\n")
            except:
                pass
            return "Desculpe, estou com dificuldades técnicas no momento. (Erro interno registrado)"

    async def process_message_buffer(self, lead_id: str, messages: List[tuple], pushname: str = "") -> str:
        """Processa um buffer de mensagens acumuladas"""
        
        # --- VERIFICAÇÃO DE DUPLICIDADE (DEBOUNCE) ---
        # Verificar se a última mensagem no banco para este lead é do tipo 'assistant' e foi criada há menos de 15 segundos.
        try:
            from services.supabase_client import create_client
            supabase_client = create_client()
            
            # Buscar o lead pelo phone ou instagram_id para obter o conversation_id
            lead_res = _lookup_lead(supabase_client, lead_id, "id")
            
            if lead_res.data:
                db_lead_id = lead_res.data[0]["id"]
                conv_res = supabase_client.table("conversations").select("id").eq("lead_id", db_lead_id).execute()

                if conv_res.data:
                    all_conv_ids = [c["id"] for c in conv_res.data]
                    # Buscar última mensagem de todas as conversas do lead
                    last_msgs = supabase_client.table("messages") \
                        .select("*") \
                        .in_("conversation_id", all_conv_ids) \
                        .order("created_at", direction="desc") \
                        .limit(1) \
                        .execute()
                    
                    if last_msgs.data:
                        last_msg = last_msgs.data[0]
                        # Se a ultima msg for assistant (enviada pela IA)
                        if last_msg.get("sender_type") == "ai":
                            # Checar tempo. created_at vem como string ISO.
                            from datetime import timezone
                            created_at = datetime.fromisoformat(last_msg["created_at"].replace("Z", "+00:00"))
                            now = datetime.now(timezone.utc)
                            diff = (now - created_at).total_seconds()
                            
                            if diff < 60: # Janela de 60s para evitar duplicatas (Meta pode retransmitir webhooks)
                                print(f"⚠️ [Anti-Duplicate] Mensagem ignorada. IA respondeu há {diff:.1f}s.")
                                return "IGNORED_DUPLICATE"
        except Exception as e:
            print(f"⚠️ [Anti-Duplicate Error] Falha ao verificar duplicidade: {e}")
        # -----------------------------------------------

        import time
        start_time = time.time()
        start_timestamp = datetime.now().strftime("%H:%M:%S")
        
        print(f"--- AI Processing Start: {start_timestamp} for Lead: {lead_id} ---")
        
        from services.supabase_client import create_client
        supabase = create_client()
        
        # Consolida mensagens recebidas
        current_message_content = ""
        for content, msg_id in messages:
            current_message_content += f"[ID: {msg_id}] {content}\n"
            
        history = []
        lead_context_str = ""
        
        # 1. Recuperar contexto do Lead e Histórico
        try:
            lead_res = _lookup_lead(supabase, lead_id, "*")
            
            if lead_res.data:
                lead_data = lead_res.data[0]
                db_lead_id = lead_data["id"]
                full_name = lead_data.get("full_name", "Desconhecido")
                status = lead_data.get("status", "novo")
                temperature = lead_data.get("temperature", "frio")
                source = lead_data.get("source", "whatsapp")
                qualification_state = lead_data.get("qualification_state", {})
                current_step = qualification_state.get("step", "name") if qualification_state else "name"
                
                # Build source-specific context
                source_info = ""
                if source == "instagram":
                    source_info = """
    <channel>Instagram DM</channel>
    <channel_rule>Este lead veio pelo Instagram. O nome dele ja foi obtido automaticamente do perfil do Instagram. NAO pergunte o nome novamente. Comece pela proxima etapa da qualificacao (tipo de interesse).</channel_rule>"""
                elif current_step != "name" and not full_name.startswith("Lead "):
                    source_info = f"""
    <channel>WhatsApp</channel>
    <channel_rule>O nome deste lead ({full_name}) foi obtido automaticamente do perfil do WhatsApp. NAO pergunte o nome novamente. Cumprimente pelo nome, se apresente como Maria consultora do Palmas Lake Towers, e comece pela proxima etapa da qualificacao (tipo de interesse).</channel_rule>"""
                
                lead_context_str = f"""
<lead_context>
    <name>{full_name}</name>
    <status>{status}</status>
    <temperature>{temperature}</temperature>
    <source>{source}</source>
    <qualification_step>{current_step}</qualification_step>{source_info}
</lead_context>
"""
                
                conv_res = supabase.table("conversations").select("id").eq("lead_id", db_lead_id).execute()

                if conv_res.data:
                    # Load messages from ALL conversations (WhatsApp + Instagram after merge)
                    all_conv_ids = [c["id"] for c in conv_res.data]
                    msgs_res = supabase.table("messages").select("*").in_("conversation_id", all_conv_ids).order('created_at', direction="desc").limit(500).execute()
                    
                    if msgs_res.data:
                        # Reordenar cronologicamente
                        past_msgs = sorted(msgs_res.data, key=lambda x: x['created_at'])
                        
                        for m in past_msgs:
                            role = "assistant" if m["sender_type"] == "ai" else "user"
                            content = m["content"]
                            # Evitar duplicar a mensagem que acabamos de receber se ela já foi salva
                            if content.strip() == current_message_content.split(']')[-1].strip():
                                continue 
                            history.append({"role": role, "content": content})
                            
        except Exception as e:
            print(f"Error fetching history: {e}")

        # 2. Adicionar mensagem atual ao histórico para o prompt
        if current_message_content:
             history.append({"role": "user", "content": current_message_content})
        
        if not history:
             return None

        # 3. Adicionar contexto do sistema
        if lead_context_str:
            history.insert(0, {"role": "system", "content": lead_context_str})

        # 4. Determinar canal baseado no source do lead
        channel = "instagram" if source == "instagram" else "whatsapp"
        
        # 5. Gerar resposta com regras específicas do canal
        response_text = await self.generate_response(history, lead_id=lead_id, channel=channel)
        
        # 5. Análise de Sentimento (Pós-resposta)
        try:
             # Usa mensagens do lead do histórico
             lead_msgs = [m['content'] for m in history if m['role'] == 'user']
             msgs_text = "\n".join(lead_msgs[-5:]) # Últimas 5
             await self._analyze_and_update_sentiment(lead_id, msgs_text)
        except Exception as sentiment_err:
             print(f"Sentiment analysis error: {sentiment_err}")

        end_time = time.time()
        print(f"--- AI Processing End (Duration: {end_time - start_time:.2f}s) ---")
        
        return response_text

    async def _analyze_and_update_sentiment(self, lead_id: str, messages_text: str):
        """Analisa sentimento usando Agent Agno com GPT-5-mini"""
        
        print(f"[Sentiment] Starting analysis for {lead_id}")
        
        # Fetch current lead status before running sentiment analysis (Requirements 8.1, 8.2)
        lead_status = None
        try:
            from services.supabase_client import create_client
            supabase_status = create_client()
            lead_status_res = _lookup_lead(supabase_status, lead_id, "status")
            if lead_status_res.data:
                lead_status = lead_status_res.data[0].get("status")
                print(f"[Sentiment] Lead {lead_id} current status: {lead_status}")
        except Exception as e:
            print(f"[Sentiment] Error fetching lead status: {e}")
        
        # Build status context for the prompt
        status_context = ""
        if lead_status:
            status_context = f"\n            STATUS ATUAL DO LEAD: {lead_status}\n"
        
        # Build scheduled lead rule
        scheduled_lead_rule = ""
        if lead_status and lead_status.lower() in ("visita_agendada", "visita agendada"):
            scheduled_lead_rule = """
            ## REGRA CRÍTICA PARA LEADS COM VISITA AGENDADA
            Este lead JÁ TEM uma visita agendada. Isso é um sinal FORTEMENTE POSITIVO.
            - sentiment_label DEVE ser "Positivo"
            - sentiment_score DEVE ser maior que 0.6
            - temperature DEVE ser "quente"
            Não importa o tom das mensagens recentes — o fato de ter agendado visita indica interesse real.
            """
        
        prompt = f"""
            Analise a conversa abaixo entre um Lead e a IA Maria (assistente imobiliária).
            {scheduled_lead_rule}
            ## REGRAS DE CLASSIFICAÇÃO DE TEMPERATURA (OBRIGATÓRIO)
            
            ### QUENTE (temperature: "quente") - Lead com alta probabilidade de conversão:
            - Quer agendar visita ou já agendou
            - Pergunta sobre preço, condições de pagamento, financiamento
            - Demonstra urgência ("preciso logo", "quando posso ver?")
            - Faz perguntas específicas sobre unidades disponíveis
            - Menciona que está pronto para comprar/investir
            - Exemplos: "Quero agendar uma visita", "Qual o valor?", "Tem disponibilidade essa semana?"
            
            ### MORNO (temperature: "morno") - Lead engajado mas sem sinais fortes:
            - Responde às mensagens normalmente
            - Faz perguntas gerais sobre o empreendimento
            - Demonstra interesse mas sem urgência
            - Pede mais informações
            - Exemplos: "Interessante", "Me conta mais", "Quantos quartos tem?"
            
            ### FRIO (temperature: "frio") - Lead com baixo engajamento:
            - Respostas curtas sem interesse ("ok", "entendi", "depois vejo")
            - Demonstra desinteresse explícito
            - Não responde há mais de 24 horas
            - Pede para não ser contatado
            - Exemplos: "Não tenho interesse", "Agora não", "Depois eu vejo"
            
            ## CAMPOS A RETORNAR:
            
            1. 'sentiment_score': Float de -1.0 a 1.0
               - > 0.6: Interesse alto (quente)
               - 0.2 a 0.6: Interesse moderado (morno)
               - < 0.2: Baixo interesse (frio)
               
            2. 'sentiment_label': "Positivo", "Neutro" ou "Negativo"
            
            3. 'temperature': OBRIGATÓRIO - "quente", "morno" ou "frio" (seguir regras acima)
            
            4. 'adjectives': Lista de 3 adjetivos curtos descrevendo o lead
               Exemplos: ["Interessado", "Decidido", "Urgente"], ["Curioso", "Cauteloso"], ["Desinteressado"]
            
            5. 'status': Status kanban - ESCOLHA UM:
               ["Novo Lead", "Em Atendimento", "Visita Agendada", "Proposta", "Quente", "Frio", "Finalizado"]
               
            6. 'tags': Lista de tags técnicas baseadas nas preferências mencionadas
               Exemplos: ["apartamento", "investidor", "andar_alto", "familia_grande", "vista_mar", "2_quartos"]

            7. 'interest_type': Tipo de imóvel que o lead demonstrou interesse. ESCOLHA UM:
               ["apartamento", "sala_comercial", "office", "flat"]
               Se o lead não mencionou tipo específico, retorne null.

            8. 'conversation_summary': Resumo de 1-2 frases da conversa do lead com a IA.
               Deve capturar o ponto principal: o que o lead quer, o que foi discutido, e o status atual.
               Exemplo: "Lead interessado em apartamento 2 quartos para investimento. Visita agendada para sexta."

            CONTEXTO DO LEAD: {lead_id}
            {status_context}
            CONVERSA RECENTE:
            {messages_text}
            
            Responda APENAS o JSON válido, sem texto adicional.
            """

        try:
             # Agente de Análise
            agent_sentiment = Agent(
                model=OpenAIChat(
                    id="gpt-5-mini",
                    reasoning_effort=self.reasoning_effort_analysis,
                    max_completion_tokens=1000
                ),
                description="Você é um analisador de dados imobiliários.",
                markdown=True
            )
            
            print(f"[Sentiment] Running Agno Agent (GPT-5-mini)...")
            response = await asyncio.to_thread(agent_sentiment.run, prompt)
            content = response.content
            
            # Limpeza de JSON
            content = content.replace("```json", "").replace("```", "").strip()
            # Tentar extrair apenas o objeto JSON se houver texto em volta
            import re
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                content = json_match.group(0)
            
            sentiment_data = json.loads(content)
            
            # Deterministic override for scheduled/positive leads (Requirements 8.1, 8.2)
            # Check BOTH the current DB status AND the status the AI just assigned
            ai_status = (sentiment_data.get("status") or "").strip().lower()
            db_status = (lead_status or "").strip().lower()
            is_scheduled = any(
                s in ("visita_agendada", "visita agendada", "visita_realizada", "visita realizada")
                for s in [db_status, ai_status]
            )
            
            if is_scheduled:
                current_score = sentiment_data.get("sentiment_score", 0)
                if not isinstance(current_score, (int, float)) or current_score <= 0.6:
                    sentiment_data["sentiment_score"] = max(0.7, current_score if isinstance(current_score, (int, float)) else 0.7)
                sentiment_data["sentiment_label"] = "Positivo"
                sentiment_data["temperature"] = "quente"
                print(f"[Sentiment] Override for scheduled lead {lead_id}: score={sentiment_data['sentiment_score']}, label=Positivo, temp=quente")
            
            print(f"[Sentiment] Lead {lead_id}: score={sentiment_data.get('sentiment_score')}, label={sentiment_data.get('sentiment_label')}")
            
            from services.supabase_client import create_client
            supabase = create_client()
            
            # Buscar o lead pelo phone ou instagram_id para obter o ID do lead no DB e last_interaction
            lead_res = _lookup_lead(supabase, lead_id, "id, last_interaction")
            if not lead_res.data:
                print(f"[Sentiment] Lead {lead_id} not found in DB.")
                return

            db_lead_id = lead_res.data[0]["id"]
            last_interaction_str = lead_res.data[0].get("last_interaction")
            
            # Parse last_interaction for temperature classification
            last_interaction = None
            if last_interaction_str:
                try:
                    from datetime import timezone
                    last_interaction = datetime.fromisoformat(last_interaction_str.replace("Z", "+00:00"))
                except Exception as e:
                    print(f"[Sentiment] Error parsing last_interaction: {e}")

            update_payload = {
                "sentiment_label": sentiment_data.get("sentiment_label")
            }

            # Convert sentiment_score from float [-1.0, 1.0] to integer [-100, 100] (Requirements 6.3)
            raw_score = sentiment_data.get("sentiment_score")
            if isinstance(raw_score, (int, float)):
                update_payload["sentiment_score"] = round(raw_score * 100)
            else:
                update_payload["sentiment_score"] = 0

            if sentiment_data.get("status"):
                # Map AI-friendly status names to database constraint values
                status_mapping = {
                    "novo lead": "novo_lead",
                    "em atendimento": "qualificado",
                    "visita agendada": "visita_agendada",
                    "proposta": "proposta_enviada",
                    "quente": "qualificado",
                    "frio": "lost",
                    "finalizado": "sold",
                    # Already valid values pass through
                    "new": "new",
                    "novo_lead": "novo_lead",
                    "contacted": "contacted",
                    "qualificado": "qualificado",
                    "visita_agendada": "visita_agendada",
                    "visita_realizada": "visita_realizada",
                    "proposta_enviada": "proposta_enviada",
                    "transferido": "transferido",
                    "visit_scheduled": "visit_scheduled",
                    "sold": "sold",
                    "lost": "lost",
                }
                raw_status = sentiment_data["status"].strip().lower()
                mapped_status = status_mapping.get(raw_status)
                # Block visita_agendada from sentiment — only the agenda() tool can set this
                protected_statuses = ("visita_agendada", "visit_scheduled", "visita_realizada", "proposta_enviada")
                if mapped_status and mapped_status in protected_statuses:
                    print(f"[Sentiment] BLOCKED: status '{mapped_status}' can only be set by the agenda/proposal tool, not sentiment analysis")
                elif mapped_status:
                    update_payload["status"] = mapped_status
                else:
                    print(f"[Sentiment] Unknown status from AI: '{sentiment_data['status']}', skipping status update")
            
            # Use TemperatureService for classification (Requirements 5.1, 5.2, 5.3, 5.4)
            temp_service = TemperatureService()
            
            # Get temperature from AI analysis or classify based on signals
            ai_temperature = sentiment_data.get("temperature", "").lower()
            sentiment_score = sentiment_data.get("sentiment_score")
            
            # Check if lead wants to schedule (hot signal)
            wants_to_schedule = any(
                keyword in messages_text.lower() 
                for keyword in ["agendar", "visita", "visitar", "quando posso"]
            )
            
            # Use temperature service to validate/classify
            classified_temp = classify_lead_temperature(
                sentiment_score=sentiment_score,
                sentiment_label=sentiment_data.get("sentiment_label"),
                last_interaction=last_interaction,
                message_content=messages_text,
                wants_to_schedule=wants_to_schedule
            )
            
            # Use AI temperature if provided, otherwise use classified
            # Accept both Portuguese and English from AI output
            if ai_temperature in ["quente", "morno", "frio"]:
                final_temperature = ai_temperature
            elif ai_temperature in ["hot", "warm", "cold"]:
                # AI returned English directly — no mapping needed, store as-is
                update_payload["temperature"] = ai_temperature
                final_temperature = None  # skip the map_temperature_to_english below
            else:
                final_temperature = classified_temp
            
            # Map to English and save (only if we got a Portuguese value)
            if final_temperature is not None:
                update_payload["temperature"] = temp_service.map_temperature_to_english(final_temperature)
            
            # Extract and save tags as native list for jsonb column (Requirements 3.1, 3.3)
            # Send Python lists directly — Supabase client serializes for jsonb columns
            if sentiment_data.get("tags"):
                tags = sentiment_data["tags"]
                if isinstance(tags, list):
                    update_payload["tags"] = tags
                elif isinstance(tags, str):
                    update_payload["tags"] = [tags]
            
            # Extract and save adjectives as native list for jsonb column (Requirements 3.2, 3.4)
            if sentiment_data.get("adjectives"):
                adjectives = sentiment_data["adjectives"]
                if isinstance(adjectives, list):
                    update_payload["adjectives"] = adjectives
                elif isinstance(adjectives, str):
                    update_payload["adjectives"] = [adjectives]
            
            # Extract and save interest_type (Requirements 2.3, 7.1, 7.2, 7.3)
            valid_interest_types = {"apartamento", "sala_comercial", "office", "flat"}
            interest_type = sentiment_data.get("interest_type")
            if isinstance(interest_type, str) and interest_type.lower() in valid_interest_types:
                update_payload["interest_type"] = interest_type.lower()
            
            # Extract and save conversation summary
            if sentiment_data.get("conversation_summary"):
                update_payload["conversation_summary"] = str(sentiment_data["conversation_summary"])
            
            # Auto-qualify: if lead expressed a specific interest type, move to qualificado
            # This ensures consistent behavior across channels (Instagram/WhatsApp)
            if update_payload.get("interest_type"):
                payload_status = update_payload.get("status", "")
                early_statuses = ("novo_lead", "new", "")
                if payload_status in early_statuses or not payload_status:
                    # Also check DB status to avoid downgrading advanced leads
                    try:
                        _lead_check = supabase.table("leads").select("status").eq("id", db_lead_id).execute()
                        db_current = (_lead_check.data[0].get("status", "") if _lead_check.data else "").lower()
                    except Exception:
                        db_current = ""
                    if db_current in early_statuses or not db_current:
                        update_payload["status"] = "qualificado"
                        print(f"[Sentiment] Auto-qualified lead {db_lead_id}: interest_type={update_payload['interest_type']}")

            # Save full analysis for reference
            update_payload["last_analysis"] = sentiment_data

            # Final safety check: re-read current status and enforce Positivo for scheduled leads
            try:
                current_lead = supabase.table("leads").select("status").eq("id", db_lead_id).execute()
                current_status = (current_lead.data[0].get("status", "") if current_lead.data else "").lower()
                if current_status in ("visita_agendada", "visita_realizada", "proposta_enviada"):
                    update_payload["sentiment_label"] = "Positivo"
                    if update_payload.get("sentiment_score", 0) < 70:
                        update_payload["sentiment_score"] = 70
                    print(f"[Sentiment] Final override: status={current_status} → sentiment forced to Positivo")
            except Exception as e:
                print(f"[Sentiment] Final safety check error (non-blocking): {e}")
            
            print(f"[Sentiment] Updating lead {db_lead_id} with payload: {json.dumps(update_payload, default=str)}")
            result = supabase.table("leads").update(update_payload).eq("id", db_lead_id).execute()
            print(f"[Sentiment] Update result: {result.data}")
            
        except Exception as e:
            import traceback
            print(f"[Sentiment] Error: {e}")
            traceback.print_exc()
