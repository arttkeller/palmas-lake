
import os
import json
import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime
import pytz
import re
import time

logger = logging.getLogger(__name__)

# Agno imports
from agno.agent import Agent
from agno.models.openai import OpenAIChat, OpenAIResponses

from services.maria_tools import MariaTools
from services.temperature_service import TemperatureService, classify_lead_temperature
from services.observability import metrics
from services.routing_service import MessageRouter
from services.semantic_cache import semantic_cache

# ── Rolling Summary: Redis key + summarization constants ──────────────
_K_SUMMARY = "conv:summary:{}"          # Redis key per lead_id (TTL 24h)
_SUMMARY_TTL = 86_400                   # 24 hours
_SUMMARY_MSG_THRESHOLD = 15             # generate summary when history > 15 messages
_SUMMARY_REFRESH_INTERVAL = 10          # re-generate every +10 messages
_RECENT_WINDOW = 15                     # keep last 15 messages verbatim in prompt

_SUMMARY_PROMPT = """Resuma a conversa abaixo entre um Cliente e a assistente Maria (imobiliária do Palmas Lake Towers).

REGRAS:
- Máximo 150 palavras
- Capture: nome do cliente (se mencionado), tipo de interesse (apartamento/sala/flat), etapa da qualificação, perguntas já respondidas, próximos passos
- NÃO inclua saudações ou formalidades
- Escreva em terceira pessoa ("O cliente demonstrou interesse em...")
- Se houver transferência para vendedor, mencione

CONVERSA:
{conversation}

RESUMO:"""

# Instruções estáticas do sentiment analysis — constante de módulo para prompt caching.
# Vai como system message (instructions) do agente, mantendo prefixo idêntico entre requests.
_SENTIMENT_INSTRUCTIONS = """Analise a conversa entre um Lead e a IA Maria (assistente imobiliária).

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
"""


