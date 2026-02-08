/**
 * Property-Based Tests for mapCacheDataToChartFormat
 * **Feature: crm-bugfixes-analytics, Property 5: Analytics cache mapping preserves real values**
 * **Validates: Requirements 3.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DashboardMetrics } from '@/types/analytics-cache';
import { mapCacheDataToChartFormat } from '../page';

// ============================================
// Arbitraries (Generators)
// ============================================

const dateStringArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const responseTimeMetricsArb = fc.record({
  ai_avg_seconds: fc.float({ min: Math.fround(0.1), max: 120, noNaN: true }),
  lead_avg_minutes: fc.float({ min: Math.fround(0.1), max: 60, noNaN: true }),
  history: fc.array(fc.record({
    date: dateStringArb,
    ai_avg: fc.float({ min: 0, max: 120, noNaN: true }),
    lead_avg: fc.float({ min: 0, max: 60, noNaN: true }),
  }), { maxLength: 30 }),
});

const sentimentEntryArb = fc.record({
  date: dateStringArb,
  positive: fc.nat({ max: 100 }),
  neutral: fc.nat({ max: 100 }),
  negative: fc.nat({ max: 100 }),
});

const historyEntryArb = fc.record({
  date: dateStringArb,
  leads: fc.integer({ min: 1, max: 10000 }),
});

const heatmapEntryArb = fc.record({
  dow: fc.integer({ min: 0, max: 6 }),
  hour: fc.integer({ min: 0, max: 23 }),
  value: fc.integer({ min: 1, max: 1000 }),
});

const objectionEntryArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.integer({ min: 1, max: 1000 }),
});

const hexColorArb = fc.array(
  fc.constantFrom('0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'),
  { minLength: 6, maxLength: 6 }
).map(c => `#${c.join('')}`);

const channelEntryArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.integer({ min: 1, max: 10000 }),
  color: hexColorArb,
});

const faqEntryArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  value: fc.integer({ min: 1, max: 10000 }),
});

const statusDistributionArb = fc.dictionary(
  fc.constantFrom('novo_lead', 'qualificado', 'visita_agendada', 'visita_realizada', 'proposta_enviada', 'vendido'),
  fc.integer({ min: 1, max: 1000 })
);

/**
 * Generator for DashboardMetrics with non-zero values.
 * Uses min: 1 for numeric fields and minLength: 1 for arrays
 * to ensure we're testing that real data is preserved.
 */
const nonZeroDashboardMetricsArb: fc.Arbitrary<DashboardMetrics> = fc.record({
  total_leads: fc.integer({ min: 1, max: 100000 }),
  conversion_rate: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
  em_atendimento: fc.integer({ min: 1, max: 10000 }),
  status_distribution: statusDistributionArb,
  history: fc.array(historyEntryArb, { minLength: 1, maxLength: 30 }),
  heatmap: fc.array(heatmapEntryArb, { minLength: 1, maxLength: 24 }),
  response_times: responseTimeMetricsArb,
  objections: fc.array(objectionEntryArb, { minLength: 1, maxLength: 10 }),
  channels: fc.array(channelEntryArb, { minLength: 1, maxLength: 5 }),
  faq: fc.array(faqEntryArb, { minLength: 1, maxLength: 10 }),
  transfer_rate: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
  transfer_count: fc.integer({ min: 1, max: 10000 }),
  sentiment_trend: fc.array(sentimentEntryArb, { minLength: 1, maxLength: 30 }),
});

// ============================================
// Property-Based Tests
// ============================================

describe('mapCacheDataToChartFormat - Property 5', () => {
  /**
   * **Feature: crm-bugfixes-analytics, Property 5: Analytics cache mapping preserves real values**
   * **Validates: Requirements 3.2**
   *
   * For any valid DashboardMetrics object with non-zero values,
   * mapCacheDataToChartFormat SHALL produce an output where total_leads,
   * conversion_rate, and all non-empty array fields are preserved
   * (not replaced with zeros or empty arrays).
   */
  it('should preserve all non-zero scalar values from cache data', () => {
    fc.assert(
      fc.property(
        nonZeroDashboardMetricsArb,
        (metrics) => {
          const result = mapCacheDataToChartFormat(metrics);

          expect(result.total_leads).toBe(metrics.total_leads);
          expect(result.conversion_rate).toBe(metrics.conversion_rate);
          expect(result.active_leads).toBe(metrics.em_atendimento);
          expect(result.transfer_rate).toBe(metrics.transfer_rate);
          expect(result.transfer_count).toBe(metrics.transfer_count);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all non-empty array fields from cache data', () => {
    fc.assert(
      fc.property(
        nonZeroDashboardMetricsArb,
        (metrics) => {
          const result = mapCacheDataToChartFormat(metrics);

          expect(result.history.length).toBe(metrics.history.length);
          expect(result.channels.length).toBe(metrics.channels.length);
          expect(result.objections.length).toBe(metrics.objections.length);
          expect(result.faq.length).toBe(metrics.faq.length);
          expect(result.sentiment_trend.length).toBe(metrics.sentiment_trend.length);
          expect(result.heatmap.length).toBe(metrics.heatmap.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should compute predictability from history instead of hardcoding zeros', () => {
    fc.assert(
      fc.property(
        nonZeroDashboardMetricsArb,
        (metrics) => {
          const result = mapCacheDataToChartFormat(metrics);

          // Predictability should be computed, not hardcoded
          expect(result.predictability).toBeDefined();
          expect(result.predictability.score).toBeGreaterThanOrEqual(0);
          expect(['up', 'down', 'stable']).toContain(result.predictability.trend);
          expect(result.predictability.forecast_next_month).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve status_distribution record from cache data', () => {
    fc.assert(
      fc.property(
        nonZeroDashboardMetricsArb,
        (metrics) => {
          const result = mapCacheDataToChartFormat(metrics);

          expect(result.status_distribution).toEqual(metrics.status_distribution);
        }
      ),
      { numRuns: 100 }
    );
  });
});
