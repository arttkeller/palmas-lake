import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapCacheDataToChartFormat } from './page';
import type { DashboardMetrics } from '@/types/analytics-cache';

/**
 * Arbitrary generator for DashboardMetrics objects.
 * Generates realistic cache data with all required fields.
 */
const dashboardMetricsArb = fc.record({
  total_leads: fc.nat({ max: 10000 }),
  conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  em_atendimento: fc.nat({ max: 10000 }),
  status_distribution: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.nat({ max: 500 })
  ),
  history: fc.array(
    fc.record({
      date: fc.integer({ min: 0, max: 1000 }).map(d => {
        const base = new Date('2024-01-01');
        base.setDate(base.getDate() + d);
        return base.toISOString().split('T')[0];
      }),
      leads: fc.nat({ max: 500 }),
    }),
    { maxLength: 30 }
  ),
  heatmap: fc.array(
    fc.record({
      dow: fc.integer({ min: 0, max: 6 }),
      hour: fc.integer({ min: 0, max: 23 }),
      value: fc.nat({ max: 100 }),
    }),
    { maxLength: 50 }
  ),
  response_times: fc.record({
    ai_avg_seconds: fc.float({ min: 0, max: 120, noNaN: true }),
    lead_avg_minutes: fc.float({ min: 0, max: 60, noNaN: true }),
    history: fc.array(
      fc.record({
        date: fc.integer({ min: 0, max: 365 }).map(d => {
          const base = new Date('2024-01-01');
          base.setDate(base.getDate() + d);
          return base.toISOString().split('T')[0];
        }),
        ai_avg: fc.float({ min: 0, max: 120, noNaN: true }),
        lead_avg: fc.float({ min: 0, max: 60, noNaN: true }),
      }),
      { maxLength: 30 }
    ),
  }),
  objections: fc.array(fc.record({ name: fc.string({ minLength: 1, maxLength: 30 }), value: fc.nat({ max: 100 }) }), { maxLength: 10 }),
  channels: fc.array(fc.record({ name: fc.string({ minLength: 1, maxLength: 20 }), value: fc.nat({ max: 1000 }), color: fc.constant('#3b82f6') }), { maxLength: 5 }),
  faq: fc.array(fc.record({ name: fc.string({ minLength: 1, maxLength: 50 }), value: fc.nat({ max: 200 }) }), { maxLength: 10 }),
  transfer_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  transfer_count: fc.nat({ max: 1000 }),
  sentiment_trend: fc.array(
    fc.record({
      date: fc.integer({ min: 0, max: 1000 }).map(d => {
        const base = new Date('2024-01-01');
        base.setDate(base.getDate() + d);
        return base.toISOString().split('T')[0];
      }),
      positive: fc.nat({ max: 100 }),
      neutral: fc.nat({ max: 100 }),
      negative: fc.nat({ max: 100 }),
    }),
    { maxLength: 30 }
  ),
}) as fc.Arbitrary<DashboardMetrics>;

describe('mapCacheDataToChartFormat', () => {
  /**
   * **Feature: fix-crm-analytics-bugs, Property 1: mapCacheDataToChartFormat preserves em_atendimento**
   * **Validates: Requirements 1.1, 1.3**
   *
   * For any DashboardMetrics object with an em_atendimento value,
   * the output em_atendimento SHALL equal the input em_atendimento,
   * and the output SHALL NOT inflate the contacted count by adding scheduled or sold counts.
   */
  it('preserves em_atendimento from input without inflation', () => {
    fc.assert(
      fc.property(dashboardMetricsArb, (metrics) => {
        const result = mapCacheDataToChartFormat(metrics);

        // em_atendimento must be preserved exactly
        expect(result.em_atendimento).toBe(metrics.em_atendimento || 0);

        // active_leads should also match em_atendimento
        expect(result.active_leads).toBe(metrics.em_atendimento || 0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: fix-crm-analytics-bugs, Property 4: Response time mapping preserves backend values**
   * **Validates: Requirements 4.2**
   *
   * For any cached analytics data containing response_times with ai_avg_seconds,
   * lead_avg_minutes, and history, the mapCacheDataToChartFormat function SHALL
   * produce output where those values are preserved.
   */
  it('preserves backend response_times values (ai_avg_seconds, lead_avg_minutes, history)', () => {
    const backendResponseTimesArb = fc.record({
      ai_avg_seconds: fc.float({ min: 0, max: 60, noNaN: true }),
      lead_avg_minutes: fc.float({ min: 0, max: 120, noNaN: true }),
      history: fc.array(
        fc.record({
          date: fc.integer({ min: 0, max: 365 }).map(d => {
            const base = new Date('2025-01-01');
            base.setDate(base.getDate() + d);
            return base.toISOString().split('T')[0];
          }),
          ai_avg: fc.float({ min: 0, max: 60, noNaN: true }),
          lead_avg: fc.float({ min: 0, max: 120, noNaN: true }),
        }),
        { maxLength: 30 }
      ),
    });

    fc.assert(
      fc.property(dashboardMetricsArb, backendResponseTimesArb, (metrics, backendRT) => {
        const metricsWithBackendRT = {
          ...metrics,
          response_times: backendRT,
        };

        const result = mapCacheDataToChartFormat(metricsWithBackendRT);

        expect(result.response_times.ai_avg_seconds).toBe(backendRT.ai_avg_seconds);
        expect(result.response_times.lead_avg_minutes).toBe(backendRT.lead_avg_minutes);
        expect(result.response_times.history).toEqual(backendRT.history);
      }),
      { numRuns: 100 }
    );
  });
});
