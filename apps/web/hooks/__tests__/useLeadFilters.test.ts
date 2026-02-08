/**
 * Property-Based Tests for useLeadFilters Hook (Single-Select)
 * 
 * Tests the lead temperature filtering system after migration
 * from multi-select to single-select behavior.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Lead } from '@/types/lead';
import type { NonNullLeadTemperature, LeadTemperature } from '@/lib/temperature-config';
import { VALID_TEMPERATURES } from '@/lib/temperature-config';
import {
  filterLeadsByTemperature,
  toggleFilterSingleSelect,
  toggleFilterInList,
  calculateLeadCountsByTemperature,
  calculateFilteredLeadCounts,
} from '../useLeadFilters';

// ============================================
// Arbitraries (Generators)
// ============================================

const validTemperatureArb: fc.Arbitrary<NonNullLeadTemperature> = fc.constantFrom(
  'hot',
  'warm',
  'cold'
);

const temperatureArb: fc.Arbitrary<LeadTemperature> = fc.oneof(
  validTemperatureArb,
  fc.constant(null)
);

const leadArb: fc.Arbitrary<Lead> = fc.record({
  id: fc.uuid(),
  full_name: fc.string({ minLength: 1, maxLength: 100 }),
  phone: fc.string({ minLength: 10, maxLength: 15 }),
  status: fc.constantFrom('new', 'contacted', 'visit_scheduled', 'sold', 'lost'),
  temperature: temperatureArb,
});

const leadsArrayArb = fc.array(leadArb, { minLength: 0, maxLength: 50 });

const currentFilterArb: fc.Arbitrary<NonNullLeadTemperature | null> = fc.oneof(
  validTemperatureArb,
  fc.constant(null)
);

// ============================================
// Property-Based Tests
// ============================================

/**
 * **Feature: crm-bugfixes-analytics, Property 3: Single-select temperature filter**
 * **Validates: Requirements 2.1, 2.2, 2.4**
 *
 * For any sequence of temperature filter clicks, the active filter state
 * SHALL contain at most one value at any point. Clicking a new filter
 * replaces the previous one; clicking the active filter clears it.
 */
describe('Property 3: Single-select temperature filter', () => {
  it('clicking a new filter replaces the current one (at most one active)', () => {
    fc.assert(
      fc.property(
        currentFilterArb,
        validTemperatureArb,
        (currentFilter, clickedTemp) => {
          const result = toggleFilterSingleSelect(currentFilter, clickedTemp);

          if (currentFilter === clickedTemp) {
            // Clicking the active filter clears it
            expect(result).toBeNull();
          } else {
            // Clicking a different filter replaces
            expect(result).toBe(clickedTemp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after any sequence of clicks, at most one filter is active', () => {
    fc.assert(
      fc.property(
        fc.array(validTemperatureArb, { minLength: 1, maxLength: 20 }),
        (clickSequence) => {
          let current: NonNullLeadTemperature | null = null;
          for (const click of clickSequence) {
            current = toggleFilterSingleSelect(current, click);
            // Invariant: result is either null or a single temperature
            expect(
              current === null || VALID_TEMPERATURES.includes(current)
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('toggleFilterInList backward-compat wrapper produces at most one element', () => {
    fc.assert(
      fc.property(
        validTemperatureArb,
        validTemperatureArb,
        (initial, clicked) => {
          const startList = [initial] as NonNullLeadTemperature[];
          const result = toggleFilterInList(startList, clicked);
          expect(result.length).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: crm-bugfixes-analytics, Property 4: Temperature filter produces correct results**
 * **Validates: Requirements 2.3**
 *
 * For any list of leads and any single active temperature filter, the filtered
 * result SHALL contain only leads whose temperature field matches the active
 * filter. When no filter is active, all leads SHALL be returned.
 */
describe('Property 4: Temperature filter produces correct results', () => {
  it('filtered results contain only leads matching the active filter', () => {
    fc.assert(
      fc.property(
        leadsArrayArb,
        validTemperatureArb,
        (leads, filterTemp) => {
          const filtered = filterLeadsByTemperature(leads, filterTemp);

          for (const lead of filtered) {
            expect(lead.temperature).toBe(filterTemp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all matching leads are included in the result', () => {
    fc.assert(
      fc.property(
        leadsArrayArb,
        validTemperatureArb,
        (leads, filterTemp) => {
          const filtered = filterLeadsByTemperature(leads, filterTemp);
          const expectedCount = leads.filter(l => l.temperature === filterTemp).length;

          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns all leads when no filter is active (null)', () => {
    fc.assert(
      fc.property(
        leadsArrayArb,
        (leads) => {
          const filtered = filterLeadsByTemperature(leads, null);

          expect(filtered.length).toBe(leads.length);
          expect(filtered).toEqual(leads);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================
// Supporting pure function tests
// ============================================

describe('calculateLeadCountsByTemperature', () => {
  it('counts sum to leads with non-null temperature', () => {
    fc.assert(
      fc.property(
        leadsArrayArb,
        (leads) => {
          const counts = calculateLeadCountsByTemperature(leads);
          const total = counts.hot + counts.warm + counts.cold;
          const leadsWithTemp = leads.filter(l => l.temperature !== null).length;
          expect(total).toBe(leadsWithTemp);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('calculateFilteredLeadCounts', () => {
  it('filtered counts match actual filtered leads', () => {
    fc.assert(
      fc.property(
        leadsArrayArb,
        currentFilterArb,
        (leads, activeFilter) => {
          const filtered = filterLeadsByTemperature(leads, activeFilter);
          const counts = calculateFilteredLeadCounts(leads, activeFilter);
          const total = counts.hot + counts.warm + counts.cold;
          // Counts only cover leads with non-null temperature
          const filteredWithTemp = filtered.filter(l => l.temperature !== null).length;
          expect(total).toBe(filteredWithTemp);
        }
      ),
      { numRuns: 100 }
    );
  });
});
