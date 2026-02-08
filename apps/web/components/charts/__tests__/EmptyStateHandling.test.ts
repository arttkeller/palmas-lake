/**
 * Property-Based Tests for Empty State Handling
 *
 * Tests that components display appropriate empty state messages
 * when data is null, empty, or has zero values.
 *
 * **Feature: fix-analytics-mock-data, Property 3: Empty state handling**
 * **Validates: Requirements 1.4, 2.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { areaChartHasRealData } from '../AreaChartStats';
import { shouldShowCalculatingBanner, mapCacheDataToChartFormat } from '@/app/dashboard/analytics/page';

// ============================================
// Types (mirroring component types)
// ============================================

interface AreaChartData {
  total_leads: number;
  conversion_rate: number;
  status_distribution?: Record<string, number>;
  history?: { date: string; leads: number }[];
  conversion_rate_history?: { date: string; rate: number }[];
  sales_history?: { date: string; sales: number }[];
}

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for data that should trigger empty state:
 * total_leads is 0 AND history is empty or missing
 */
const emptyAreaChartDataArb: fc.Arbitrary<AreaChartData> = fc.record({
  total_leads: fc.constant(0),
  conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  status_distribution: fc.option(fc.constant({}), { nil: undefined }),
  history: fc.constantFrom([], undefined) as fc.Arbitrary<{ date: string; leads: number }[] | undefined>,
  conversion_rate_history: fc.option(fc.constant([]), { nil: undefined }),
  sales_history: fc.option(fc.constant([]), { nil: undefined }),
});

/**
 * Generator for data with real content (total_leads > 0)
 */
const realAreaChartDataArb: fc.Arbitrary<AreaChartData> = fc.integer({ min: 1, max: 50000 }).chain(total =>
  fc.record({
    total_leads: fc.constant(total),
    conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
    status_distribution: fc.option(fc.constant({ novo: 5, vendido: 2 }), { nil: undefined }),
    history: fc.option(
      fc.array(
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
      { nil: undefined }
    ),
    conversion_rate_history: fc.option(fc.constant([]), { nil: undefined }),
    sales_history: fc.option(fc.constant([]), { nil: undefined }),
  })
);

/**
 * Generator for data with history but zero total_leads
 * (should NOT show empty state because history exists)
 */
const zeroLeadsWithHistoryArb: fc.Arbitrary<AreaChartData> = fc.record({
  total_leads: fc.constant(0),
  conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  status_distribution: fc.option(fc.constant({}), { nil: undefined }),
  history: fc.array(
    fc.record({
      date: fc.integer({ min: 0, max: 365 }).map(d => {
        const base = new Date('2024-01-01');
        base.setDate(base.getDate() + d);
        return base.toISOString().split('T')[0];
      }),
      leads: fc.integer({ min: 0, max: 100 }),
    }),
    { minLength: 1, maxLength: 10 }
  ),
  conversion_rate_history: fc.option(fc.constant([]), { nil: undefined }),
  sales_history: fc.option(fc.constant([]), { nil: undefined }),
});

// ============================================
// Property-Based Tests
// ============================================

describe('Empty State Handling - Property Tests', () => {
  /**
   * **Feature: fix-analytics-mock-data, Property 3: Empty state handling**
   * **Validates: Requirements 1.4, 2.2**
   *
   * For any API response with null or empty data, the components should
   * display appropriate empty state messages instead of zeros or mock data.
   */

  it('AreaChartStats shows empty state when total_leads is 0 and no history', () => {
    fc.assert(
      fc.property(
        emptyAreaChartDataArb,
        (data) => {
          const hasReal = areaChartHasRealData(data);
          expect(hasReal).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('AreaChartStats shows real data when total_leads > 0', () => {
    fc.assert(
      fc.property(
        realAreaChartDataArb,
        (data) => {
          const hasReal = areaChartHasRealData(data);
          expect(hasReal).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('AreaChartStats shows real data when history exists even with zero total_leads', () => {
    fc.assert(
      fc.property(
        zeroLeadsWithHistoryArb,
        (data) => {
          const hasReal = areaChartHasRealData(data);
          expect(hasReal).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('AreaChartStats shows empty state when data is undefined', () => {
    const hasReal = areaChartHasRealData(undefined);
    expect(hasReal).toBe(false);
  });

  it('Analytics page shows calculating banner when lastUpdate is null and refreshing', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        fc.constant(true),
        (lastUpdate, isRefreshing) => {
          expect(shouldShowCalculatingBanner(lastUpdate, isRefreshing)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Analytics page hides calculating banner when lastUpdate exists', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.boolean(),
        (lastUpdate, isRefreshing) => {
          expect(shouldShowCalculatingBanner(lastUpdate, isRefreshing)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Analytics page hides calculating banner when lastUpdate is null and not refreshing or calculating', () => {
    expect(shouldShowCalculatingBanner(null, false, false)).toBe(false);
  });

  it('mapCacheDataToChartFormat preserves zero total_leads from real data', () => {
    fc.assert(
      fc.property(
        fc.record({
          total_leads: fc.constant(0),
          conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
          em_atendimento: fc.constant(0),
          status_distribution: fc.constant({}),
          history: fc.constant([]),
          channels: fc.constant([]),
          sentiment_trend: fc.constant([]),
          objections: fc.constant([]),
          faq: fc.constant([]),
          transfer_rate: fc.constant(0),
          transfer_count: fc.constant(0),
          heatmap: fc.constant([]),
        }),
        (metrics) => {
          const mapped = mapCacheDataToChartFormat(metrics as any);
          // Should preserve the zero, not substitute mock data
          expect(mapped.total_leads).toBe(0);
          expect(mapped.history).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
