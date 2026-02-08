/**
 * Conversation Analyzer Service
 * 
 * Analyzes lead conversations to extract relevant signals for classification.
 * Used by the temperature classifier to determine lead temperature.
 * 
 * Requirements: 4.1, 4.2
 */

import type { Message } from '@/types/chat';

// ============================================
// Signal Types
// ============================================

/**
 * Urgency level detected in conversation
 */
export type UrgencyLevel = 'high' | 'medium' | 'low' | 'none';

/**
 * Interest level detected in conversation
 */
export type InterestLevel = 'high' | 'medium' | 'low' | 'none';

/**
 * Engagement level based on response patterns
 */
export type EngagementLevel = 'active' | 'moderate' | 'passive' | 'unresponsive';

/**
 * Signals extracted from conversation analysis
 */
export interface ConversationSignals {
  urgency: UrgencyLevel;
  interest: InterestLevel;
  engagement: EngagementLevel;
  hasScheduledVisit: boolean;
  hasBudgetMention: boolean;
  hasTimelineMention: boolean;
  hasNegativeSignals: boolean;
  messageCount: number;
  leadMessageCount: number;
  averageResponseTime: number | null; // in minutes
  lastMessageFromLead: boolean;
  detectedKeywords: DetectedKeywords;
}

/**
 * Keywords detected in conversation
 */
export interface DetectedKeywords {
  urgencyKeywords: string[];
  interestKeywords: string[];
  negativeKeywords: string[];
  budgetKeywords: string[];
  timelineKeywords: string[];
}

// ============================================
// Keyword Constants
// ============================================

/**
 * Keywords indicating high urgency
 */
export const URGENCY_KEYWORDS = [
  'urgente',
  'preciso logo',
  'o mais rápido possível',
  'o mais rapido possivel',
  'imediato',
  'imediatamente',
  'hoje',
  'amanhã',
  'amanha',
  'essa semana',
  'próxima semana',
  'proxima semana',
  'não posso esperar',
  'nao posso esperar',
  'pressa',
  'rápido',
  'rapido',
];

/**
 * Keywords indicating high interest
 */
export const INTEREST_KEYWORDS = [
  'quero comprar',
  'tenho interesse',
  'gostei muito',
  'adorei',
  'perfeito',
  'exatamente o que procuro',
  'quando posso visitar',
  'agendar visita',
  'marcar visita',
  'quero conhecer',
  'me interessei',
  'quero saber mais',
  'valores',
  'preço',
  'preco',
  'condições de pagamento',
  'condicoes de pagamento',
  'financiamento',
  'entrada',
  'parcelas',
];

/**
 * Keywords indicating negative signals (cold lead)
 */
export const NEGATIVE_KEYWORDS = [
  'não tenho interesse',
  'nao tenho interesse',
  'não quero',
  'nao quero',
  'muito caro',
  'fora do orçamento',
  'fora do orcamento',
  'não é o que procuro',
  'nao e o que procuro',
  'desculpa',
  'obrigado mas',
  'talvez no futuro',
  'ainda não',
  'ainda nao',
  'só pesquisando',
  'so pesquisando',
  'apenas olhando',
  'sem pressa',
];

/**
 * Keywords indicating budget discussion
 */
export const BUDGET_KEYWORDS = [
  'orçamento',
  'orcamento',
  'budget',
  'quanto custa',
  'valor',
  'preço',
  'preco',
  'investimento',
  'entrada',
  'parcela',
  'financiamento',
  'à vista',
  'a vista',
  'dinheiro',
];

/**
 * Keywords indicating timeline discussion
 */
export const TIMELINE_KEYWORDS = [
  'quando',
  'prazo',
  'entrega',
  'previsão',
  'previsao',
  'data',
  'mês',
  'mes',
  'ano',
  'semana',
  'imediato',
  'curto prazo',
  'longo prazo',
  'médio prazo',
  'medio prazo',
];

// ============================================
// Text Normalization
// ============================================

/**
 * Normalizes text for keyword matching
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ============================================
// Keyword Detection Functions
// ============================================

/**
 * Detects keywords from a list in the given text
 */
export function detectKeywordsInText(text: string, keywords: readonly string[]): string[] {
  const normalized = normalizeText(text);
  const matched: string[] = [];

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      matched.push(keyword);
    }
  }

  return matched;
}

/**
 * Detects all keyword types in a message
 */
export function detectAllKeywords(text: string): DetectedKeywords {
  return {
    urgencyKeywords: detectKeywordsInText(text, URGENCY_KEYWORDS),
    interestKeywords: detectKeywordsInText(text, INTEREST_KEYWORDS),
    negativeKeywords: detectKeywordsInText(text, NEGATIVE_KEYWORDS),
    budgetKeywords: detectKeywordsInText(text, BUDGET_KEYWORDS),
    timelineKeywords: detectKeywordsInText(text, TIMELINE_KEYWORDS),
  };
}

// ============================================
// Level Calculation Functions
// ============================================

/**
 * Calculates urgency level based on detected keywords
 */
