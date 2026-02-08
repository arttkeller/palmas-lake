/**
 * Temperature Classifier Service
 * 
 * Classifies leads as hot, warm, or cold based on conversation analysis signals.
 * Uses the conversation analyzer to extract signals and applies classification rules.
 * 
 * Requirements: 1.1, 4.1
 */

import type { Message } from '@/types/chat';
import type { LeadTemperature, NonNullLeadTemperature } from '@/lib/temperature-config';
import { isValidTemperature } from '@/lib/temperature-config';
import {
  analyzeConversation,
  type ConversationSignals,
  type UrgencyLevel,
  type InterestLevel,
  type EngagementLevel,
} from './conversation-analyzer';

// ============================================
// Classification Result Types
// ============================================

/**
 * Result of temperature classification
 */
export interface TemperatureClassificationResult {
  temperature: NonNullLeadTemperature;
  confidence: number; // 0-1 score
  reason: string;
  signals: ConversationSignals;
}

/**
 * Classification thresholds configuration
 */
export interface ClassificationThresholds {
  hotMinConfidence: number;
  warmMinConfidence: number;
  coldMaxConfidence: number;
}

// ============================================
// Default Thresholds
// ============================================

export const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  hotMinConfidence: 0.7,
  warmMinConfidence: 0.4,
  coldMaxConfidence: 0.3,
};

// ============================================
// Score Calculation Functions
// ============================================

/**
 * Calculates urgency score (0-1)
 */
export function calculateUrgencyScore(urgency: UrgencyLevel): number {
  switch (urgency) {
    case 'high': return 1.0;
    case 'medium': return 0.6;
    case 'low': return 0.3;
    case 'none': return 0.0;
  }
}

/**
 * Calculates interest score (0-1)
 */
export function calculateInterestScore(interest: InterestLevel): number {
  switch (interest) {
    case 'high': return 1.0;
    case 'medium': return 0.6;
    case 'low': return 0.3;
    case 'none': return 0.0;
  }
}

/**
 * Calculates engagement score (0-1)
 */
export function calculateEngagementScore(engagement: EngagementLevel): number {
  switch (engagement) {
    case 'active': return 1.0;
    case 'moderate': return 0.6;
    case 'passive': return 0.3;
    case 'unresponsive': return 0.0;
  }
}

/**
 * Calculates bonus score for specific signals
 */
export function calculateBonusScore(signals: ConversationSignals): number {
  let bonus = 0;

  // Scheduled visit is a strong positive signal
  if (signals.hasScheduledVisit) {
    bonus += 0.2;
  }

  // Budget mention indicates serious interest
  if (signals.hasBudgetMention) {
    bonus += 0.1;
  }

  // Timeline mention indicates planning
  if (signals.hasTimelineMention) {
    bonus += 0.1;
  }

  return Math.min(bonus, 0.3); // Cap bonus at 0.3
}

/**
 * Calculates penalty score for negative signals
 */
export function calculatePenaltyScore(signals: ConversationSignals): number {
  let penalty = 0;

  // Negative signals reduce score
  if (signals.hasNegativeSignals) {
    penalty += 0.3;
  }

  // Unresponsive engagement is a negative signal
  if (signals.engagement === 'unresponsive') {
    penalty += 0.2;
  }

  return Math.min(penalty, 0.5); // Cap penalty at 0.5
}

// ============================================
// Main Classification Functions
// ============================================

/**
 * Calculates overall confidence score from signals
 */
export function calculateConfidenceScore(signals: ConversationSignals): number {
  // Weight factors for each signal type
  const weights = {
    urgency: 0.25,
    interest: 0.35,
    engagement: 0.25,
    bonus: 0.15,
  };

  const urgencyScore = calculateUrgencyScore(signals.urgency);
  const interestScore = calculateInterestScore(signals.interest);
  const engagementScore = calculateEngagementScore(signals.engagement);
  const bonusScore = calculateBonusScore(signals);
  const penaltyScore = calculatePenaltyScore(signals);

  // Calculate weighted score
  const baseScore =
    urgencyScore * weights.urgency +
    interestScore * weights.interest +
    engagementScore * weights.engagement +
    bonusScore * weights.bonus;

  // Apply penalty
  const finalScore = Math.max(0, baseScore - penaltyScore);

  // Normalize to 0-1 range
  return Math.min(1, Math.max(0, finalScore));
}

