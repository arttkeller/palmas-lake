/**
 * Property-Based Tests for Analytics Cache Serialization
 * **Feature: realtime-analytics-cache, Property 9: Serialization round-trip consistency**
 * **Validates: Requirements 3.4, 3.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  DashboardMetrics,
  ResponseTimeMetrics,
  SentimentEntry,
} from '../analytics-cache';
import {
  serializeMetrics,
  deserializeMetrics,
} from '../analytics-cache';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for date strings in YYYY-MM-DD format
 * Uses integer-based generation to avoid invalid date issues
 */
const dateStringArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),  // year
  fc.integer({ min: 1, max: 12 }),        // month
  fc.integer({ min: 1, max: 28 })         // day (use 28 to avoid month-end issues)
).map(([year, month, day]) => 
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

/**
 * Generator for ResponseTimeMetrics
 * Constrains to realistic positive values
 */
const responseTimeHistoryEntryArb = fc.record({
  date: dateStringArb,
  ai_avg: fc.float({ min: 0, max: 120, noNaN: true }),
  lead_avg: fc.float({ min: 0, max: 60, noNaN: true }),
});

const responseTimeMetricsArb: fc.Arbitrary<ResponseTimeMetrics> = fc.record({
  ai_avg_seconds: fc.float({ min: 0, max: 120, noNaN: true }),
  lead_avg_minutes: fc.float({ min: 0, max: 60, noNaN: true }),
  history: fc.array(responseTimeHistoryEntryArb, { maxLength: 30 }),
});

/**
 * Generator for SentimentEntry
 * Constrains to valid date strings and percentages
 */
const sentimentEntryArb: fc.Arbitrary<SentimentEntry> = fc.record({
  date: dateStringArb,
  positive: fc.nat({ max: 100 }),
  neutral: fc.nat({ max: 100 }),
  negative: fc.nat({ max: 100 }),
});

/**
 * Generator for history entries
 */
const historyEntryArb = fc.record({
  date: dateStringArb,
  leads: fc.nat({ max: 10000 }),
});

/**
 * Generator for heatmap entries
 * dow: 0-6 (Sunday-Saturday), hour: 0-23
 */
const heatmapEntryArb = fc.record({
  dow: fc.integer({ min: 0, max: 6 }),
  hour: fc.integer({ min: 0, max: 23 }),
  value: fc.nat({ max: 1000 }),
});

/**
 * Generator for objection entries
 */
const objectionEntryArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  value: fc.nat({ max: 1000 }),
});

/**
 * Generator for hex color strings
 */
const hexColorArb = fc.array(
  fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'),
  { minLength: 6, maxLength: 6 }
).map(chars => `#${chars.join('')}`);

/**
 * Generator for channel entries with valid hex colors
 */
const channelEntryArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.nat({ max: 10000 }),
  color: hexColorArb,
});

/**
 * Generator for FAQ entries
 */
const faqEntryArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 200 }),
  value: fc.nat({ max: 10000 }),
});

/**
 * Generator for status distribution (Record<string, number>)
 */
const statusDistributionArb: fc.Arbitrary<Record<string, number>> = fc.dictionary(
  fc.constantFrom('novo_lead', 'qualificado', 'visita_agendada', 'visita_realizada', 'proposta_enviada', 'transferido'),
  fc.nat({ max: 1000 })
);

/**
 * Main generator for DashboardMetrics
 * Creates valid metrics objects with all required fields
 */
const dashboardMetricsArb: fc.Arbitrary<DashboardMetrics> = fc.record({
  total_leads: fc.nat({ max: 100000 }),
  conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  em_atendimento: fc.nat({ max: 10000 }),
  status_distribution: statusDistributionArb,
  history: fc.array(historyEntryArb, { maxLength: 365 }),
  heatmap: fc.array(heatmapEntryArb, { maxLength: 168 }), // 7 days * 24 hours
  response_times: responseTimeMetricsArb,
  objections: fc.array(objectionEntryArb, { maxLength: 20 }),
  channels: fc.array(channelEntryArb, { maxLength: 10 }),
  faq: fc.array(faqEntryArb, { maxLength: 50 }),
  transfer_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  transfer_count: fc.nat({ max: 10000 }),
  sentiment_trend: fc.array(sentimentEntryArb, { maxLength: 90 }),
});