export function calculateUrgencyLevel(keywords: string[]): UrgencyLevel {
  const count = keywords.length;
  if (count >= 3) return 'high';
  if (count >= 2) return 'medium';
  if (count >= 1) return 'low';
  return 'none';
}

/**
 * Calculates interest level based on detected keywords
 */
export function calculateInterestLevel(
  interestKeywords: string[],
  negativeKeywords: string[]
): InterestLevel {
  // Negative keywords reduce interest level
  if (negativeKeywords.length >= 2) return 'low';
  if (negativeKeywords.length >= 1 && interestKeywords.length < 2) return 'low';

  const count = interestKeywords.length;
  if (count >= 4) return 'high';
  if (count >= 2) return 'medium';
  if (count >= 1) return 'low';
  return 'none';
}

/**
 * Calculates engagement level based on message patterns
 */
export function calculateEngagementLevel(
  leadMessageCount: number,
  totalMessageCount: number,
  lastMessageFromLead: boolean
): EngagementLevel {
  if (leadMessageCount === 0) return 'unresponsive';
  
  const responseRatio = leadMessageCount / Math.max(totalMessageCount, 1);
  
  if (responseRatio >= 0.4 && lastMessageFromLead) return 'active';
  if (responseRatio >= 0.3) return 'moderate';
  if (responseRatio >= 0.1) return 'passive';
  return 'unresponsive';
}

// ============================================
// Main Analysis Function
// ============================================

/**
 * Analyzes a conversation and extracts relevant signals
 * 
 * Requirements: 4.1 - WHEN a new message is received THEN trigger AI analysis
 * Requirements: 4.2 - WHEN AI analyzes THEN generate relevant tags
 */
export function analyzeConversation(messages: Message[]): ConversationSignals {
  // Aggregate keywords from all messages
  const allKeywords: DetectedKeywords = {
    urgencyKeywords: [],
    interestKeywords: [],
    negativeKeywords: [],
    budgetKeywords: [],
    timelineKeywords: [],
  };

  let leadMessageCount = 0;
  let lastMessageFromLead = false;

  for (const message of messages) {
    const content = message.content || '';
    const keywords = detectAllKeywords(content);

    // Aggregate keywords (remove duplicates later)
    allKeywords.urgencyKeywords.push(...keywords.urgencyKeywords);
    allKeywords.interestKeywords.push(...keywords.interestKeywords);
    allKeywords.negativeKeywords.push(...keywords.negativeKeywords);
    allKeywords.budgetKeywords.push(...keywords.budgetKeywords);
    allKeywords.timelineKeywords.push(...keywords.timelineKeywords);

    // Count lead messages (sender_type is 'lead' or 'user')
    if (message.sender_type === 'lead' || message.sender_type === 'user') {
      leadMessageCount++;
    }
  }

  // Check last message sender
  if (messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    lastMessageFromLead = lastMessage.sender_type === 'lead' || lastMessage.sender_type === 'user';
  }

  // Remove duplicate keywords
  const uniqueKeywords: DetectedKeywords = {
    urgencyKeywords: [...new Set(allKeywords.urgencyKeywords)],
    interestKeywords: [...new Set(allKeywords.interestKeywords)],
    negativeKeywords: [...new Set(allKeywords.negativeKeywords)],
    budgetKeywords: [...new Set(allKeywords.budgetKeywords)],
    timelineKeywords: [...new Set(allKeywords.timelineKeywords)],
  };

  // Calculate levels
  const urgency = calculateUrgencyLevel(uniqueKeywords.urgencyKeywords);
  const interest = calculateInterestLevel(
    uniqueKeywords.interestKeywords,
    uniqueKeywords.negativeKeywords
  );
  const engagement = calculateEngagementLevel(
    leadMessageCount,
    messages.length,
    lastMessageFromLead
  );

  // Determine boolean signals
  const hasScheduledVisit = uniqueKeywords.interestKeywords.some(kw =>
    ['agendar visita', 'marcar visita', 'quando posso visitar'].includes(kw.toLowerCase())
  );
  const hasBudgetMention = uniqueKeywords.budgetKeywords.length > 0;
  const hasTimelineMention = uniqueKeywords.timelineKeywords.length > 0;
  const hasNegativeSignals = uniqueKeywords.negativeKeywords.length > 0;

  return {
    urgency,
    interest,
    engagement,
    hasScheduledVisit,
    hasBudgetMention,
    hasTimelineMention,
    hasNegativeSignals,
    messageCount: messages.length,
    leadMessageCount,
    averageResponseTime: null, // Would require timestamp analysis
    lastMessageFromLead,
    detectedKeywords: uniqueKeywords,
  };
}

/**
 * Analyzes a single message and returns detected keywords
 * Useful for incremental analysis
 */
export function analyzeMessage(message: Message): DetectedKeywords {
  return detectAllKeywords(message.content || '');
}

/**
 * Checks if a conversation has enough data for reliable analysis
 */
export function hasEnoughDataForAnalysis(messages: Message[]): boolean {
  // Need at least 2 messages for meaningful analysis
  return messages.length >= 2;
}
