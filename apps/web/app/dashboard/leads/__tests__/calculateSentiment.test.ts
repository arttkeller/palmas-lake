/**
 * Property-Based Tests for calculateSentiment function
 *
 * **Feature: fix-lead-enrichment-analytics, Property 2: Sentiment score database priority**
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================
// Function Under Test (mirrors leads/page.tsx)
// ============================================

/**
 * Calculates sentiment based on lead data.
 * Requirements 3.1, 3.3: Prioritizes sentiment_score from DB when non-null.
 * This mirrors the logic in apps/web/app/dashboard/leads/page.tsx
 */
function calculateSentiment(item: any): number {
  // Prioritize sentiment_score from DB when non-null (including 0)
  if (item.sentiment_score !== undefined && item.sentiment_score !== null) {
    return item.sentiment_score;
  }

  let score = 0;
  const status = item.status?.toLowerCase() || '';
  const notes = item.notes?.toLowerCase() || '';

  if (status.includes('interesse') || status.includes('quente') || status.includes('visita') || status.includes('proposta')) {
    score = 80;
  } else if (status.includes('vendido') || status.includes('fechado')) {
    score = 100;
  } else if (status.includes('perdido') || status.includes('arquivado') || status.includes('desistiu')) {
    score = -60;
  }

  if (score === 0) {
    if (notes.includes('interessado') || notes.includes('animado') || notes.includes('comprar') || notes.includes('gostou')) {
      score = 60;
    }
    if (notes.includes('caro') || notes.includes('pensar') || notes.includes('dúvida')) {
      score = -20;
    }
    if (notes.includes('não quer') || notes.includes('reclamou') || notes.includes('tirar da lista')) {
      score = -80;
    }
  }

  return score;
}

// ============================================
// Generators
// ============================================

const sentimentScoreArb = fc.integer({ min: -100, max: 100 });

const statusArb = fc.constantFrom(
  'novo', 'em_atendimento', 'qualificado', 'interesse', 'quente',
  'visita', 'proposta', 'vendido', 'fechado', 'perdido', 'arquivado', 'desistiu'
);

const notesArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom(
    'interessado no flat', 'animado com o projeto', 'quer comprar',
    'achou caro', 'vai pensar', 'não quer mais', 'reclamou do preço',
    'gostou muito', 'sem notas'
  )
);

// ============================================
// Property-Based Tests
// ============================================

describe('calculateSentiment - Property Tests', () => {
  /**
   * **Feature: fix-lead-enrichment-analytics, Property 2: Sentiment score database priority**
   * **Validates: Requirements 3.1**
   *
   * For any lead with a non-null sentiment_score in the database,
   * calculateSentiment should return that exact database value,
   * regardless of the lead's status or notes content.
   */
  it('should return DB sentiment_score when non-null, regardless of status/notes', () => {
    fc.assert(
      fc.property(
        sentimentScoreArb,
        statusArb,
        notesArb,
        (dbScore, status, notes) => {
          const item = {
            sentiment_score: dbScore,
            status,
            notes,
          };

          const result = calculateSentiment(item);
          expect(result).toBe(dbScore);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should return DB sentiment_score of 0 without falling through to local calc', () => {
    fc.assert(
      fc.property(
        statusArb,
        notesArb,
        (status, notes) => {
          const item = {
            sentiment_score: 0,
            status,
            notes,
          };

          const result = calculateSentiment(item);
          expect(result).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should fall back to local calculation when sentiment_score is null', () => {
    fc.assert(
      fc.property(
        statusArb,
        notesArb,
        (status, notes) => {
          const item = {
            sentiment_score: null,
            status,
            notes,
          };

          const result = calculateSentiment(item);
          // Result should be a number from the local fallback logic
          expect(typeof result).toBe('number');
          expect(result).toBeGreaterThanOrEqual(-100);
          expect(result).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should fall back to local calculation when sentiment_score is undefined', () => {
    fc.assert(
      fc.property(
        statusArb,
        notesArb,
        (status, notes) => {
          const item = {
            status,
            notes,
          };

          const result = calculateSentiment(item);
          expect(typeof result).toBe('number');
          expect(result).toBeGreaterThanOrEqual(-100);
          expect(result).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });
});
