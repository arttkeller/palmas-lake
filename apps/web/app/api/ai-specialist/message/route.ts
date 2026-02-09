/**
 * AI Specialist Message API Route
 * 
 * Handles messages sent to AI specialists with context-aware responses.
 * Connects to the Python backend for AI processing.
 */

import { NextRequest, NextResponse } from 'next/server';

// Types
interface AIMessageContext {
  section: string;
  contextType: 'crm' | 'chat' | 'leads' | 'agendamentos' | 'analytics';
  path: string;
  metadata?: Record<string, unknown>;
}

interface AIMessageRequest {
  message: string;
  context: AIMessageContext;
}

// Backend API URL - falls back to NEXT_PUBLIC_API_URL (used by rest of app)
const BACKEND_API_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * POST /api/ai-specialist/message
 * 
 * Sends a message to the AI specialist and returns the response.
 */
export async function POST(request: NextRequest) {
  try {
    const body: AIMessageRequest = await request.json();
    
    // Validate request
    if (!body.message || body.message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    
    if (!body.context || !body.context.contextType) {
      return NextResponse.json(
        { error: 'Context is required' },
        { status: 400 }
      );
    }
    
    // Route to backend endpoint - all context types use the same /message endpoint
    const backendEndpoint = `${BACKEND_API_URL}/api/ai-specialist/message`;
    
    console.log(`[AI Specialist] Routing to: ${backendEndpoint}`);
    console.log(`[AI Specialist] Message: ${body.message.substring(0, 100)}...`);
    console.log(`[AI Specialist] Context: ${JSON.stringify(body.context)}`);
    
    // Call backend API
    const backendResponse = await fetch(backendEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: body.message,
        context: body.context,
      }),
    });
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error(`[AI Specialist] Backend error: ${backendResponse.status} - ${errorText}`);
      
      // If backend is not available, return a helpful message
      if (backendResponse.status === 404) {
        return NextResponse.json({
          id: `msg_${Date.now()}`,
          content: getContextualFallbackMessage(body.context.contextType, body.message),
          timestamp: new Date().toISOString(),
          success: true,
          fallback: true,
        });
      }
      
      return NextResponse.json(
        { error: `Backend error: ${backendResponse.status}` },
        { status: backendResponse.status }
      );
    }
    
    const data = await backendResponse.json();
    
    return NextResponse.json({
      id: data.id || `msg_${Date.now()}`,
      content: data.content || data.response || '',
      timestamp: data.timestamp || new Date().toISOString(),
      success: true,
    });
    
  } catch (error) {
    console.error('[AI Specialist] Error:', error);
    
    // Return fallback response if backend is unavailable
    return NextResponse.json({
      id: `msg_${Date.now()}`,
      content: 'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes.',
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Returns a contextual fallback message based on the context type
 */
function getContextualFallbackMessage(contextType: string, userMessage: string): string {
  const fallbackMessages: Record<string, string> = {
    crm: `Entendi sua pergunta sobre o CRM: "${userMessage.substring(0, 50)}..."\n\nNo momento, estou processando sua solicitação. Enquanto isso, você pode:\n• Verificar a lista de leads no Kanban\n• Consultar as conversas recentes\n• Acessar os agendamentos`,
    chat: `Sobre as conversas: "${userMessage.substring(0, 50)}..."\n\nPosso ajudar você a:\n• Encontrar conversas específicas\n• Filtrar por status ou data\n• Ver histórico de mensagens`,
    leads: `Sobre os leads: "${userMessage.substring(0, 50)}..."\n\nPosso ajudar você a:\n• Listar leads por status\n• Filtrar por temperatura\n• Ver detalhes de um lead específico`,
    agendamentos: `Sobre os agendamentos: "${userMessage.substring(0, 50)}..."\n\nPosso ajudar você a:\n• Ver próximos agendamentos\n• Filtrar por período\n• Verificar disponibilidade`,
    analytics: `Sobre as análises: "${userMessage.substring(0, 50)}..."\n\nPosso ajudar você a:\n• Ver métricas de conversão\n• Analisar performance\n• Gerar relatórios`,
  };
  
  return fallbackMessages[contextType] || `Recebi sua mensagem: "${userMessage.substring(0, 50)}..."\n\nEstou processando sua solicitação.`;
}
