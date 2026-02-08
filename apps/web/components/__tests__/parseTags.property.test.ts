/**
 * Property-Based Tests for parseTags function
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
const tagArrayArb: fc.Arbitrary<string[]> = fc.array(nonEmptyTagArb, { minLength: 1, maxLength: 20 });

describe('parseTags - Property Tests', () => {
  /**
   * **Feature: realtime-lead-classification, Property 4: parseTags extracts all tags from any valid format**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For any non-empty array of non-empty strings, parseTags(tags) should return the same array,
   * and parseTags(JSON.stringify(tags)) should also return the same array.
   */
  describe('Property 4: parseTags extracts all tags from any valid format', () => {
    it('should return the same array when given a native array of non-empty strings', () => {
      fc.assert(
        fc.property(
          tagArrayArb,
          (tags) => {
            const result = parseTags(tags);
            expect(result).toEqual(tags);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return the same array when given a JSON-encoded string of non-empty strings', () => {
      fc.assert(
        fc.property(
          tagArrayArb,
          (tags) => {
            const jsonString = JSON.stringify(tags);
            const result = parseTags(jsonString);
            expect(result).toEqual(tags);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for null, undefined, empty string, and empty JSON array', () => {
      expect(parseTags(null)).toEqual([]);
      expect(parseTags(undefined)).toEqual([]);
      expect(parseTags('')).toEqual([]);
      expect(parseTags('[]')).toEqual([]);
    });

    it('should treat a non-JSON string as a single tag', () => {
      fc.assert(
        fc.property(
          nonEmptyTagArb.filter(s => {
            // Exclude strings that look like JSON arrays
            const trimmed = s.trim();
            if (trimmed.startsWith('[')) return false;
            return true;
          }),
          (tag) => {
            const result = parseTags(tag);
            expect(result).toEqual([tag.trim()]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
