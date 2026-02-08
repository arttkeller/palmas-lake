/**
 * Property-Based Tests for Classification History
 * 
 * Tests the classification history tracking system.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createHistoryEntry,
  isHistoryPreserved,
  requiresHistoryTracking,
  type CreateHistoryInput,
} from '../classification-history';
import type { LeadTemperature, NonNullLeadTemperature } from '@/lib/temperature-config';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid non-null temperature values
 */
const validTemperatureArb: fc.Arbitrary<NonNullLeadTemperature> = fc.constantFrom(
  'hot',
  'warm',
  'cold'
);

/**
 * Generator for all temperature values including null
 */
const temperatureArb: fc.Arbitrary<LeadTemperature> = fc.oneof(
  validTemperatureArb,
  fc.constant(null)
);

/**
 * Generator for valid UUIDs
 */
const uuidArb = fc.uuid();

/**
 * Generator for optional reason strings
 */
const reasonArb = fc.option(
  fc.string({ minLength: 1, maxLength: 500 }),
  { nil: undefined }
);

/**
 * Generator for classification history input
 */
const historyInputArb: fc.Arbitrary<CreateHistoryInput> = fc.record({
  leadId: uuidArb,
  previousTemperature: temperatureArb,
  newTemperature: temperatureArb,
  reason: reasonArb,
});

/**
 * Generator for temperature change pairs (different temperatures)
 */
const temperatureChangePairArb = fc.tuple(temperatureArb, temperatureArb).filter(
  ([prev, next]) => prev !== next
);

/**
 * Generator for same temperature pairs (no change)
 */
const sameTemperaturePairArb = temperatureArb.map(temp => [temp, temp] as const);

// ============================================
// Property-Based Tests
// ============================================

describe('Classification History - Property Tests', () => {
  /**
   * **Feature: lead-filters-tags-system, Property 9: Classification History Preserved**
   * **Validates: Requirements 4.4**
   * 
   * For any temperature classification update, the previous classification value 
   * must be stored in the classification history table before the update is applied.
   */
  describe('Property 9: Classification History Preserved', () => {
    it('should preserve previous temperature in history entry', () => {
      fc.assert(
        fc.property(
          historyInputArb,
          (input) => {
            // Act: Create a history entry
            const historyEntry = createHistoryEntry(input);

            // Assert: Previous temperature should be preserved
            expect(isHistoryPreserved(historyEntry, input.previousTemperature)).toBe(true);
            expect(historyEntry.previousTemperature).toBe(input.previousTemperature);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should store new temperature in history entry', () => {
      fc.assert(
        fc.property(
          historyInputArb,
          (input) => {
            // Act: Create a history entry
            const historyEntry = createHistoryEntry(input);

            // Assert: New temperature should be stored
            expect(historyEntry.newTemperature).toBe(input.newTemperature);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve lead ID in history entry', () => {
      fc.assert(
        fc.property(
          historyInputArb,
          (input) => {
            // Act: Create a history entry
            const historyEntry = createHistoryEntry(input);

            // Assert: Lead ID should be preserved
            expect(historyEntry.leadId).toBe(input.leadId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve reason in history entry', () => {
      fc.assert(
        fc.property(
          historyInputArb,
          (input) => {
            // Act: Create a history entry
            const historyEntry = createHistoryEntry(input);

            // Assert: Reason should be preserved
            expect(historyEntry.reason).toBe(input.reason);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate valid timestamp for history entry', () => {
      fc.assert(
        fc.property(
          historyInputArb,
          (input) => {
            const before = new Date();
            
            // Act: Create a history entry
            const historyEntry = createHistoryEntry(input);
            
            const after = new Date();

            // Assert: Timestamp should be valid and recent
            expect(historyEntry.changedAt).toBeInstanceOf(Date);
            expect(historyEntry.changedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(historyEntry.changedAt.getTime()).toBeLessThanOrEqual(after.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique IDs for each history entry', () => {
      fc.assert(
        fc.property(
          fc.array(historyInputArb, { minLength: 2, maxLength: 10 }),
          (inputs) => {
            // Act: Create multiple history entries
            const entries = inputs.map(input => createHistoryEntry(input));
            const ids = entries.map(entry => entry.id);

            // Assert: All IDs should be unique
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('History Tracking Requirements', () => {
    it('should require history tracking when temperature changes', () => {
      fc.assert(
        fc.property(
          temperatureChangePairArb,
          ([previousTemp, newTemp]) => {
            // Act: Check if history tracking is required
            const required = requiresHistoryTracking(previousTemp, newTemp);

            // Assert: Should require tracking for different temperatures
            expect(required).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not require history tracking when temperature stays the same', () => {
      fc.assert(
        fc.property(
          sameTemperaturePairArb,
          ([previousTemp, newTemp]) => {
            // Act: Check if history tracking is required
            const required = requiresHistoryTracking(previousTemp, newTemp);

            // Assert: Should not require tracking for same temperature
            expect(required).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Temperature Transition Tracking', () => {
    it('should track all possible temperature transitions', () => {
      const allTemperatures: LeadTemperature[] = ['hot', 'warm', 'cold', null];
      
      // Generate all possible transitions
      const transitions: Array<[LeadTemperature, LeadTemperature]> = [];
      for (const from of allTemperatures) {
        for (const to of allTemperatures) {
          if (from !== to) {
            transitions.push([from, to]);
          }
        }
      }

      // Test each transition
      for (const [from, to] of transitions) {
        const input: CreateHistoryInput = {
          leadId: crypto.randomUUID(),
          previousTemperature: from,
          newTemperature: to,
          reason: `Transition from ${from} to ${to}`,
        };

        const historyEntry = createHistoryEntry(input);

        // Assert: History should correctly record the transition
        expect(historyEntry.previousTemperature).toBe(from);
        expect(historyEntry.newTemperature).toBe(to);
        expect(requiresHistoryTracking(from, to)).toBe(true);
      }
    });

    it('should handle null to non-null transitions', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (newTemp) => {
            const input: CreateHistoryInput = {
              leadId: crypto.randomUUID(),
              previousTemperature: null,
              newTemperature: newTemp,
              reason: 'Initial classification',
            };

            // Act: Create history entry
            const historyEntry = createHistoryEntry(input);

            // Assert: Should correctly record null to non-null transition
            expect(historyEntry.previousTemperature).toBeNull();
            expect(historyEntry.newTemperature).toBe(newTemp);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle non-null to null transitions', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (previousTemp) => {
            const input: CreateHistoryInput = {
              leadId: crypto.randomUUID(),
              previousTemperature: previousTemp,
              newTemperature: null,
              reason: 'Classification removed',
            };

            // Act: Create history entry
            const historyEntry = createHistoryEntry(input);

            // Assert: Should correctly record non-null to null transition
            expect(historyEntry.previousTemperature).toBe(previousTemp);
            expect(historyEntry.newTemperature).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isHistoryPreserved Validation', () => {
    it('should return true when previous temperature matches', () => {
      fc.assert(
        fc.property(
          historyInputArb,
          (input) => {
            const historyEntry = createHistoryEntry(input);

            // Assert: Should return true for matching previous temperature
            expect(isHistoryPreserved(historyEntry, input.previousTemperature)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when previous temperature does not match', () => {
      fc.assert(
        fc.property(
          historyInputArb,
          temperatureArb,
          (input, differentTemp) => {
            // Skip if temperatures happen to match
            fc.pre(differentTemp !== input.previousTemperature);

            const historyEntry = createHistoryEntry(input);

            // Assert: Should return false for non-matching previous temperature
            expect(isHistoryPreserved(historyEntry, differentTemp)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
