/**
 * Property-Based Tests for Temperature Normalization
 *
 * **Feature: realtime-lead-classification, Property 1: Temperature normalization always produces English values**
 * **Validates: Requirements 1.1, 1.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  normalizeTemperature,
  VALID_TEMPERATURES,
  type NonNullLeadTemperature,
} from '../temperature-config';

/** All recognized input strings (Portuguese + English) */
const ALL_VALID_INPUTS = ['hot', 'warm', 'cold', 'quente', 'morno', 'frio'];

const validInputArb: fc.Arbitrary<string> = fc.constantFrom(...ALL_VALID_INPUTS);

const invalidInputArb: fc.Arbitrary<string> = fc
  .string()
  .filter((s) => !ALL_VALID_INPUTS.includes(s.toLowerCase().trim()));

describe('Property 1: Temperature normalization always produces English values', () => {
  it('for any recognized temperature string, normalizeTemperature returns a valid English value', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = normalizeTemperature(input);
        expect(result).not.toBeNull();
        expect(VALID_TEMPERATURES).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  it('for any unrecognized string, normalizeTemperature returns null', () => {
    fc.assert(
      fc.property(invalidInputArb, (input) => {
        const result = normalizeTemperature(input);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