def _lookup_lead(supabase, lead_id: str, select_fields: str = "id"):
    """
    Look up a lead by phone or instagram_id based on the lead_id format.
    Normalizes Brazilian phone numbers (adds 9th digit for DDDs >= 29).

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
        raw_phone = lead_id.split('@')[0] if '@' in lead_id else lead_id
        from services.meta_service import MetaService
        phone = MetaService.normalize_whatsapp_number(raw_phone) or raw_phone
        res = supabase.table("leads").select(select_fields).eq("phone", phone).execute()
        # Fallback: try raw phone for leads stored before normalization
        if not res.data and phone != raw_phone:
            res = supabase.table("leads").select(select_fields).eq("phone", raw_phone).execute()
        return res


# ── Output Guardrail: detecta respostas que são erros internos ──────────
_ERROR_PATTERNS = [
    re.compile(r"Error .+ with Agno", re.IGNORECASE),
    re.compile(r"Traceback \(most recent call last\)", re.IGNORECASE),
    re.compile(r"openai\.(?:APIError|BadRequestError|RateLimitError)", re.IGNORECASE),
    re.compile(r"(?:Erro interno|dificuldades técnicas).*registrado", re.IGNORECASE),
    re.compile(r"HTTPStatusError|status_code[=:]\s*[45]\d{2}", re.IGNORECASE),
    re.compile(r"Function tools with reasoning_effort are not supported", re.IGNORECASE),
]

def _is_error_response(text: str) -> bool:
    """Output guardrail: retorna True se o texto parece ser uma mensagem de erro interna."""
    if not text or len(text) < 10:
        return False
    return any(p.search(text) for p in _ERROR_PATTERNS)


_agent_semaphore = asyncio.Semaphore(10)

class AgentManager:
    def __init__(self):
        # As chaves sao pegas do ambiente automaticamente pelo Agno ou OpenAI
        self.prompt_path = os.path.join(os.path.dirname(__file__), "../prompts/MARIA_SYSTEM.md")
        self.reasoning_effort_main = "medium"
        self.reasoning_effort_analysis = "medium"
        self._last_messages_sent_via_tool = False
        self._last_run_metadata: dict = {}  # Populated by generate_response for Sentry enrichment

    @staticmethod
    def _extract_name_from_response(ai_response: str, user_message: str) -> str:
        """
        Fallback: extract lead name from AI response when atualizar_nome tool wasn't called.
        Looks for patterns like "Prazer, X!", "Olá, X!", "Bem-vinda, X!" in the AI response.
        Returns the extracted name or empty string if not found.
        """
        import re
        # Patterns where the AI greets the user by name
        patterns = [
            r'[Pp]razer,?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*[!❤️🤩🥰😊✨🌟💚]',
            r'[Oo]l[áa],?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*[!❤️🤩🥰😊✨🌟💚]',
            r'[Bb]em[-\s]?vind[ao],?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*[!❤️🤩🥰😊✨🌟💚]',
            r'[Qq]ue\s+bom,?\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*[!❤️🤩🥰😊✨🌟💚]',
            # Simple: name followed by comma/exclamation in first sentence
            r'^[^.!?]*?(?:[Pp]razer|[Oo]l[áa])[,!]?\s+([A-ZÀ-Ú][a-zà-ú]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, ai_response)
            if match:
                name = match.group(1).strip()
                # Sanity check: name should be 2-30 chars, not a common word
                skip_words = {"Sou", "Tudo", "Bem", "Bom", "Como", "Que", "Maria", "Lake", "Palmas", "Towers"}
                if 2 <= len(name) <= 30 and name not in skip_words:
                    return name

        # Second strategy: if user's message is very short (likely just a name)
        clean_msg = user_message.strip().strip('"\'').strip()
        # Remove [ID: xxx] prefix from buffered messages
        clean_msg = re.sub(r'\[ID:\s*[^\]]+\]\s*', '', clean_msg).strip()
        if clean_msg and 2 <= len(clean_msg) <= 30:
            words = clean_msg.split()
            # 1-3 words, all capitalized or title-cased = likely a name
            if 1 <= len(words) <= 3 and all(w[0].isupper() for w in words if w):
                skip_words = {"Oi", "Olá", "Ola", "Bom", "Boa", "Sim", "Não", "Nao", "Ok", "Tudo", "Dia", "Tarde", "Noite",
                              "Obrigado", "Obrigada", "Office", "Flat", "Apartamento", "Sala", "Cobertura"}
                if words[0] not in skip_words:
                    return clean_msg

        return ""

    # Class-level cache: system prompt por canal (estável, sem timestamp)
    # Evita reler ~46KB do disco a cada request e mantém prefixo idêntico para prompt caching
    _prompt_cache: dict = {}

    def _load_system_prompt(self, channel: str = "whatsapp") -> str:
        """Lê o prompt do arquivo MD com cache em memória (sem timestamp para prompt caching)"""
        if channel in AgentManager._prompt_cache:
            return AgentManager._prompt_cache[channel]

        try:
            try:
                with open(self.prompt_path, "r", encoding="utf-8") as f:
                    base_prompt = f.read()
            except Exception as e:
                logger.error(f"[AgentManager] Error loading prompt: {e}")
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

            # Timestamp removido do system prompt (vai no user message) para habilitar prompt caching
            system_prompt = f"{base_prompt}{formatting_rules}"

            AgentManager._prompt_cache[channel] = system_prompt
            logger.info(f"[AgentManager] System prompt cached for channel '{channel}' ({len(system_prompt)} chars)")
            return system_prompt
        except Exception as e:
            logger.error(f"Error loading system prompt: {e}")
            return "Erro crítico ao carregar personalidade da IA."

    async def generate_response(self, conversation_history: List[Dict[str, str]], lead_id: str = None, channel: str = "whatsapp",
                                qualification_step: str = "", status: str = "", temperature: str = "", history_length: int = 0) -> tuple[str | None, dict]:
        async with _agent_semaphore:
            try:
                # 1. Preparar Tools com contexto do lead
                maria_tools = MariaTools(lead_id) if lead_id else []
                tools_list = [maria_tools] if maria_tools else []

                # 2. Carregar Prompt com regras específicas do canal
                system_prompt = self._load_system_prompt(channel=channel)

                # 3. Roteamento dinâmico de modelo
                last_user_msg_for_routing = ""
                if conversation_history and conversation_history[-1]['role'] == 'user':
                    last_user_msg_for_routing = conversation_history[-1]['content']

                model_id, reasoning, use_tools = MessageRouter.decide(
                    message=last_user_msg_for_routing,
                    qualification_step=qualification_step,
                    status=status,
                    temperature=temperature,
                    history_length=history_length,
                )
                routing_decision = "light" if model_id == "gpt-5-mini" else "heavy"
                logger.info(f"[Routing] {lead_id}: decision={routing_decision}, model={model_id}")
                asyncio.create_task(metrics.record_routing_decision(routing_decision))

                if not use_tools:
                    tools_list = []

                # 4. Configurar Agente Agno (Maria) com modelo roteado
                if model_id == "gpt-5-mini":
                    ai_model = OpenAIChat(
                        id="gpt-5-mini",
                        reasoning_effort=reasoning,
                        max_completion_tokens=512,
                        timeout=30,
                    )
                else:
                    ai_model = OpenAIResponses(
                        id="gpt-5.4",
                        reasoning_effort=reasoning,
                        max_output_tokens=2048,
                        store=False,
                        timeout=60,
                    )

                agent_maria = Agent(
                    model=ai_model,
                    description="Você é Maria, a assistente virtual do Palmas Lake Towers.",
                    instructions=system_prompt,
                    tools=tools_list,
                    markdown=True
                )

                # 4. Construir Prompt com Histórico (Rolling Summary + Mensagens Recentes)
                last_user_msg = "Olá"
                chat_context = ""

                if conversation_history:
                    if conversation_history[-1]['role'] == 'user':
                        last_user_msg = conversation_history[-1]['content']
                        prev_msgs = conversation_history[:-1]
                    else:
                        prev_msgs = conversation_history

                    for msg in prev_msgs:
                        role_display = "Cliente" if msg['role'] == 'user' else "Maria"
                        chat_context += f"{role_display}: {msg['content']}\n"

                # Fetch rolling summary from Redis (if available)
                summary_text = ""
                if lead_id and metrics._redis:
                    try:
                        raw = await metrics._redis.get(_K_SUMMARY.format(lead_id))
                        if raw:
                            summary_text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
                            logger.info(f"[Summary] Cache HIT for {lead_id} ({len(summary_text)} chars)")
                    except Exception as e:
                        logger.warning(f"[Summary] Redis read error (non-blocking): {e}")

                # Timestamp no FINAL do user message para maximizar prefix caching
                timestamp = datetime.now(pytz.timezone('America/Sao_Paulo')).strftime('%d/%m/%Y %H:%M')

                if chat_context:
                    if summary_text:
                        prompt_input = f"""[RESUMO DA CONVERSA ANTERIOR]
{summary_text}

