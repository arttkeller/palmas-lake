"""
Follow-up Message Templates

Provides varied message templates for each follow-up stage.

Stages:
- Stage 1 (2h): Gentle reminder
- Stage 2 (24h após Stage 1): Different approach
- Stage 3 (48h após Stage 2): Final follow-up
"""

import random
from typing import Optional


# Stage 1 templates - Gentle reminder (2 hours)
STAGE_1_TEMPLATES = [
    "Oi{name_part}! 😊 Vi que você estava interessado no Palmas Lake. Posso te ajudar com mais alguma informação?",
    "Olá{name_part}! Tudo bem? Estou aqui caso tenha alguma dúvida sobre o empreendimento. 🏠",
    "Ei{name_part}! 👋 Só passando para ver se posso te ajudar com algo mais sobre o Palmas Lake.",
    "Oi{name_part}! Ficou alguma dúvida sobre o que conversamos? Estou à disposição! 😊",
    "Olá{name_part}! Vi que você demonstrou interesse. Quer que eu te envie mais detalhes? 🏡",
]

# Stage 2 templates - Different approach (24 hours)
STAGE_2_TEMPLATES = [
    "Oi{name_part}! 🌟 Temos algumas novidades sobre o Palmas Lake que podem te interessar. Quer saber mais?",
    "Olá{name_part}! Passando para lembrar que temos condições especiais de financiamento. Posso te explicar? 💰",
    "Ei{name_part}! 📸 Que tal agendar uma visita para conhecer o empreendimento pessoalmente? Tenho horários disponíveis!",
    "Oi{name_part}! Sei que a decisão de um imóvel é importante. Posso te ajudar a esclarecer alguma dúvida? 🤔",
    "Olá{name_part}! Temos unidades com vista privilegiada ainda disponíveis. Gostaria de saber mais? 🏞️",
]

# Stage 3 templates - Final follow-up (48 hours after Stage 2)
STAGE_3_TEMPLATES = [
    "Oi{name_part}! 👋 Não quero ser inconveniente, mas gostaria de saber se ainda tem interesse no Palmas Lake. Se preferir, é só me avisar que não entro mais em contato.",
    "Olá{name_part}! Esta é minha última mensagem sobre o empreendimento. Se mudar de ideia, estarei aqui! 😊",
    "Ei{name_part}! Entendo que pode estar ocupado. Vou deixar meu contato disponível caso queira retomar a conversa no futuro. Até mais! 🙋",
    "Oi{name_part}! Só queria deixar registrado que estou à disposição quando precisar. Qualquer dúvida sobre imóveis, pode contar comigo! 🏠",
    "Olá{name_part}! Vou encerrar nosso atendimento por aqui, mas fico feliz em ajudar quando quiser. Até breve! ✨",
]


def get_follow_up_message(stage: int, name: Optional[str] = None) -> str:
    """
    Returns a follow-up message for the given stage.
    
    Args:
        stage: Follow-up stage (1, 2, or 3)
        name: Lead's first name (optional)
    
    Returns:
        Formatted follow-up message
    
    Requirements: 6.4
    """
    # Format name part
    name_part = f" {name}" if name and name.strip() else ""
    
    # Select template based on stage
    if stage == 1:
        templates = STAGE_1_TEMPLATES
    elif stage == 2:
        templates = STAGE_2_TEMPLATES
    else:
        templates = STAGE_3_TEMPLATES
    
    # Pick a random template for variety (Requirements 6.4)
    template = random.choice(templates)
    
    return template.format(name_part=name_part)


def get_all_templates_for_stage(stage: int) -> list:
    """
    Returns all templates for a given stage.
    Useful for testing.
    
    Args:
        stage: Follow-up stage (1, 2, or 3)
    
    Returns:
        List of template strings
    """
    if stage == 1:
        return STAGE_1_TEMPLATES.copy()
    elif stage == 2:
        return STAGE_2_TEMPLATES.copy()
    else:
        return STAGE_3_TEMPLATES.copy()
