"""
AI Specialist Router - API para processamento de mensagens do AI Specialist.

Este router expõe endpoints para o Message Dock enviar perguntas e receber
respostas contextualizadas do AI Specialist.

**Feature: ai-specialist-agendamentos**
"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api/ai-specialist", tags=["AI Specialist"])

# Timeout configuration (in seconds)
AI_PROCESSING_TIMEOUT = 5


# =============================================================================
# Custom Exceptions
# =============================================================================

class AISpecialistTimeoutError(Exception):
    """Raised when AI processing exceeds the timeout limit."""
    pass


class AISpecialistDatabaseError(Exception):
    """Raised when there's an error querying the database."""
    pass


# =============================================================================
# Error Messages (Portuguese)
# =============================================================================

ERROR_MESSAGES = {
    'empty_message': 'A mensagem não pode estar vazia',
    'invalid_context_type': 'Tipo de contexto inválido',
    'database_error': 'Erro ao consultar agendamentos. Tente novamente.',
    'timeout_error': 'Tempo limite excedido. Tente uma pergunta mais simples.',
    'generic_error': 'Erro ao processar sua pergunta. Tente novamente.',
    'ai_error': 'Não foi possível gerar uma resposta. Tente novamente em alguns instantes.',
}


# =============================================================================
# Pydantic Models
# =============================================================================

# Valid context types for the AI Specialist
VALID_CONTEXT_TYPES = {'crm', 'chat', 'leads', 'agendamentos', 'analytics'}


class MessageContext(BaseModel):
    """
    Contexto da mensagem enviada pelo Message Dock.
    
    Attributes:
        section: Nome da seção atual (ex: "Agendamentos")
        contextType: Tipo de contexto para processamento
        path: Path atual da aplicação
        metadata: Dados adicionais opcionais
    """
    section: str
    contextType: Literal['crm', 'chat', 'leads', 'agendamentos', 'analytics']
    path: str
    metadata: Optional[dict] = None


class MessageRequest(BaseModel):
    """
    Requisição de mensagem para o AI Specialist.
    
    Attributes:
        message: Pergunta do usuário (não pode ser vazia)
        context: Contexto da mensagem
        
    **Validates: Requirements 2.1, 2.2, 2.3**
    """
    message: str
    context: MessageContext
    
    @field_validator('message')
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        """
        Valida que a mensagem não está vazia ou contém apenas espaços.
        
        **Validates: Requirements 2.2**
        """
        if not v or not v.strip():
            raise ValueError('A mensagem não pode estar vazia')
        return v.strip()


