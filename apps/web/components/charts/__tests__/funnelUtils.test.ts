/**
 * Property-Based Tests & Unit Tests for computeFunnelValues
 *
 * **Feature: fix-phantom-em-atendimento**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeFunnelValues, FunnelInput } from '../funnelUtils';

// ============================================
// Generators
// ============================================

const statusKeyArb = fc.constantFrom(
  'novo', 'new', 'novo_lead',
  'vendido', 'sold', 'proposta_enviada',
  'visita_agendada', 'visita_realizada', 'visit_scheduled',
);

const statusDistArb: fc.Arbitrary<Record<string, number>> = fc.dictionary(
  statusKeyArb,
  fc.integer({ min: 0, max: 500 }),
);

/**
 * Generator for FunnelInput where em_atendimento is explicitly 0.
 * total_leads can be anything >= 0.
 */
const inputWithZeroEmAtendimento: fc.Arbitrary<FunnelInput> = fc.record({
  total_leads: fc.integer({ min: 0, max: 10000 }),
  conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  status_distribution: fc.option(statusDistArb, { nil: undefined }),
  em_atendimento: fc.constant(0),
});

/**
 * Generator for FunnelInput where total_leads is 0.
 */
const inputWithZeroTotalLeads: fc.Arbitrary<FunnelInput> = fc.record({
  total_leads: fc.constant(0),
  conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
  status_distribution: fc.option(statusDistArb, { nil: undefined }),
  em_atendimento: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
});

/**
 * Generator for FunnelInput where total_leads > 0.
 */
const inputWithPositiveTotalLeads: fc.Arbitrary<FunnelInput> = fc.integer({ min: 1, max: 10000 }).chain(total =>
  fc.record({
    total_leads: fc.constant(total),
    conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
    status_distribution: fc.option(statusDistArb, { nil: undefined }),
    em_atendimento: fc.option(fc.integer({ min: 0, max: total }), { nil: undefined }),
  }),
);

/**
 * Generator for any valid FunnelInput (for round-trip test).
 */
const anyFunnelInput: fc.Arbitrary<FunnelInput> = fc.integer({ min: 0, max: 10000 }).chain(total =>
  fc.record({
    total_leads: fc.constant(total),
    conversion_rate: fc.float({ min: 0, max: 100, noNaN: true }),
    status_distribution: fc.option(statusDistArb, { nil: undefined }),
    em_atendimento: fc.option(fc.integer({ min: 0, max: Math.max(1, total) }), { nil: undefined }),
  }),
);

// ============================================
// Property-Based Tests
// ============================================

describe('computeFunnelValues - Property Tests', () => {

  /**
   * **Feature: fix-phantom-em-atendimento, Property 1: Zero em_atendimento is respected**
   * **Validates: Requirements 1.2**
   *
   * For any funnel input where em_atendimento is explicitly 0,
   * the computed contacted value must be 0.
   */
  it('Property 1: Zero em_atendimento is respected', () => {
    fc.assert(
      fc.property(inputWithZeroEmAtendimento, (input) => {
        const result = computeFunnelValues(input);
        expect(result.contacted).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: fix-phantom-em-atendimento, Property 2: Zero total_leads produces zero metrics**
   * **Validates: Requirements 1.3, 2.1**
   *
   * For any funnel input where total_leads is 0, all counts and ratios must be 0
   * and no division-by-zero error should occur.
   */
  it('Property 2: Zero total_leads produces zero metrics', () => {
    fc.assert(
      fc.property(inputWithZeroTotalLeads, (input) => {
        const result = computeFunnelValues(input);
        expect(result.total).toBe(0);
        expect(result.salesRatio).toBe(0);
        expect(result.scheduleRatio).toBe(0);
        expect(result.contactRatio).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: fix-phantom-em-atendimento, Property 3: Positive total_leads produces correct ratios**
   * **Validates: Requirements 2.2**
   *
   * For any funnel input where total_leads > 0, each ratio equals
   * the respective stage count divided by total_leads.
   */
  it('Property 3: Positive total_leads produces correct ratios', () => {
    fc.assert(
      fc.property(inputWithPositiveTotalLeads, (input) => {
        const result = computeFunnelValues(input);
        const t = result.total;

        expect(result.salesRatio).toBeCloseTo(result.sold / t, 10);
        expect(result.scheduleRatio).toBeCloseTo((result.scheduled + result.sold) / t, 10);
        expect(result.contactRatio).toBeCloseTo(result.contacted / t, 10);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: fix-phantom-em-atendimento, Property 4: Funnel computation round-trip**
   * **Validates: Requirements 3.1**
   *
   * For any valid funnel input, serializing the computed values to JSON
   * and deserializing should produce numerically identical results.
   */
  it('Property 4: Funnel computation round-trip', () => {
    fc.assert(
      fc.property(anyFunnelInput, (input) => {
        const result = computeFunnelValues(input);
        const serialized = JSON.stringify(result);
        const deserialized = JSON.parse(serialized);

        expect(deserialized.total).toBe(result.total);
        expect(deserialized.contacted).toBe(result.contacted);
        expect(deserialized.sold).toBe(result.sold);
        expect(deserialized.scheduled).toBe(result.scheduled);
        expect(deserialized.newLeads).toBe(result.newLeads);
        expect(deserialized.salesRatio).toBe(result.salesRatio);
        expect(deserialized.scheduleRatio).toBe(result.scheduleRatio);
        expect(deserialized.contactRatio).toBe(result.contactRatio);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================
// Unit Tests – Original Bug Scenario
// ============================================

describe('computeFunnelValues - Unit Tests (bug scenario)', () => {
  /**
   * Empty database: total_leads=0, em_atendimento=0 → contacted must be 0.
   * _Requirements: 1.1, 1.2_
   */
  it('empty database produces contacted=0', () => {
    const result = computeFunnelValues({
      total_leads: 0,
      conversion_rate: 0,
      status_distribution: {},
      em_atendimento: 0,
    });

    expect(result.contacted).toBe(0);
    expect(result.total).toBe(0);
    expect(result.salesRatio).toBe(0);
    expect(result.scheduleRatio).toBe(0);
    expect(result.contactRatio).toBe(0);
  });

  /**
   * em_atendimento=0 with positive total_leads → contacted must still be 0.
   * _Requirements: 1.1, 1.2_
   */
  it('em_atendimento=0 with positive total_leads produces contacted=0', () => {
    const result = computeFunnelValues({
      total_leads: 50,
      conversion_rate: 10,
      status_distribution: { novo: 20, vendido: 5 },
      em_atendimento: 0,
    });

    expect(result.contacted).toBe(0);
    expect(result.total).toBe(50);
  });
});
