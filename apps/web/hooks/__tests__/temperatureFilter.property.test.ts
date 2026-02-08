/**
 * Property-Based Test for Temperature Filter
 *
 * **Feature: realtime-lead-classification, Property 8: Temperature filter returns only matching leads**
 * **Validates: Requirements 1.2**
 *
 * For any list of leads with various temperature values and a selected
 * temperature filter, filterLeadsByTemperature() should return only leads
 * whose temperature matches the filter, and when no filter is active,
 * all leads should be returned.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Lead } from '@/types/lead';
import type { NonNullLeadTemperature, LeadTemperature } from '@/lib/temperature-config';
import { VALID_TEMPERATURES } from '@/lib/temperature-config';
import { filterLeadsByTemperature } from '../useLeadFilters';

// ============================================
// Arbitraries
// ============================================

const validTemperatureArb: fc.Arbitrary<NonNullLeadTemperature> = fc.constantFrom(
  'hot',
  'warm',
  'cold',
);

const temperatureArb: fc.Arbitrary<LeadTemperature> = fc.oneof(
  validTemperatureArb,
  fc.constant(null),
);

const leadArb: fc.Arbitrary<Lead> = fc.record({
  id: fc.uuid(),
  full_name: fc.string({ minLength: 1, maxLength: 50 }),
  phone: fc.string({ minLength: 10, maxLength: 15 }),
  status: fc.constantFrom('new', 'contacted', 'visit_scheduled', 'sold', 'lost'),
  temperature: temperatureArb,
});

const leadsArrayArb = fc.array(leadArb, { minLength: 0, maxLength: 50 });

// ============================================
// Property 8
// ============================================

describe('Property 8: Temperature filter returns only matching leads', () => {
  it('filtered results contain only leads whose temperature matches the filter', () => {
    fc.assert(
      fc.property(leadsArrayArb, validTemperatureArb, (leads, filterTemp) => {
        const filtered = filterLeadsByTemperature(leads, filterTemp);

        for (const lead of filtered) {
          expect(lead.temperature).toBe(filterTemp);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('no matching leads are excluded from the result', () => {
    fc.assert(
      fc.property(leadsArrayArb, validTemperatureArb, (leads, filterTemp) => {
        const filtered = filterLeadsByTemperature(leads, filterTemp);
        const expected = leads.filter((l) => l.temperature === filterTemp);

        expect(filtered.length).toBe(expected.length);
      }),
      { numRuns: 100 },
    );
  });

  it('returns all leads when no filter is active', () => {
    fc.assert(
      fc.property(leadsArrayArb, (leads) => {
        const filtered = filterLeadsByTemperature(leads, null);

        expect(filtered.length).toBe(leads.length);
        expect(filtered).toEqual(leads);
      }),
      { numRuns: 100 },
    );
  });
});