[MENSAGENS RECENTES]
{chat_context}
Mensagem atual do Cliente [{timestamp}]:
{last_user_msg}
"""
                    else:
                        prompt_input = f"""Histórico da conversa:
{chat_context}

Mensagem atual do Cliente [{timestamp}]:
{last_user_msg}
"""
                else:
                    prompt_input = f"{last_user_msg}\n\n[{timestamp}]"

                # 4b. Semantic cache lookup (before calling the model)
                # Only for non-tool routes — tool calls produce side effects that can't be cached
                cache_hit = False
                if use_tools is False and last_user_msg and len(last_user_msg.strip()) > 3:
                    cached_answer = await semantic_cache.lookup(
                        last_user_msg, qualification_step, channel,
                    )
                    if cached_answer:
                        cache_hit = True
                        _meta = {
                            "model": "cache", "routing": "cache_hit",
                            "tokens_in": 0, "tokens_out": 0,
                            "cached_tokens": 0, "duration_ms": 0,
                        }
                        self._last_run_metadata = _meta
                        return cached_answer, _meta

                # 5. Executar Agente (em thread separada para não bloquear o event loop)
                logger.info(f"[Maria] Running Agno Agent with {model_id} for {lead_id}...")

                ai_start = time.perf_counter()
                try:
                    run_response = await asyncio.wait_for(
                        asyncio.to_thread(agent_maria.run, prompt_input),
                        timeout=90
                    )
                except Exception as api_err:
                    err_str = str(api_err)
                    if "parse the JSON body" in err_str or "BadRequestError" in type(api_err).__name__:
                        logger.warning(f"[Maria] Responses API failed for {lead_id}, retrying with OpenAIChat fallback: {err_str[:200]}")
                        fallback_model = OpenAIChat(
                            id="gpt-5.4",
                            reasoning_effort=reasoning,
                            max_completion_tokens=2048,
                            timeout=60,
                        )
                        agent_maria = Agent(
                            model=fallback_model,
                            description="Você é Maria, a assistente virtual do Palmas Lake Towers.",
                            instructions=system_prompt,
                            tools=tools_list,
                            markdown=True,
                        )
                        model_id = "gpt-5.4-chat-fallback"
                        run_response = await asyncio.wait_for(
                            asyncio.to_thread(agent_maria.run, prompt_input),
                            timeout=90
                        )
                    else:
                        raise
                ai_duration_ms = (time.perf_counter() - ai_start) * 1000

                content = run_response.content

                # Extract token usage from Agno Metrics dataclass (fire-and-forget)
                tokens_in = tokens_out = cached_tokens = 0
                if hasattr(run_response, 'metrics') and run_response.metrics:
                    usage = run_response.metrics
                    # Agno 2.3.x: Metrics is a dataclass with direct attributes, not a dict
                    tokens_in = getattr(usage, 'input_tokens', 0) or 0
                    tokens_out = getattr(usage, 'output_tokens', 0) or 0
                    cached_tokens = getattr(usage, 'cache_read_tokens', 0) or 0

                asyncio.create_task(metrics.record_ai_call(
                    model=model_id, duration_ms=ai_duration_ms,
                    tokens_in=tokens_in, tokens_out=tokens_out,
                    cached_tokens=cached_tokens, success=True,
                    lead_id=lead_id or "",
                ))

                # Build metadata dict (always, before any early return)
                _meta = {
                    "model": model_id, "routing": routing_decision,
                    "tokens_in": tokens_in, "tokens_out": tokens_out,
                    "cached_tokens": cached_tokens,
                    "duration_ms": round(ai_duration_ms, 2),
                }
                self._last_run_metadata = _meta
                logger.info(f"[Meta] {lead_id}: model={model_id}, routing={routing_decision}, tokens_in={tokens_in}, tokens_out={tokens_out}")

                # Track if agent sent messages directly via enviar_mensagem tool
                tool_sent = isinstance(maria_tools, MariaTools) and maria_tools._messages_sent_via_tool
                self._last_messages_sent_via_tool = tool_sent

                if tool_sent:
                    logger.info(f"[Maria] Messages already sent via enviar_mensagem tool for {lead_id}, buffer will skip re-send")
                    return content or "", _meta

                if not content or not content.strip():
                    # Agent made tool calls but didn't generate text — re-run WITH FULL CONTEXT
                    logger.info(f"[Maria] Agent returned empty content for {lead_id} (likely tool call), re-running with full context...")
                    followup_prompt = f"""{prompt_input}

