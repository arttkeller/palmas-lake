/**
 * Property-Based Tests for normalizeStatus function
 *
 * **Feature: realtime-lead-classification**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { normalizeStatus, VALID_STATUSES, type CanonicalStatus } from '../status-config';

describe('normalizeStatus - Property Tests', () => {
  /**
   * **Feature: realtime-lead-classification, Property 7: Status normalization consistency across pages**
   * **Validates: Requirements 6.1, 6.2**
   *
   * For any status string, the unified normalizeStatus() function should produce
   * the same canonical status value regardless of where it is called.
   * This is verified by ensuring:
   * 1. The output is always a valid canonical status
   * 2. The function is deterministic (same input → same output)
   * 3. Canonical values are fixed points (normalizeStatus(canonical) === canonical)
   */
  describe('Property 7: Status normalization consistency across pages', () => {
    it('should always return a valid canonical status for any string input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (input) => {
            const result = normalizeStatus(input);
            expect(VALID_STATUSES).toContain(result);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should be deterministic: calling twice with the same input produces the same output', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (input) => {
            const first = normalizeStatus(input);
            const second = normalizeStatus(input);
            expect(first).toBe(second);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should be idempotent: normalizing an already-canonical value returns the same value', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_STATUSES),
          (canonical: CanonicalStatus) => {
            expect(normalizeStatus(canonical)).toBe(canonical);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