// ============================================
// Property-Based Tests
// ============================================

describe('Analytics Cache - Serialization', () => {
  describe('Property 9: Serialization round-trip consistency', () => {
    /**
     * **Feature: realtime-analytics-cache, Property 9: Serialization round-trip consistency**
     * **Validates: Requirements 3.4, 3.5**
     * 
     * For any valid DashboardMetrics object, serializing to JSON and 
     * deserializing back SHALL produce an equivalent object.
     */
    it('should produce equivalent object after serialize/deserialize round-trip', () => {
      fc.assert(
        fc.property(
          dashboardMetricsArb,
          (metrics) => {
            // Act: Serialize then deserialize
            const serialized = serializeMetrics(metrics);
            const deserialized = deserializeMetrics(serialized);

            // Assert: Objects should be deeply equal
            expect(deserialized).toEqual(metrics);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Serialization should produce valid JSON string
     */
    it('should produce valid JSON string on serialization', () => {
      fc.assert(
        fc.property(
          dashboardMetricsArb,
          (metrics) => {
            // Act: Serialize
            const serialized = serializeMetrics(metrics);

            // Assert: Should be a non-empty string that can be parsed
            expect(typeof serialized).toBe('string');
            expect(serialized.length).toBeGreaterThan(0);
            expect(() => JSON.parse(serialized)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Deserialization should preserve all numeric values
     */
    it('should preserve numeric values after round-trip', () => {
      fc.assert(
        fc.property(
          dashboardMetricsArb,
          (metrics) => {
            // Act: Round-trip
            const serialized = serializeMetrics(metrics);
            const deserialized = deserializeMetrics(serialized);

            // Assert: Numeric values should be preserved
            expect(deserialized.total_leads).toBe(metrics.total_leads);
            expect(deserialized.em_atendimento).toBe(metrics.em_atendimento);
            expect(deserialized.transfer_count).toBe(metrics.transfer_count);
            expect(deserialized.conversion_rate).toBe(metrics.conversion_rate);
            expect(deserialized.transfer_rate).toBe(metrics.transfer_rate);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Deserialization should preserve array lengths
     */
    it('should preserve array lengths after round-trip', () => {
      fc.assert(
        fc.property(
          dashboardMetricsArb,
          (metrics) => {
            // Act: Round-trip
            const serialized = serializeMetrics(metrics);
            const deserialized = deserializeMetrics(serialized);

            // Assert: Array lengths should be preserved
            expect(deserialized.history.length).toBe(metrics.history.length);
            expect(deserialized.heatmap.length).toBe(metrics.heatmap.length);
            expect(deserialized.objections.length).toBe(metrics.objections.length);
            expect(deserialized.channels.length).toBe(metrics.channels.length);
            expect(deserialized.faq.length).toBe(metrics.faq.length);
            expect(deserialized.sentiment_trend.length).toBe(metrics.sentiment_trend.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Deserialization should preserve nested objects (response_times)
     */
    it('should preserve nested response_times object after round-trip', () => {
      fc.assert(
        fc.property(
          dashboardMetricsArb,
          (metrics) => {
            // Act: Round-trip
            const serialized = serializeMetrics(metrics);
            const deserialized = deserializeMetrics(serialized);

            // Assert: Nested response_times should be preserved
            expect(deserialized.response_times).toEqual(metrics.response_times);
            expect(deserialized.response_times.ai_avg_seconds).toBe(metrics.response_times.ai_avg_seconds);
            expect(deserialized.response_times.lead_avg_minutes).toBe(metrics.response_times.lead_avg_minutes);
            expect(deserialized.response_times.history).toEqual(metrics.response_times.history);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Deserialization should preserve status_distribution Record
     */
    it('should preserve status_distribution record after round-trip', () => {
      fc.assert(
        fc.property(
          dashboardMetricsArb,
          (metrics) => {
            // Act: Round-trip
            const serialized = serializeMetrics(metrics);
            const deserialized = deserializeMetrics(serialized);

            // Assert: status_distribution should be preserved
            expect(deserialized.status_distribution).toEqual(metrics.status_distribution);
            expect(Object.keys(deserialized.status_distribution).length)
              .toBe(Object.keys(metrics.status_distribution).length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
