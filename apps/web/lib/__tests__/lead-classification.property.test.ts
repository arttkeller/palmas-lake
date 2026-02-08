/**
 * Property-Based Tests for Lead Classification Utilities
 *
 * **Feature: realtime-lead-classification**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidInterestType,
  VALID_INTEREST_TYPES,
  getSentimentLabel,
  type SentimentLabel,
} from '../lead-classification';

// ============================================
// Property 5: Interest type validation
// ============================================

/**
 * **Feature: realtime-lead-classification, Property 5: Interest type validation**
 * **Validates: Requirements 2.3**
 *
 * For any string, the interest type validation function should accept only
 * values in the set {"apartamento", "sala_comercial", "office", "flat"}
 * and reject all other strings.
 */
describe('Property 5: Interest type validation', () => {
  const validInterestArb = fc.constantFrom(...VALID_INTEREST_TYPES);

  const invalidInterestArb = fc
    .string()
    .filter((s) => !VALID_INTEREST_TYPES.includes(s as any));

  it('accepts all valid interest types', () => {
    fc.assert(
      fc.property(validInterestArb, (input) => {
        expect(isValidInterestType(input)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects all strings not in the valid set', () => {
    fc.assert(
      fc.property(invalidInterestArb, (input) => {
        expect(isValidInterestType(input)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================
// Property 6: Sentiment score to label mapping consistency
// ============================================

/**
 * **Feature: realtime-lead-classification, Property 6: Sentiment score to label mapping consistency**
 * **Validates: Requirements 2.7**
 *
 * For any integer sentiment score in the range [-100, 100], the mapping
 * to a visual label should be deterministic:
 * - scores > 20  → "Positivo"
 * - scores < -20 → "Negativo"
 * - scores in [-20, 20] → "Neutro"
 */
describe('Property 6: Sentiment score to label mapping consistency', () => {
  const sentimentScoreArb = fc.integer({ min: -100, max: 100 });

  it('maps scores correctly according to thresholds', () => {
    fc.assert(
      fc.property(sentimentScoreArb, (score) => {
        const label = getSentimentLabel(score);

        if (score > 20) {
          expect(label).toBe('Positivo');
        } else if (score < -20) {
          expect(label).toBe('Negativo');
        } else {
          expect(label).toBe('Neutro');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic: same score always produces the same label', () => {
    fc.assert(
      fc.property(sentimentScoreArb, (score) => {
        const first = getSentimentLabel(score);
        const second = getSentimentLabel(score);
        expect(first).toBe(second);
      }),
      { numRuns: 100 },
    );
  });

  it('always returns one of the three valid labels', () => {
    fc.assert(
      fc.property(sentimentScoreArb, (score) => {
        const label = getSentimentLabel(score);
        const validLabels: SentimentLabel[] = ['Positivo', 'Neutro', 'Negativo'];
        expect(validLabels).toContain(label);
      }),
      { numRuns: 100 },
    );
  });
});
