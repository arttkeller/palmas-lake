/**
 * Property-Based Tests for Real Data Display Consistency
 *
 * Tests that when the API returns non-zero total_leads, the display pipeline
 * preserves that exact value through mapCacheDataToChartFormat and into
 * the component data — never substituting zero or mock data.
 *
 * **Feature: fix-analytics-mock-data, Property 1: Real data display consistency**
 * **Validates: Requirements 1.1, 1.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { areaChartHasRealData } from '../AreaChartStats';
import { mapCacheDataToChartFormat } from '@/app/dashboard/analytics/page';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for a minimal DashboardMetrics-like cache object
 * with non-zero total_leads (the core input domain for this property).
 */
const nonZeroCacheDataArb = fc.integer({ min: 1, max: 100000 }).chain(total_leads =>
  fc.record({
    total_leads: fc.constant(total_leads),
    conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
    em_atendimento: fc.integer({ min: 0, max: total_leads }),
    status_distribution: fc.oneof(
      fc.constant({}),
      fc.record({
        novo: fc.integer({ min: 0, max: Math.max(1, Math.floor(total_leads * 0.4)) }),
        vendido: fc.integer({ min: 0, max: Math.max(1, Math.floor(total_leads * 0.2)) }),
        visita_agendada: fc.integer({ min: 0, max: Math.max(1, Math.floor(total_leads * 0.2)) }),
      }),
    ),
    history: fc.array(
      fc.record({
        date: fc.integer({ min: 0, max: 365 }).map(d => {
          const base = new Date('2024-01-01');
          base.setDate(base.getDate() + d);
          return base.toISOString().split('T')[0];
        }),
        leads: fc.integer({ min: 0, max: 1000 }),
      }),
      { minLength: 0, maxLength: 30 }
    ),
    channels: fc.constant([]),
    sentiment_trend: fc.constant([]),
    objections: fc.constant([]),
    faq: fc.constant([]),
    transfer_rate: fc.constant(0),
    transfer_count: fc.constant(0),
    heatmap: fc.constant([]),
  })
);

// ============================================
// Property-Based Tests
// ============================================

describe('Real Data Display Consistency - Property Tests', () => {
  /**
   * **Feature: fix-analytics-mock-data, Property 1: Real data display consistency**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For any non-zero total_leads value returned by the API, the AreaChartStats
   * component should display that exact value (not zero or mock data).
   */

  it('mapCacheDataToChartFormat preserves non-zero total_leads exactly', () => {
    fc.assert(
      fc.property(
        nonZeroCacheDataArb,
        (cacheData) => {
          const mapped = mapCacheDataToChartFormat(cacheData as any);

          // The mapped total_leads must equal the original non-zero value
          expect(mapped.total_leads).toBe(cacheData.total_leads);
          expect(mapped.total_leads).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('areaChartHasRealData returns true for non-zero total_leads', () => {
    fc.assert(
      fc.property(
        nonZeroCacheDataArb,
        (cacheData) => {
          const mapped = mapCacheDataToChartFormat(cacheData as any);
          const hasReal = areaChartHasRealData(mapped);

          // When total_leads > 0, the component should recognize real data
          expect(hasReal).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mapCacheDataToChartFormat preserves history data from cache', () => {
    fc.assert(
      fc.property(
        nonZeroCacheDataArb,
        (cacheData) => {
          const mapped = mapCacheDataToChartFormat(cacheData as any);

          // History length must be preserved through the mapping
          expect(mapped.history.length).toBe(cacheData.history.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mapCacheDataToChartFormat preserves status_distribution from cache', () => {
    fc.assert(
      fc.property(
        nonZeroCacheDataArb,
        (cacheData) => {
          const mapped = mapCacheDataToChartFormat(cacheData as any);

          // status_distribution keys and values must be preserved
          const originalKeys = Object.keys(cacheData.status_distribution);
          const mappedKeys = Object.keys(mapped.status_distribution);
          expect(mappedKeys).toEqual(expect.arrayContaining(originalKeys));

          for (const key of originalKeys) {
            expect(mapped.status_distribution[key]).toBe(cacheData.status_distribution[key]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('end-to-end: non-zero cache data always results in real data display', () => {
    fc.assert(
      fc.property(
        nonZeroCacheDataArb,
        (cacheData) => {
          // Step 1: Map through the data pipeline
          const mapped = mapCacheDataToChartFormat(cacheData as any);

          // Step 2: Check that the component would show real data
          const hasReal = areaChartHasRealData(mapped);

          // Step 3: Verify the value is the original, not zero or mock
          expect(hasReal).toBe(true);
          expect(mapped.total_leads).toBe(cacheData.total_leads);
          expect(mapped.total_leads).not.toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
