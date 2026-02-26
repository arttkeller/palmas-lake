"""
Follow-up Suggestion Service

Gera sugestoes de mensagem de follow-up personalizadas usando IA,
baseadas no historico da conversa com o lead.
"""

import os
from typing import Optional, List, Dict
from openai import OpenAI
from services.supabase_client import create_client


FOLLOW_UP_PROMPT = """Você é assistente de um vendedor imobiliário do Palmas Lake Residence em Palmas-TO.

Baseado no histórico da conversa abaixo, sugira UMA mensagem curta e natural de follow-up para o vendedor enviar ao cliente.

Regras:
- Seja breve (1-3 frases)
- Tom amigável e profissional
- Referencie algo específico da conversa (interesse mencionado, dúvida, etc)
- NÃO invente informações que não estão na conversa
- NÃO use emojis em excesso (máximo 1)
- A mensagem deve parecer escrita pelo vendedor, não por um robô

Nome do lead: {lead_name}
Stage do follow-up: {stage} ({stage_label})

Histórico da conversa:
{conversation_history}

Responda APENAS com a mensagem sugerida, sem explicações."""


def generate_follow_up_suggestion(
    lead_id: str,
    lead_name: str,
    stage: int,
    stage_label: str
) -> Optional[str]:
    """
    Gera uma sugestão de follow-up personalizada usando IA.

    Args:
        lead_id: UUID do lead
        lead_name: Nome do lead
        stage: Stage do follow-up (1, 2, ou 3)
        stage_label: Label do stage ("2h após inatividade", etc)

    Returns:
        Mensagem sugerida ou None se falhar
    """
    try:
        supabase = create_client()

        # Buscar ultimas 20 mensagens da conversa
        conv_res = supabase.table("conversations").select("id").eq(
            "lead_id", lead_id
        ).execute()

        if not conv_res.data:
            return _fallback_suggestion(lead_name, stage)

        conv_ids = [c["id"] for c in conv_res.data]

        messages = []
        for conv_id in conv_ids:
            msg_res = supabase.table("messages").select(
                "content, sender_type, created_at"
            ).eq("conversation_id", conv_id).order(
                "created_at", direction="desc"
            ).limit(20).execute()

            if msg_res.data:
                messages.extend(msg_res.data)

        if not messages:
            return _fallback_suggestion(lead_name, stage)

        # Ordenar por data e formatar
        messages.sort(key=lambda m: m.get("created_at", ""))
        history_lines = []
        for msg in messages[-20:]:
            sender = "Lead" if msg["sender_type"] == "lead" else "IA"
            content = (msg.get("content") or "")[:200]
            history_lines.append(f"{sender}: {content}")

        conversation_history = "\n".join(history_lines)

        # Chamar IA
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": FOLLOW_UP_PROMPT.format(
                    lead_name=lead_name or "Cliente",
                    stage=stage,
                    stage_label=stage_label,
                    conversation_history=conversation_history
                )
            }],
            max_tokens=200,
            temperature=0.7
        )

        suggestion = response.choices[0].message.content.strip()
        print(f"[FollowUpSuggestion] Sugestão gerada para {lead_name}: {suggestion[:50]}...")
        return suggestion

    except Exception as e:
        print(f"[FollowUpSuggestion] Erro ao gerar sugestão: {e}")
        return _fallback_suggestion(lead_name, stage)


def _fallback_suggestion(lead_name: str, stage: int) -> str:
    """Fallback caso a IA falhe — retorna template simples."""
    name_part = f" {lead_name.split()[0]}" if lead_name else ""
    templates = {
        1: f"Oi{name_part}, tudo bem? Vi que conversamos recentemente sobre o Palmas Lake. Posso te ajudar com mais alguma informação?",
        2: f"Olá{name_part}! Passando para saber se ainda tem interesse no Palmas Lake. Temos novidades que podem te interessar!",
        3: f"Oi{name_part}, espero não estar incomodando. Caso ainda tenha interesse no Palmas Lake, estou à disposição para te atender."
    }
    return templates.get(stage, templates[1])