[INSTRUÇÃO: Você acabou de executar uma ação/tool call com sucesso. Agora responda ao cliente de forma natural e breve, confirmando o que foi feito e continuando a conversa. NÃO se apresente novamente.]"""
                    followup_response = await asyncio.wait_for(
                        asyncio.to_thread(agent_maria.run, followup_prompt),
                        timeout=60
                    )
                    content = followup_response.content
                    if not content or not content.strip():
                        logger.warning(f"[Maria] WARNING: Agent still empty after re-run for {lead_id}, using fallback")
                        return "Estou aqui para te ajudar com o Palmas Lake Towers! O que gostaria de saber?", _meta

                # Output guardrail: bloquear respostas que parecem erros internos
                if content and _is_error_response(content):
                    logger.warning(f"[Guardrail] Blocked error response for {lead_id}: {content[:200]}")
                    return None, _meta

                # Cache store: save successful non-tool response for future cache hits
                if not tool_sent and content and content.strip():
                    asyncio.create_task(semantic_cache.store(
                        last_user_msg, content, qualification_step, channel,
                    ))

                return content, _meta

            except Exception as e:
                import traceback
                import sentry_sdk
                error_msg = f"Error generating AI response with Agno: {e}\n{traceback.format_exc()}"
                logger.error(error_msg)
                sentry_sdk.capture_exception(e)
                return None, {}

    async def process_message_buffer(self, lead_id: str, messages: List[tuple], pushname: str = "") -> str:
        """Processa um buffer de mensagens acumuladas"""
        
        import time
        start_time = time.time()
        logger.info(f"--- AI Processing Start: {datetime.now().strftime('%H:%M:%S')} for Lead: {lead_id} ---")

        from services.supabase_client import create_client
        supabase = create_client()

        # Consolida mensagens recebidas
        current_message_content = ""
        for content, msg_id in messages:
            current_message_content += f"[ID: {msg_id}] {content}\n"

        history = []
        lead_context_str = ""
        lead_data = None
        db_lead_id = None
        source = "whatsapp"
        current_step = "name"
        status = "novo"
        temperature = "frio"

        # ── SINGLE lead lookup (reused in context, name fallback, sentiment) ──
        try:
            lead_res = await asyncio.to_thread(_lookup_lead, supabase, lead_id, "*")

            if lead_res.data:
                lead_data = lead_res.data[0]
                db_lead_id = lead_data["id"]
                full_name = lead_data.get("full_name", "Desconhecido")
                status = lead_data.get("status", "novo")
                temperature = lead_data.get("temperature", "frio")
                source = lead_data.get("source", "whatsapp")
                qualification_state = lead_data.get("qualification_state", {})
                current_step = qualification_state.get("step", "name") if qualification_state else "name"

                # Use pushname from webhook as fallback if DB name is generic
                if pushname and (full_name.startswith("Lead ") or full_name == "Desconhecido"):
                    full_name = pushname.strip()
                    if current_step == "name":
                        current_step = "interest"

                # Build source-specific context
                source_info = ""
                if source == "instagram":
                    if full_name.startswith("Instagram ") and full_name[10:].isdigit():
                        full_name = "Visitante"
                        source_info = """
    <channel>Instagram DM</channel>
    <channel_rule>Este lead veio pelo Instagram. O nome real NAO foi obtido (perfil privado). NAO use o nome "Visitante" na conversa — cumprimente de forma generica ("Ola! Tudo bem?") sem usar nome. Pergunte o nome na proxima etapa.</channel_rule>"""
                    else:
                        source_info = """
    <channel>Instagram DM</channel>
    <channel_rule>Este lead veio pelo Instagram. O nome dele ja foi obtido automaticamente do perfil do Instagram. NAO pergunte o nome novamente. Comece pela proxima etapa da qualificacao (tipo de interesse).</channel_rule>"""
                elif not full_name.startswith("Lead ") and full_name != "Desconhecido":
                    source_info = f"""
    <channel>WhatsApp</channel>
    <channel_rule>O nome deste lead ({full_name}) foi obtido automaticamente do perfil do WhatsApp. NAO pergunte o nome novamente. Cumprimente pelo nome, se apresente como Maria consultora do Palmas Lake Towers, e comece pela proxima etapa da qualificacao (tipo de interesse).</channel_rule>"""
                else:
                    # WhatsApp lead without pushname — name is generic (Lead XXXXX)
                    source_info = """
    <channel>WhatsApp</channel>
    <channel_rule>O nome deste lead NAO foi obtido do perfil do WhatsApp (o campo mostra um ID generico). Voce DEVE perguntar o nome na sua PRIMEIRA resposta, mesmo que o lead faca outras perguntas. Responda a pergunta brevemente E pergunte o nome na mesma mensagem. Exemplo: "Bom dia! [resposta breve]. Sou a Maria, consultora do Palmas Lake Towers. Como posso te chamar?"</channel_rule>"""

                lead_context_str = f"""
