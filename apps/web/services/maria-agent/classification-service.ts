/**
 * Lead Classification Service for Maria Agent (Palmas Lake Towers)
 * Detects broker, investor, and hot lead classifications
 * Requirements: 3.1, 3.2, 3.3, 3.4, 7.5, 12.5
 */

import type {
  LeadClassification,
  LeadClassificationType,
  QualificationState,
} from '@/types/maria-agent';

// ============================================
// Keyword Constants
// Requirements 3.1, 3.3: Broker keywords
// ============================================

export const BROKER_KEYWORDS = [
  'sou corretor',
  'trabalho com imóveis',
  'trabalho com imoveis',
  'tenho clientes interessados',
  'creci',
  'parceria',
  'sou corretora',
  'corretor de imóveis',
  'corretor de imoveis',
  'imobiliária',
  'imobiliaria',
];

// ============================================
// Investor Keywords
// Requirements 3.2, 3.4: Investor keywords
// ============================================

export const INVESTOR_KEYWORDS = [
  'mais de uma unidade',
  'para investimento',
  'várias unidades',
  'varias unidades',
  'investir',
  'rentabilidade',
  'múltiplas unidades',
  'multiplas unidades',
  'comprar várias',
  'comprar varias',
  'renda passiva',
];

// ============================================
// Detected Keywords Interface
// ============================================

export interface DetectedKeywords {
  brokerKeywords: string[];
  investorKeywords: string[];
  urgencyKeywords: string[];
}

// ============================================
// Text Normalization
// ============================================

/**
 * Normalizes text for keyword matching (lowercase, trim, remove accents)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ============================================
// Broker Detection
// Requirements 3.1, 3.3
// ============================================

/**
 * Detects broker keywords in a message
 * Returns array of matched keywords
 */
export function detectBrokerKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const matched: string[] = [];

  for (const keyword of BROKER_KEYWORDS) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      matched.push(keyword);
    }
  }

  return matched;
}

/**
 * Checks if a message indicates the lead is a broker
 * Requirements 3.1: WHEN lead mentions broker keywords THEN classify as broker
 */
export function isBrokerMessage(text: string): boolean {
  return detectBrokerKeywords(text).length > 0;
}

/**
 * Calculates confidence score for broker classification
 * Based on number of matched keywords and their specificity
 */
export function calculateBrokerConfidence(matchedKeywords: string[]): number {
  if (matchedKeywords.length === 0) return 0;

  // High confidence keywords (very specific)
  const highConfidenceKeywords = ['sou corretor', 'sou corretora', 'creci'];
  
  // Check for high confidence matches
  const hasHighConfidence = matchedKeywords.some(kw => 
    highConfidenceKeywords.some(hck => normalizeText(kw).includes(normalizeText(hck)))
  );

  if (hasHighConfidence) {
    return Math.min(0.95, 0.8 + (matchedKeywords.length * 0.05));
  }

  // Medium confidence based on keyword count
  return Math.min(0.85, 0.5 + (matchedKeywords.length * 0.15));
}

// ============================================
// Investor Detection
// Requirements 3.2, 3.4
// ============================================

/**
 * Detects investor keywords in a message
 * Returns array of matched keywords
 */
export function detectInvestorKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const matched: string[] = [];

  for (const keyword of INVESTOR_KEYWORDS) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      matched.push(keyword);
    }
  }

  return matched;
}

/**
 * Checks if a message indicates the lead is an investor
 * Requirements 3.2: WHEN lead mentions investor keywords THEN classify as investor
 */
export function isInvestorMessage(text: string): boolean {
  return detectInvestorKeywords(text).length > 0;
}

/**
 * Calculates confidence score for investor classification
 */
export function calculateInvestorConfidence(matchedKeywords: string[]): number {
  if (matchedKeywords.length === 0) return 0;

  // High confidence keywords
  const highConfidenceKeywords = ['mais de uma unidade', 'para investimento', 'várias unidades'];
  
  const hasHighConfidence = matchedKeywords.some(kw => 
    highConfidenceKeywords.some(hck => normalizeText(kw).includes(normalizeText(hck)))
  );

  if (hasHighConfidence) {
    return Math.min(0.95, 0.8 + (matchedKeywords.length * 0.05));
  }

  return Math.min(0.85, 0.5 + (matchedKeywords.length * 0.15));
}

// ============================================
// Combined Classification
// ============================================

/**
 * Detects all keywords in a message
 */
export function detectKeywords(text: string): DetectedKeywords {
  return {
    brokerKeywords: detectBrokerKeywords(text),
    investorKeywords: detectInvestorKeywords(text),
    urgencyKeywords: [], // To be implemented if needed
  };
}

/**
 * Classifies a lead based on message content
 * Returns classification with type, confidence, and indicators
 */
export function classifyFromMessage(text: string): LeadClassification {
  const brokerKeywords = detectBrokerKeywords(text);
  const investorKeywords = detectInvestorKeywords(text);

  // Broker takes priority (they might also mention investment)
  if (brokerKeywords.length > 0) {
    return {
      type: 'corretor',
      confidence: calculateBrokerConfidence(brokerKeywords),
      indicators: brokerKeywords,
    };
  }

  // Check for investor
  if (investorKeywords.length > 0) {
    return {
      type: 'investidor',
      confidence: calculateInvestorConfidence(investorKeywords),
      indicators: investorKeywords,
    };
  }

  // Default to cliente_final
  return {
    type: 'cliente_final',
    confidence: 0.5,
    indicators: [],
  };
}

/**
 * Classifies a lead based on multiple messages
 * Aggregates keywords from all messages
 */
export function classifyLead(messages: string[]): LeadClassification {
  const allBrokerKeywords: string[] = [];
  const allInvestorKeywords: string[] = [];

  for (const message of messages) {
    allBrokerKeywords.push(...detectBrokerKeywords(message));
    allInvestorKeywords.push(...detectInvestorKeywords(message));
  }

  // Remove duplicates
  const uniqueBrokerKeywords = [...new Set(allBrokerKeywords)];
  const uniqueInvestorKeywords = [...new Set(allInvestorKeywords)];

  // Broker takes priority
  if (uniqueBrokerKeywords.length > 0) {
    return {
      type: 'corretor',
      confidence: calculateBrokerConfidence(uniqueBrokerKeywords),
      indicators: uniqueBrokerKeywords,
    };
  }

  if (uniqueInvestorKeywords.length > 0) {
    return {
      type: 'investidor',
      confidence: calculateInvestorConfidence(uniqueInvestorKeywords),
      indicators: uniqueInvestorKeywords,
    };
  }

  return {
    type: 'cliente_final',
    confidence: 0.5,
    indicators: [],
  };
}

// ============================================
// Hot Lead Detection
// Requirements 7.5, 12.5
// ============================================

/**
 * Determines if a lead should be marked as HOT
 * Criteria: orçamento adequado + prazo curto OU já visitou + interesse
 * Requirements 7.5, 12.5
 */
export function isHotLead(
  qualificationState: QualificationState,
  hasVisited: boolean = false
): boolean {
  const hasShortTimeline = 
    qualificationState.timeline === 'imediato' || 
    qualificationState.timeline === 'curto_prazo';
  
  const hasInterest = qualificationState.objective !== undefined;
  const hasDefinedInterestType = qualificationState.interestType !== undefined;

  // Criteria 1: Short timeline + has interest
  if (hasShortTimeline && hasInterest) {
    return true;
  }

  // Criteria 2: Already visited + has interest
  if (hasVisited && hasInterest && hasDefinedInterestType) {
    return true;
  }

  return false;
}
