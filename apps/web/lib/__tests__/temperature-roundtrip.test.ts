/**
 * Property-Based Tests for Temperature Serialization Round-Trip
 *
 * **Feature: realtime-lead-classification, Property 2: Temperature serialization round-trip**
 * **Validates: Requirements 1.4, 8.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  serializeTemperature,
  deserializeTemperature,
  type NonNullLeadTemperature,
} from '../temperature-config';

const validTemperatureArb: fc.Arbitrary<NonNullLeadTemperature> = fc.constantFrom(
  'hot',
  'warm',
  'cold',
);

describe('Property 2: Temperature serialization round-trip', () => {
  it('for any valid temperature, deserialize(serialize(temp)) === temp', () => {
    fc.assert(
      fc.property(validTemperatureArb, (temp) => {
        const serialized = serializeTemperature(temp);
        const deserialized = deserializeTemperature(serialized);
        expect(deserialized).toBe(temp);
      }),
      { numRuns: 100 },
    );
  });
});
