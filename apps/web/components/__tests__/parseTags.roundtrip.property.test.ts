/**
 * Property-Based Tests for Tags/Adjectives JSON serialization round-trip
 *
 * **Feature: realtime-lead-classification**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseTags } from '../LeadModal';

// Generator for non-empty strings that are not whitespace-only
const nonEmptyTagArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

// Generator for arrays of non-empty tags
const tagArrayArb: fc.Arbitrary<string[]> = fc.array(nonEmptyTagArb, { minLength: 0, maxLength: 20 });

describe('Tags/Adjectives Round-Trip - Property Tests', () => {
  /**
   * **Feature: realtime-lead-classification, Property 3: Tags/adjectives JSON array serialization round-trip**
   * **Validates: Requirements 2.1, 2.2**
   *
   * For any array of non-empty strings, serializing to JSON and then parsing
   * with parseTags() should produce the original array (preserving order and content).
   */
  describe('Property 3: Tags/adjectives JSON array serialization round-trip', () => {
    it('should round-trip: JSON.stringify then parseTags produces the original array', () => {
      fc.assert(
        fc.property(
          tagArrayArb,
          (tags) => {
            const serialized = JSON.stringify(tags);
            const deserialized = parseTags(serialized);
            expect(deserialized).toEqual(tags);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip for adjectives arrays identically to tags arrays', () => {
      fc.assert(
        fc.property(
          tagArrayArb,
          (adjectives) => {
            // Adjectives use the same storage format as tags (JSON array)
            const serialized = JSON.stringify(adjectives);
            const deserialized = parseTags(serialized);
            expect(deserialized).toEqual(adjectives);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve order through round-trip', () => {
      fc.assert(
        fc.property(
          fc.array(nonEmptyTagArb, { minLength: 2, maxLength: 15 }),
          (tags) => {
            const serialized = JSON.stringify(tags);
            const deserialized = parseTags(serialized);
            for (let i = 0; i < tags.length; i++) {
              expect(deserialized[i]).toBe(tags[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
