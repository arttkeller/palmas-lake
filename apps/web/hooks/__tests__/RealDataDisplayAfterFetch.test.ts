/**
 * Property-Based Test for Real Data Display After Fetch
 *
 * **Feature: fix-analytics-data-display, Property 2: Real data display after fetch**
 * **Validates: Requirements 1.3**
 *
 * For any valid DashboardMetrics object with total_leads > 0, when passed
 * through mapCacheDataToChartFormat and into areaChartHasRealData, the
 * component SHALL recognize it as real data (not show "Sem dados disponíveis").
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { areaChartHasRealData } from '@/components/charts/AreaChartStats';
import { mapCacheDataToChartFormat } from '@/app/dashboard/analytics/page';
import type { DashboardMetrics } from '@/types/analytics-cache';

// ============================================
// Generator for DashboardMetrics with total_leads > 0
// ============================================

const dashboardMetricsWithLeadsArb: fc.Arbitrary<DashboardMetrics> = fc
  .integer({ min: 1, max: 100000 })
  .chain((total_leads) =>
    fc.record({
      total_leads: fc.constant(total_leads),
      conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
      em_atendimento: fc.integer({ min: 0, max: total_leads }),
      status_distribution: fc.oneof(
        fc.constant({} as Record<string, number>),
        fc.record({
          novo: fc.integer({ min: 0, max: Math.max(1, Math.floor(total_leads * 0.4)) }),
          vendido: fc.integer({ min: 0, max: Math.max(1, Math.floor(total_leads * 0.2)) }),
        })
      ),
      history: fc.array(
        fc.record({
          date: fc.integer({ min: 0, max: 365 }).map((d) => {
            const base = new Date('2025-01-01');
            base.setDate(base.getDate() + d);
            return base.toISOString().split('T')[0];
          }),
          leads: fc.integer({ min: 0, max: 1000 }),
        }),
        { minLength: 0, maxLength: 30 }
      ),
      heatmap: fc.constant([]),
      response_times: fc.constant({ ai_avg_seconds: 0, lead_avg_minutes: 0, history: [] }),
      objections: fc.constant([]),
      channels: fc.constant([]),
      faq: fc.constant([]),
      transfer_rate: fc.constant(0),
      transfer_count: fc.constant(0),
      sentiment_trend: fc.constant([]),
    })
  );

// ============================================
// Property-Based Test
// ============================================

describe('Real Data Display After Fetch - Property Test', () => {
  /**
   * **Feature: fix-analytics-data-display, Property 2: Real data display after fetch**
   * **Validates: Requirements 1.3**
   */
  it('for any DashboardMetrics with total_leads > 0, areaChartHasRealData returns true after mapping', () => {
    fc.assert(
      fc.property(dashboardMetricsWithLeadsArb, (metrics) => {
        // Step 1: Map through the same pipeline the page uses
        const mapped = mapCacheDataToChartFormat(metrics);

        // Step 2: The component should recognize this as real data
        const hasReal = areaChartHasRealData(mapped);

        // Property: total_leads > 0 means real data is present
        expect(hasReal).toBe(true);
        expect(mapped.total_leads).toBe(metrics.total_leads);
        expect(mapped.total_leads).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
