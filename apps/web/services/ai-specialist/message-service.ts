/**
 * AI Specialist Message Service
 * 
 * Handles sending messages to AI specialists with context.
 * 
 * Requirements: 1.6
 */

import type { AIContextType, AISpecialistConfig } from '@/lib/ai-specialist-config';

/**
 * AI Message interface
 */
export interface AIMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  context: AIMessageContext;
}

/**
 * AI Message Context interface
 */
export interface AIMessageContext {
  section: string;
  contextType: AIContextType;
  path: string;
  metadata?: Record<string, unknown>;
}

/**
 * AI Message Request interface
 */
export interface AIMessageRequest {
  message: string;
  context: AIMessageContext;
}

/**
 * AI Message Response interface
 */
export interface AIMessageResponse {
  id: string;
  content: string;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Creates a message context from AI specialist config and current path
 * 
 * Requirements: 1.6
 */
export function createMessageContext(
  config: AISpecialistConfig,
  currentPath: string,
  metadata?: Record<string, unknown>
): AIMessageContext {
  return {
    section: config.section,
    contextType: config.contextType,
    path: currentPath,
    metadata,
  };
}

/**
 * Creates a message request with context
 * 
 * Requirements: 1.6
 */
export function createMessageRequest(
  message: string,
  context: AIMessageContext
): AIMessageRequest {
  return {
    message,
    context,
  };
}

/**
 * Validates that a message request has proper context
 * 
 * Requirements: 1.6
 */
export function validateMessageRequest(request: AIMessageRequest): boolean {
  // Message must not be empty
  if (!request.message || request.message.trim().length === 0) {
    return false;
  }
  
  // Context must have required fields
  if (!request.context) {
    return false;
  }
  
  if (!request.context.section || request.context.section.trim().length === 0) {
    return false;
  }
  
  if (!request.context.contextType) {
    return false;
  }
  
  if (!request.context.path || request.context.path.trim().length === 0) {
    return false;
  }
  
  // Context type must be valid
  const validContextTypes: AIContextType[] = ['crm', 'chat', 'leads', 'agendamentos', 'analytics'];
  if (!validContextTypes.includes(request.context.contextType)) {
    return false;
  }
  
  return true;
}

/**
 * Generates a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a user message object
 */
export function createUserMessage(
  content: string,
  context: AIMessageContext
): AIMessage {
  return {
    id: generateMessageId(),
    content,
    role: 'user',
    timestamp: new Date(),
    context,
  };
}

/**
 * Creates an assistant message object
 */
export function createAssistantMessage(
  content: string,
  context: AIMessageContext
): AIMessage {
  return {
    id: generateMessageId(),
    content,
    role: 'assistant',
    timestamp: new Date(),
    context,
  };
}

/**
 * Sends a message to the AI specialist API
 * 
 * Requirements: 1.6
 * 
 * @param request - The message request with context
 * @returns Promise with the AI response
 */
export async function sendMessageToAISpecialist(
  request: AIMessageRequest
): Promise<AIMessageResponse> {
  // Validate request
  if (!validateMessageRequest(request)) {
    return {
      id: generateMessageId(),
      content: '',
      timestamp: new Date(),
      success: false,
      error: 'Invalid message request: missing required context',
    };
  }
  
  try {
    // TODO: Replace with actual API endpoint when available
    const response = await fetch('/api/ai-specialist/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      id: data.id || generateMessageId(),
      content: data.content || '',
      timestamp: new Date(data.timestamp) || new Date(),
      success: true,
    };
  } catch (error) {
    return {
      id: generateMessageId(),
      content: '',
      timestamp: new Date(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Gets the context type label in Portuguese
 */
export function getContextTypeLabel(contextType: AIContextType): string {
  const labels: Record<AIContextType, string> = {
    crm: 'CRM',
    chat: 'Conversas',
    leads: 'Leads',
    agendamentos: 'Agendamentos',
    analytics: 'Análises',
  };
  
  return labels[contextType] || contextType;
}

/**
 * Checks if context includes the required section information
 */
export function hasValidContext(context: AIMessageContext | undefined): context is AIMessageContext {
  return (
    context !== undefined &&
    typeof context.section === 'string' &&
    context.section.length > 0 &&
    typeof context.contextType === 'string' &&
    typeof context.path === 'string' &&
    context.path.length > 0
  );
}