<lead_context>
    <name>{full_name}</name>
    <status>{status}</status>
    <temperature>{temperature}</temperature>
    <source>{source}</source>
    <qualification_step>{current_step}</qualification_step>{source_info}
</lead_context>
"""

                # ── SINGLE conversations query ──
                conv_res = await asyncio.to_thread(
                    supabase.table("conversations").select("id").eq("lead_id", db_lead_id).execute
                )

                if conv_res.data:
                    all_conv_ids = [c["id"] for c in conv_res.data]
                    # ── SINGLE messages query — only last 15 (rolling summary covers older ones) ──
                    msgs_res = await asyncio.to_thread(
                        supabase.table("messages").select("content, sender_type, created_at").in_("conversation_id", all_conv_ids).order('created_at', direction="desc").limit(_RECENT_WINDOW).execute
                    )

                    if msgs_res.data:
                        # Anti-duplicate: check if last message is AI within 15s
                        last_msg = msgs_res.data[0]
                        if last_msg.get("sender_type") == "ai":
                            from datetime import timezone
                            created_at = datetime.fromisoformat(last_msg["created_at"].replace("Z", "+00:00"))
                            now = datetime.now(timezone.utc)
                            diff = (now - created_at).total_seconds()
                            if diff < 15:
                                logger.warning(f"⚠️ [Anti-Duplicate] Mensagem ignorada. IA respondeu há {diff:.1f}s.")
                                return "IGNORED_DUPLICATE"

                        # Build history (chronological order)
                        past_msgs = sorted(msgs_res.data, key=lambda x: x['created_at'])
                        for m in past_msgs:
                            role = "assistant" if m["sender_type"] == "ai" else "user"
                            history.append({"role": role, "content": m["content"]})

        except Exception as e:
            logger.error(f"Error fetching history: {e}")

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
        
        # 5. Gerar resposta com regras específicas do canal + roteamento dinâmico
        response_text, ai_meta = await self.generate_response(
            history, lead_id=lead_id, channel=channel,
            qualification_step=current_step, status=status,
            temperature=temperature, history_length=max(0, len(history) - 2),
        )
        messages_already_sent = self._last_messages_sent_via_tool

        # Store metadata for buffer_service to read (explicit copy, not shared state)
        self._last_run_metadata = ai_meta

        # Guard: ensure we always have a response to send (unless tool already sent)
        if not messages_already_sent and (not response_text or not response_text.strip()):
            logger.warning(f"[Maria] WARNING: generate_response returned empty for {lead_id}")
            response_text = "Estou aqui para te ajudar com o Palmas Lake Towers! O que gostaria de saber?"

        end_time = time.time()
        logger.info(f"--- AI Processing End (Duration: {end_time - start_time:.2f}s) ---")

        # 5a. Rolling Summary: trigger generation if conversation is long enough
        # Uses history_length (excludes system msg and current msg) to decide
        actual_history_len = max(0, len(history) - 2)  # subtract system + current user msg
        if lead_id and actual_history_len >= _SUMMARY_MSG_THRESHOLD:
            # Check if we should generate/refresh (every _SUMMARY_REFRESH_INTERVAL messages)
            should_summarize = (actual_history_len == _SUMMARY_MSG_THRESHOLD or
                                actual_history_len % _SUMMARY_REFRESH_INTERVAL == 0)
            if should_summarize:
                # Build conversation text from history (skip system message)
                conv_for_summary = "\n".join(
                    f"{'Cliente' if m['role'] == 'user' else 'Maria'}: {m['content']}"
                    for m in history if m['role'] in ('user', 'assistant')
                )
                asyncio.create_task(self._safe_generate_summary(lead_id, conv_for_summary))

        # 5b. Fallback: detect name from AI response if atualizar_nome tool wasn't called
        # Uses pre-loaded lead_data — no re-query needed
        try:
            if lead_data and db_lead_id:
                _fb_name = lead_data.get("full_name", "")
                if _fb_name.startswith("Lead ") or _fb_name == "Visitante":
                    _extracted = self._extract_name_from_response(response_text, current_message_content)
                    if _extracted:
                        logger.info(f"[Fallback] AI didn't call atualizar_nome. Extracting name: '{_extracted}'")
                        await asyncio.to_thread(
                            supabase.table("leads").update({"full_name": _extracted}).eq("id", db_lead_id).execute
                        )
                        logger.info(f"[Fallback] Name updated to '{_extracted}' for lead {db_lead_id}")
        except Exception as name_fallback_err:
            logger.error(f"[Fallback] Name extraction error (non-blocking): {name_fallback_err}")

        # 6. Análise de Sentimento (fire-and-forget — NÃO bloqueia entrega da resposta)
        try:
             lead_msgs = [m['content'] for m in history if m['role'] == 'user']
             msgs_text = "\n".join(lead_msgs[-5:])
             asyncio.create_task(self._safe_analyze_sentiment(lead_id, msgs_text, lead_data=lead_data))
        except Exception as sentiment_err:
             logger.error(f"Sentiment analysis scheduling error: {sentiment_err}")

        # If messages were already sent via enviar_mensagem tool, tell buffer_service to skip re-send
        if messages_already_sent:
            logger.info(f"[Maria] Returning __TOOL_SENT__ for {lead_id} — buffer will skip re-sending")
            return "__TOOL_SENT__"

        return response_text

    async def _safe_generate_summary(self, lead_id: str, conversation_text: str):
        """Fire-and-forget wrapper: generate rolling summary and store in Redis."""
        try:
            await self._generate_rolling_summary(lead_id, conversation_text)
        except Exception as e:
            logger.error(f"[Summary] Background error for {lead_id}: {e}")

    async def _generate_rolling_summary(self, lead_id: str, conversation_text: str):
        """Generate a rolling summary of the conversation using gpt-5-mini and store in Redis."""
        if not metrics._redis:
            logger.warning("[Summary] Redis not available, skipping summary generation")
            return

        logger.info(f"[Summary] Generating rolling summary for {lead_id}...")
        prompt = _SUMMARY_PROMPT.format(conversation=conversation_text[-3000:])  # cap input

        try:
            agent_summary = Agent(
                model=OpenAIChat(
                    id="gpt-5-mini",
                    reasoning_effort="low",
                    max_completion_tokens=300,
                    timeout=30,
                ),
                description="Você resume conversas de forma concisa.",
                markdown=False,
            )

            summary_start = time.perf_counter()
            response = await asyncio.wait_for(
                asyncio.to_thread(agent_summary.run, prompt),
                timeout=30,
            )
            summary_ms = (time.perf_counter() - summary_start) * 1000
            summary = response.content

            # Record gpt-5-mini token usage for monitoring
            s_in = s_out = s_cached = 0
            if hasattr(response, 'metrics') and response.metrics:
                s_in = getattr(response.metrics, 'input_tokens', 0) or 0
                s_out = getattr(response.metrics, 'output_tokens', 0) or 0
                s_cached = getattr(response.metrics, 'cache_read_tokens', 0) or 0
            asyncio.create_task(metrics.record_ai_call(
                model="gpt-5-mini", duration_ms=summary_ms,
                tokens_in=s_in, tokens_out=s_out,
                cached_tokens=s_cached, success=True, lead_id=lead_id,
            ))

            if summary and summary.strip():
                await metrics._redis.set(
                    _K_SUMMARY.format(lead_id),
                    summary.strip(),
                    ex=_SUMMARY_TTL,
                )
                logger.info(f"[Summary] Stored summary for {lead_id} ({len(summary)} chars, TTL={_SUMMARY_TTL}s)")
            else:
                logger.warning(f"[Summary] gpt-5-mini returned empty summary for {lead_id}")

        except asyncio.TimeoutError:
            logger.warning(f"[Summary] Timeout generating summary for {lead_id}")
        except Exception as e:
            logger.error(f"[Summary] Error generating summary for {lead_id}: {e}")

    async def _safe_analyze_sentiment(self, lead_id: str, msgs_text: str, lead_data: dict = None):
        """Wrapper seguro para análise de sentimento em background."""
        try:
            await self._analyze_and_update_sentiment(lead_id, msgs_text, lead_data=lead_data)
        except Exception as e:
            import traceback
            logger.error(f"[Sentiment] Background error for {lead_id}: {e}")
            traceback.print_exc()

    async def _analyze_and_update_sentiment(self, lead_id: str, messages_text: str, lead_data: dict = None):
        """Analisa sentimento usando Agent Agno com GPT-5-mini"""

        logger.info(f"[Sentiment] Starting analysis for {lead_id}")

        # Use pre-loaded lead_data if available, otherwise fetch (backward compat)
        lead_status = None
        if lead_data:
            lead_status = lead_data.get("status")
            logger.info(f"[Sentiment] Lead {lead_id} current status (cached): {lead_status}")
        else:
            try:
                from services.supabase_client import create_client
                supabase_status = create_client()
                lead_status_res = await asyncio.to_thread(_lookup_lead, supabase_status, lead_id, "status")
                if lead_status_res.data:
                    lead_status = lead_status_res.data[0].get("status")
                    logger.info(f"[Sentiment] Lead {lead_id} current status: {lead_status}")
            except Exception as e:
                logger.error(f"[Sentiment] Error fetching lead status: {e}")
        
        # Build status context for the prompt
        status_context = ""
        if lead_status:
            status_context = f"\nSTATUS ATUAL DO LEAD: {lead_status}\n"

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

        # User message contém APENAS dados variáveis (instruções estáticas ficam no system message)
        prompt = f"""{scheduled_lead_rule}