class MessageResponse(BaseModel):
    """
    Resposta do AI Specialist.
    
    Attributes:
        id: ID único da resposta
        content: Conteúdo da resposta
        timestamp: Data/hora da resposta
        success: Se a operação foi bem sucedida
        error: Mensagem de erro (se houver)
        
    **Validates: Requirements 2.4**
    """
    id: str
    content: str
    timestamp: datetime
    success: bool
    error: Optional[str] = None


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/message", response_model=MessageResponse)
async def process_message(request: MessageRequest) -> MessageResponse:
    """
    Processa uma mensagem do AI Specialist.
    
    Recebe uma pergunta do usuário através do Message Dock e retorna
    uma resposta contextualizada baseada no tipo de contexto.
    
    Args:
        request: Requisição contendo mensagem e contexto
        
    Returns:
        MessageResponse com a resposta da IA
        
    Raises:
        HTTPException: Se houver erro no processamento
        
    **Validates: Requirements 1.1, 1.5, 2.1, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5**
    """
    response_id = str(uuid.uuid4())
    
    try:
        # Import service here to avoid circular imports
        from services.ai_specialist_service import AISpecialistService
        
        service = AISpecialistService()
        
        # Process based on context type with timeout
        context_type = request.context.contextType
        
        try:
            # Apply timeout to AI processing
            if context_type == 'agendamentos':
                response_content = await asyncio.wait_for(
                    service.process_agendamentos_query(request.message),
                    timeout=AI_PROCESSING_TIMEOUT
                )
            elif context_type == 'crm':
                response_content = await asyncio.wait_for(
                    service.process_crm_query(request.message),
                    timeout=AI_PROCESSING_TIMEOUT
                )
            elif context_type == 'leads':
                response_content = await asyncio.wait_for(
                    service.process_leads_query(request.message),
                    timeout=AI_PROCESSING_TIMEOUT
                )
            elif context_type == 'chat':
                response_content = await asyncio.wait_for(
                    service.process_chat_query(request.message),
                    timeout=AI_PROCESSING_TIMEOUT
                )
            elif context_type == 'analytics':
                response_content = await asyncio.wait_for(
                    service.process_analytics_query(request.message),
                    timeout=AI_PROCESSING_TIMEOUT
                )
            else:
                response_content = (
                    f"O AI Specialist para '{context_type}' "
                    "ainda não está implementado."
                )
        except asyncio.TimeoutError:
            # Timeout exceeded - return friendly error
            # **Validates: Requirements 1.1, 4.5**
            print(f"[AISpecialist] Timeout processing message: {request.message[:50]}...")
            return MessageResponse(
                id=response_id,
                content="",
                timestamp=datetime.now(timezone.utc),
                success=False,
                error=ERROR_MESSAGES['timeout_error']
            )
        
        # Check if response indicates an error from the service
        if not response_content or response_content.startswith("Desculpe"):
            return MessageResponse(
                id=response_id,
                content=response_content or "",
                timestamp=datetime.now(timezone.utc),
                success=False,
                error=ERROR_MESSAGES['ai_error'] if not response_content else None
            )
        
        return MessageResponse(
            id=response_id,
            content=response_content,
            timestamp=datetime.now(timezone.utc),
            success=True
        )
        
    except ValueError as e:
        # Validation errors - return 400
        # **Validates: Requirements 1.5**
        raise HTTPException(status_code=400, detail=str(e))
    
    except AISpecialistDatabaseError as e:
        # Database errors - return error response
        # **Validates: Requirements 1.5, 4.3**
        print(f"[AISpecialist] Database error: {e}")
        return MessageResponse(
            id=response_id,
            content="",
            timestamp=datetime.now(timezone.utc),
            success=False,
            error=ERROR_MESSAGES['database_error']
        )
    
    except AISpecialistTimeoutError:
        # Timeout errors - return error response
        # **Validates: Requirements 1.1, 4.5**
        return MessageResponse(
            id=response_id,
            content="",
            timestamp=datetime.now(timezone.utc),
            success=False,
            error=ERROR_MESSAGES['timeout_error']
        )
    
    except Exception as e:
        # Generic errors - log and return friendly message
        # **Validates: Requirements 1.5, 4.5**
        print(f"[AISpecialist] Error processing message: {e}")
        
        return MessageResponse(
            id=response_id,
            content="",
            timestamp=datetime.now(timezone.utc),
            success=False,
            error=ERROR_MESSAGES['generic_error']
        )


# =============================================================================
# Validation Helper Functions (for testing)
# =============================================================================

def validate_message(message: str) -> bool:
    """
    Valida se uma mensagem é válida (não vazia).
    
    Args:
        message: Mensagem a validar
        
    Returns:
        True se válida, False caso contrário
        
    **Validates: Requirements 2.2**
    """
    return bool(message and message.strip())


def validate_context_type(context_type: str) -> bool:
    """
    Valida se um tipo de contexto é válido.
    
    Args:
        context_type: Tipo de contexto a validar
        
    Returns:
        True se válido, False caso contrário
        
    **Validates: Requirements 2.3**
    """
    return context_type in VALID_CONTEXT_TYPES


def create_error_response(error_key: str, response_id: str = None) -> MessageResponse:
    """
    Cria uma resposta de erro padronizada.
    
    Args:
        error_key: Chave do erro em ERROR_MESSAGES
        response_id: ID da resposta (opcional, gera novo se não fornecido)
        
    Returns:
        MessageResponse com erro
        
    **Validates: Requirements 1.5, 4.5**
    """
    return MessageResponse(
        id=response_id or str(uuid.uuid4()),
        content="",
        timestamp=datetime.now(timezone.utc),
        success=False,
        error=ERROR_MESSAGES.get(error_key, ERROR_MESSAGES['generic_error'])
    )


def format_error_message_pt_br(error_type: str) -> str:
    """
    Retorna mensagem de erro formatada em português.
    
    Args:
        error_type: Tipo do erro
        
    Returns:
        Mensagem de erro em português
        
    **Validates: Requirements 4.5**
    """
    return ERROR_MESSAGES.get(error_type, ERROR_MESSAGES['generic_error'])
