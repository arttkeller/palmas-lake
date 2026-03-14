"""
Dynamic model routing for Maria AI agent.
Routes messages to appropriate models based on conversation state.
Zero I/O — uses data already fetched from Supabase.

Routing strategy
----------------
Three-tier routing: HEAVY for complex reasoning (price, broker, objections),
MEDIUM for standard qualification with tools (gpt-5-mini + tools), and
LIGHT for pure acknowledgments (no tools needed). HEAVY rules are evaluated
first so they can never be masked by lighter rules.

Route constants
---------------
LIGHT  → gpt-5-mini  / low effort  / no tools
MEDIUM → gpt-5-mini  / medium effort / tools enabled
HEAVY  → gpt-5.4     / medium effort / tools enabled
"""


class MessageRouter:
    """Contextual state-machine router for AI model selection."""

    # Route tuples: (model_id, reasoning_effort, use_tools)
    LIGHT = ("gpt-5-mini", "low", False)
    MEDIUM = ("gpt-5-mini", "medium", True)
    HEAVY = ("gpt-5.4", "medium", True)

    GREETING_PATTERNS = frozenset({
        "oi", "olá", "ola", "bom dia", "boa tarde", "boa noite",
        "hello", "hi", "hey", "e aí", "e ai", "fala", "salve",
        "opa", "eae", "oie", "oii", "oiii",
    })

    PRICE_SIGNALS = frozenset({
        "valor", "preço", "preco", "quanto", "custo",
        "financiamento", "parcela", "entrada", "tabela",
        "condições", "condicoes", "pagamento",
    })

    BROKER_SIGNALS = frozenset({
        "corretor", "imobiliária", "imobiliaria", "revender",
        "parceria", "comissão", "comissao", "captação", "captacao",
    })

    ACK_PATTERNS = frozenset({
        "ok", "sim", "não", "nao", "entendi", "entendido",
        "obrigado", "obrigada", "valeu", "beleza", "blz",
        "tá bom", "ta bom", "certo", "perfeito", "show",
        "legal", "massa", "top", "pode ser",
    })

    @staticmethod
    def decide(
        message: str,
        qualification_step: str,
        status: str,
        temperature: str,
        history_length: int,
    ) -> tuple:
        """
        Decide which model to route to.

        Returns:
            Tuple of (model_id: str, reasoning_effort: str, use_tools: bool).
        """
        msg_lower = message.strip().lower()

        # ── LIGHT rules (no tools needed) ─────────────────────────────

        # Rule 1: Lead already transferred/closed → light
        if status in ("transferido", "sold", "lost"):
            return MessageRouter.LIGHT

        # Rule 2: Pure acknowledgment → light
        if len(msg_lower) < 20 and any(
            msg_lower == ack or msg_lower.startswith(ack + " ") or msg_lower.startswith(ack + ",")
            for ack in MessageRouter.ACK_PATTERNS
        ):
            return MessageRouter.LIGHT

        # ── HEAVY rules (need GPT-5.4 reasoning) ─────────────────────

        # Rule 3: Broker/realtor signals → heavy
        if any(w in msg_lower for w in MessageRouter.BROKER_SIGNALS):
            return MessageRouter.HEAVY

        # Rule 4: Price signals → heavy (transfer decision)
        if any(w in msg_lower for w in MessageRouter.PRICE_SIGNALS):
            return MessageRouter.HEAVY

        # Rule 5: Hot lead → heavy (transfer may be needed)
        if temperature == "quente":
            return MessageRouter.HEAVY

        # Rule 6: First message ever → heavy (first impression matters)
        if history_length == 0:
            return MessageRouter.HEAVY

        # ── MEDIUM rules (gpt-5-mini with tools) ─────────────────────

        # Everything else: qualification, FAQ, greetings, images, general chat
        # GPT-5-mini handles these well with tools enabled
        return MessageRouter.MEDIUM