/**
 * Determines temperature classification from confidence score
 */
export function determineTemperature(
  confidence: number,
  thresholds: ClassificationThresholds = DEFAULT_THRESHOLDS
): NonNullLeadTemperature {
  if (confidence >= thresholds.hotMinConfidence) {
    return 'hot';
  }
  if (confidence >= thresholds.warmMinConfidence) {
    return 'warm';
  }
  return 'cold';
}

/**
 * Generates a human-readable reason for the classification
 */
export function generateClassificationReason(
  temperature: NonNullLeadTemperature,
  signals: ConversationSignals
): string {
  const reasons: string[] = [];

  // Add urgency reason
  if (signals.urgency === 'high') {
    reasons.push('alta urgência detectada');
  } else if (signals.urgency === 'medium') {
    reasons.push('urgência moderada');
  }

  // Add interest reason
  if (signals.interest === 'high') {
    reasons.push('alto interesse demonstrado');
  } else if (signals.interest === 'medium') {
    reasons.push('interesse moderado');
  } else if (signals.interest === 'low') {
    reasons.push('baixo interesse');
  }

  // Add engagement reason
  if (signals.engagement === 'active') {
    reasons.push('engajamento ativo');
  } else if (signals.engagement === 'unresponsive') {
    reasons.push('sem resposta');
  }

  // Add specific signals
  if (signals.hasScheduledVisit) {
    reasons.push('visita agendada');
  }
  if (signals.hasNegativeSignals) {
    reasons.push('sinais negativos detectados');
  }

  if (reasons.length === 0) {
    return `Lead classificado como ${temperature} com base na análise da conversa`;
  }

  return `Lead classificado como ${temperature}: ${reasons.join(', ')}`;
}

/**
 * Classifies a lead's temperature based on conversation messages
 * 
 * Requirements: 1.1 - WHEN AI analyzes THEN assign temperature classification
 * Requirements: 4.1 - WHEN new message received THEN trigger AI analysis
 */
export function classifyTemperature(
  messages: Message[],
  thresholds: ClassificationThresholds = DEFAULT_THRESHOLDS
): TemperatureClassificationResult {
  // Analyze conversation to extract signals
  const signals = analyzeConversation(messages);

  // Calculate confidence score
  const confidence = calculateConfidenceScore(signals);

  // Determine temperature from confidence
  const temperature = determineTemperature(confidence, thresholds);

  // Generate reason
  const reason = generateClassificationReason(temperature, signals);

  return {
    temperature,
    confidence,
    reason,
    signals,
  };
}

/**
 * Classifies temperature from pre-computed signals
 * Useful when signals are already available
 */
export function classifyFromSignals(
  signals: ConversationSignals,
  thresholds: ClassificationThresholds = DEFAULT_THRESHOLDS
): TemperatureClassificationResult {
  const confidence = calculateConfidenceScore(signals);
  const temperature = determineTemperature(confidence, thresholds);
  const reason = generateClassificationReason(temperature, signals);

  return {
    temperature,
    confidence,
    reason,
    signals,
  };
}

/**
 * Validates that a classification result has a valid temperature
 */
export function isValidClassificationResult(
  result: TemperatureClassificationResult
): boolean {
  return (
    isValidTemperature(result.temperature) &&
    result.confidence >= 0 &&
    result.confidence <= 1 &&
    typeof result.reason === 'string'
  );
}

/**
 * Compares two temperatures to determine if classification changed
 */
export function hasTemperatureChanged(
  oldTemperature: LeadTemperature,
  newTemperature: LeadTemperature
): boolean {
  return oldTemperature !== newTemperature;
}
