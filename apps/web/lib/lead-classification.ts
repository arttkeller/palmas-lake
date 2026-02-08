/**
 * Lead Classification Utilities
 *
 * Shared validation and mapping functions for lead classification fields:
 * interest type, sentiment score, etc.
 *
 * Requirements: 2.3, 2.7
 */

/**
 * Valid interest type values accepted by the system.
 * Requirements: 2.3
 */
export const VALID_INTEREST_TYPES = [
  'apartamento',
  'sala_comercial',
  'office',
  'flat',
] as const;

export type ValidInterestType = (typeof VALID_INTEREST_TYPES)[number];

/**
 * Validates whether a string is a recognized interest type.
 * Returns true only for values in {"apartamento", "sala_comercial", "office", "flat"}.
 *
 * Requirements: 2.3
 */
export function isValidInterestType(value: string): value is ValidInterestType {
  return typeof value === 'string' &&
    VALID_INTEREST_TYPES.includes(value as ValidInterestType);
}

/**
 * Sentiment label type
 */
export type SentimentLabel = 'Positivo' | 'Neutro' | 'Negativo';

/**
 * Maps a sentiment score to a display label.
 * - Scores > 20  → "Positivo"
 * - Scores < -20 → "Negativo"
 * - Scores in [-20, 20] → "Neutro"
 *
 * Requirements: 2.7
 */
export function getSentimentLabel(score: number): SentimentLabel {
  if (score > 20) return 'Positivo';
  if (score < -20) return 'Negativo';
  return 'Neutro';
}