CONTEXTO DO LEAD: {lead_id}
{status_context}
CONVERSA RECENTE:
{messages_text}

Responda APENAS o JSON válido, sem texto adicional."""

        try:
            # Agente de Análise com instruções estáticas cacheáveis no system message
            agent_sentiment = Agent(
                model=OpenAIChat(
                    id="gpt-5-mini",
                    reasoning_effort=self.reasoning_effort_analysis,
                    max_completion_tokens=1000,
                    timeout=30,
                    extra_body={
                        "prompt_cache_retention": "24h",
                        "prompt_cache_key": "sentiment-analysis",
                    }
                ),
                description="Você é um analisador de dados imobiliários.",
                instructions=_SENTIMENT_INSTRUCTIONS,
                markdown=True
            )
            
            logger.info(f"[Sentiment] Running Agno Agent (GPT-5-mini)...")
            sentiment_start = time.perf_counter()
            response = await asyncio.wait_for(
                asyncio.to_thread(agent_sentiment.run, prompt),
                timeout=45
            )
            sentiment_ms = (time.perf_counter() - sentiment_start) * 1000
            content = response.content

            # Record gpt-5-mini token usage for monitoring
            st_in = st_out = st_cached = 0
            if hasattr(response, 'metrics') and response.metrics:
                st_in = getattr(response.metrics, 'input_tokens', 0) or 0
                st_out = getattr(response.metrics, 'output_tokens', 0) or 0
                st_cached = getattr(response.metrics, 'cache_read_tokens', 0) or 0
            asyncio.create_task(metrics.record_ai_call(
                model="gpt-5-mini", duration_ms=sentiment_ms,
                tokens_in=st_in, tokens_out=st_out,
                cached_tokens=st_cached, success=True, lead_id=lead_id,
            ))

            # Guard against empty/None response from model
            if not content or not content.strip():
                logger.warning(f"[Sentiment] GPT-5-mini returned empty response, skipping analysis for {lead_id}")
                return

            # Limpeza de JSON
            content = content.replace("```json", "").replace("```", "").strip()
            # Tentar extrair apenas o objeto JSON se houver texto em volta
            import re
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                content = json_match.group(0)
            else:
                logger.warning(f"[Sentiment] No JSON object found in response: {content[:200]}")
                return

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
                logger.info(f"[Sentiment] Override for scheduled lead {lead_id}: score={sentiment_data['sentiment_score']}, label=Positivo, temp=quente")
            
            logger.info(f"[Sentiment] Lead {lead_id}: score={sentiment_data.get('sentiment_score')}, label={sentiment_data.get('sentiment_label')}")
            
            from services.supabase_client import create_client
            supabase = create_client()

            # Use pre-loaded lead_data if available, otherwise fetch
            if lead_data:
                db_lead_id = lead_data["id"]
                last_interaction_str = lead_data.get("last_interaction")
            else:
                lead_res = await asyncio.to_thread(_lookup_lead, supabase, lead_id, "id, last_interaction")
                if not lead_res.data:
                    logger.warning(f"[Sentiment] Lead {lead_id} not found in DB.")
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
                    logger.error(f"[Sentiment] Error parsing last_interaction: {e}")

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
                    "em atendimento": "novo_lead",
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
                # Block protected statuses from sentiment — only tools or seller actions can set these
                protected_statuses = ("qualificado", "transferido", "visita_agendada", "visit_scheduled", "visita_realizada", "proposta_enviada")
                if mapped_status and mapped_status in protected_statuses:
                    logger.warning(f"[Sentiment] BLOCKED: status '{mapped_status}' can only be set by tools or seller actions, not sentiment analysis")
                elif mapped_status:
                    update_payload["status"] = mapped_status
                else:
                    logger.warning(f"[Sentiment] Unknown status from AI: '{sentiment_data['status']}', skipping status update")
            
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
            
            # Auto-qualify removido: a IA agora só muda status via transferir_para_humano (→ transferido)
            # O interest_type continua sendo salvo pelo sentiment, mas sem mudança de status

            # Save full analysis for reference
            update_payload["last_analysis"] = sentiment_data

            # Final safety check: re-read current status and NEVER downgrade from protected statuses
            try:
                current_lead = await asyncio.to_thread(
                    supabase.table("leads").select("status").eq("id", db_lead_id).execute
                )
                current_status = (current_lead.data[0].get("status", "") if current_lead.data else "").lower()
                protected_final = ("visita_agendada", "visita_realizada", "proposta_enviada", "transferido", "sold")
                if current_status in protected_final:
                    update_payload["sentiment_label"] = "Positivo"
                    if update_payload.get("sentiment_score", 0) < 70:
                        update_payload["sentiment_score"] = 70
                    # NEVER downgrade from protected status via sentiment analysis
                    if "status" in update_payload and update_payload["status"] != current_status:
                        logger.warning(f"[Sentiment] BLOCKED downgrade: '{current_status}' → '{update_payload['status']}', keeping protected status")
                        del update_payload["status"]
                    logger.info(f"[Sentiment] Final override: status={current_status} → sentiment forced to Positivo, status protected")
            except Exception as e:
                logger.error(f"[Sentiment] Final safety check error (non-blocking): {e}")
            
            logger.info(f"[Sentiment] Updating lead {db_lead_id} with payload: {json.dumps(update_payload, default=str)}")
            result = await asyncio.to_thread(
                supabase.table("leads").update(update_payload).eq("id", db_lead_id).execute
            )
            logger.info(f"[Sentiment] Update result: {result.data}")
            
        except Exception as e:
            import traceback
            logger.error(f"[Sentiment] Error: {e}")
            traceback.print_exc()
