"""
Dynamic model routing for Maria AI agent.
Routes messages to appropriate models based on conversation state.
Zero I/O — uses data already fetched from Supabase.

Routing strategy
----------------
A deterministic state-machine that evaluates ordered rules against the
current message and lead context. Rules that force the heavy model are
evaluated first (broker signals, price signals, questions, hot leads),
so they can never be masked by a later light rule. When no rule fires,
the router defaults to the heavy model — "never downgrade when uncertain".

Route constants
---------------
LIGHT  → gpt-5-mini  / low effort  / no tools
HEAVY  → gpt-5.4     / med effort  / tools enabled
"""


class MessageRouter:
    """Contextual state-machine router for AI model selection."""

    # Route tuples: (model_id, reasoning_effort, use_tools)
    LIGHT = ("gpt-5-mini", "low", False)
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

        Args:
            message: The current user message text.
            qualification_step: Current step in qualification flow
                (e.g. "name", "interest", "budget").
            status: Lead status in CRM (e.g. "novo_lead", "transferido").
            temperature: Lead temperature ("quente", "morno", "frio").
            history_length: Number of previous messages in conversation.

        Returns:
            Tuple of (model_id: str, reasoning_effort: str, use_tools: bool).
            Use MessageRouter.LIGHT or MessageRouter.HEAVY as reference values.
        """
        msg_lower = message.strip().lower()
        words = msg_lower.split()

        # Rule 1: Lead already transferred/closed → light (no tools needed)
        if status in ("transferido", "sold", "lost"):
            return MessageRouter.LIGHT

        # Rule 2: Broker/realtor signals → heavy (needs registrar_corretor_parceiro tool)
        if any(w in msg_lower for w in MessageRouter.BROKER_SIGNALS):
            return MessageRouter.HEAVY

        # Rule 3: Price signals → heavy (transfer is imminent)
        if any(w in msg_lower for w in MessageRouter.PRICE_SIGNALS):
            return MessageRouter.HEAVY

        # Rule 4: Question mark → heavy (needs reasoning to answer)
        if "?" in msg_lower:
            return MessageRouter.HEAVY

        # Rule 5: Hot lead → heavy (transfer decision may be needed)
        if temperature == "quente":
            return MessageRouter.HEAVY

        # Rule 6: First message ever → heavy (first impression matters)
        if history_length == 0:
            return MessageRouter.HEAVY

        # Rule 7: Name step + short answer without question → light
        if qualification_step == "name" and len(words) <= 4 and "?" not in msg_lower:
            return MessageRouter.LIGHT

        # Rule 8: Pure greeting → light
        if len(msg_lower) < 25 and any(
            g == msg_lower or msg_lower.startswith(g + " ") or msg_lower.startswith(g + ",")
            for g in MessageRouter.GREETING_PATTERNS
        ):
            return MessageRouter.LIGHT

        # Rule 9: Cold lead, short message, no question → light
        if temperature == "frio" and len(msg_lower) < 30 and "?" not in msg_lower:
            return MessageRouter.LIGHT

        # Default: heavy (safe — never downgrade when uncertain)
        return MessageRouter.HEAVY
