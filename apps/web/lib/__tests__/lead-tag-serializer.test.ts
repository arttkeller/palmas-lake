/**
 * Property-Based Tests for Lead Tag Serialization
 * 
 * Tests the serialization, parsing, and pretty-printing of lead tags.
 * Validates round-trip consistency for data integrity.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  serializeLeadTags,
  parseLeadTags,
  prettyPrintLeadTags,
  deserializeToLead,
  areLeadTagsEquivalent,
  LeadForSerialization,
  SerializedLeadTags,
  SERIALIZATION_VERSION,
} from '../lead-tag-serializer';
import { LeadTag, LeadTemperature, LeadTagCategory, TagCreator } from '../temperature-config';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid temperature values including null
 */
const temperatureArb: fc.Arbitrary<LeadTemperature> = fc.oneof(
  fc.constant('hot' as const),
  fc.constant('warm' as const),
  fc.constant('cold' as const),
  fc.constant(null)
);

/**
 * Generator for valid tag categories
 */
const tagCategoryArb: fc.Arbitrary<LeadTagCategory> = fc.constantFrom(
  'temperature',
  'interest',
  'behavior',
  'custom'
);

/**
 * Generator for tag creator
 */
const tagCreatorArb: fc.Arbitrary<TagCreator> = fc.constantFrom('ai', 'user');

/**
 * Generator for valid UUID-like strings
 */
const uuidArb = fc.uuid();

/**
 * Generator for non-empty strings (for names)
 */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

/**
 * Generator for optional tag value
 */
const optionalValueArb = fc.option(fc.string({ maxLength: 500 }), { nil: undefined });

/**
 * Generator for optional confidence score (0-1)
 */
const optionalConfidenceArb = fc.option(
  fc.double({ min: 0, max: 1, noNaN: true }),
  { nil: undefined }
);

/**
 * Generator for valid dates (not in the future, reasonable range)
 * Using integer timestamps to avoid NaN dates
 */
const validDateArb = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: Date.now(),
}).map(timestamp => new Date(timestamp));

/**
 * Generator for a single valid LeadTag
 */
const leadTagArb: fc.Arbitrary<LeadTag> = fc.record({
  id: uuidArb,
  leadId: uuidArb,
  name: nonEmptyStringArb,
  category: tagCategoryArb,
  value: optionalValueArb,
  confidence: optionalConfidenceArb,
  createdAt: validDateArb,
  createdBy: tagCreatorArb,
});

/**
 * Generator for array of lead tags (0-10 tags)
 */
const leadTagsArrayArb = fc.array(leadTagArb, { minLength: 0, maxLength: 10 });

/**
 * Generator for a valid LeadForSerialization object
 */
const leadForSerializationArb: fc.Arbitrary<LeadForSerialization> = fc.record({
  id: uuidArb,
  temperature: temperatureArb,
  aiTags: leadTagsArrayArb,
}).map(lead => ({
  ...lead,
  // Ensure all tags have the same leadId as the lead
  aiTags: lead.aiTags.map(tag => ({ ...tag, leadId: lead.id })),
}));

// ============================================
// Property-Based Tests
// ============================================

describe('Lead Tag Serialization - Property Tests', () => {
  /**
   * **Feature: lead-filters-tags-system, Property 11: Tag Serialization Round-Trip**
   * **Validates: Requirements 6.1, 6.2, 6.3**
   * 
   * For any valid lead tag object, serializing to JSON and then parsing back 
   * must produce an equivalent object with all properties preserved 
   * (temperature, custom tags, timestamps).
   */
  describe('Property 11: Tag Serialization Round-Trip', () => {
    it('should preserve all properties through serialize/parse round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);
            const restored = deserializeToLead(parsed);

            // Assert: Restored lead should be equivalent to original
            expect(areLeadTagsEquivalent(lead, restored)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve temperature classification through round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: Temperature should be preserved exactly
            expect(parsed.temperature).toBe(lead.temperature);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve tag count through round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: Tag count should be preserved
            expect(parsed.tags.length).toBe(lead.aiTags.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve tag names through round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: All tag names should be preserved
            const originalNames = lead.aiTags.map(t => t.name);
            const parsedNames = parsed.tags.map(t => t.name);
            expect(parsedNames).toEqual(originalNames);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve tag categories through round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: All tag categories should be preserved
            const originalCategories = lead.aiTags.map(t => t.category);
            const parsedCategories = parsed.tags.map(t => t.category);
            expect(parsedCategories).toEqual(originalCategories);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve timestamps through round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: All timestamps should be preserved (as ISO strings)
            lead.aiTags.forEach((tag, index) => {
              const originalTime = tag.createdAt.toISOString();
              const parsedTime = parsed.tags[index].createdAt;
              expect(parsedTime).toBe(originalTime);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve confidence scores through round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: All confidence scores should be preserved
            lead.aiTags.forEach((tag, index) => {
              expect(parsed.tags[index].confidence).toBe(tag.confidence);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve optional values through round-trip', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse back
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: All optional values should be preserved
            lead.aiTags.forEach((tag, index) => {
              expect(parsed.tags[index].value).toBe(tag.value);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce valid JSON output', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize
            const serialized = serializeLeadTags(lead);

            // Assert: Should be valid JSON
            expect(() => JSON.parse(serialized)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include version in serialized output', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: Version should be present
            expect(parsed.version).toBe(SERIALIZATION_VERSION);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include exportedAt timestamp in serialized output', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Serialize and parse
            const serialized = serializeLeadTags(lead);
            const parsed = parseLeadTags(serialized);

            // Assert: exportedAt should be a valid ISO date string
            expect(parsed.exportedAt).toBeDefined();
            expect(() => new Date(parsed.exportedAt)).not.toThrow();
            expect(new Date(parsed.exportedAt).toISOString()).toBe(parsed.exportedAt);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Pretty Print Functionality', () => {
    it('should include lead ID in pretty print output', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Pretty print
            const output = prettyPrintLeadTags(lead);

            // Assert: Lead ID should be in output
            expect(output).toContain(lead.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include temperature in pretty print output', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb,
          (lead) => {
            // Act: Pretty print
            const output = prettyPrintLeadTags(lead);

            // Assert: Temperature info should be in output
            expect(output).toContain('Temperature:');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all tag names in pretty print output', () => {
      fc.assert(
        fc.property(
          leadForSerializationArb.filter(lead => lead.aiTags.length > 0),
          (lead) => {
            // Act: Pretty print
            const output = prettyPrintLeadTags(lead);

            // Assert: All tag names should be in output
            lead.aiTags.forEach(tag => {
              expect(output).toContain(tag.name);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show "No tags assigned" for leads without tags', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: uuidArb,
            temperature: temperatureArb,
            aiTags: fc.constant([] as LeadTag[]),
          }),
          (lead) => {
            // Act: Pretty print
            const output = prettyPrintLeadTags(lead);

            // Assert: Should indicate no tags
            expect(output).toContain('No tags assigned');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid JSON input', () => {
      const invalidJsonStrings = [
        'not json',
        '{invalid}',
        '{"unclosed": ',
        '',
      ];

      invalidJsonStrings.forEach(invalid => {
        expect(() => parseLeadTags(invalid)).toThrow();
      });
    });

    it('should throw error for missing required fields', () => {
      const missingFields = [
        '{}',
        '{"version": "1.0.0"}',
        '{"version": "1.0.0", "leadId": "123"}',
        '{"version": "1.0.0", "leadId": "123", "tags": []}',
      ];

      missingFields.forEach(json => {
        expect(() => parseLeadTags(json)).toThrow();
      });
    });

    it('should throw error for invalid temperature values', () => {
      const invalidTemp = JSON.stringify({
        version: '1.0.0',
        leadId: '123',
        temperature: 'invalid',
        tags: [],
        exportedAt: new Date().toISOString(),
      });

      expect(() => parseLeadTags(invalidTemp)).toThrow();
    });

    it('should throw error for lead with empty id', () => {
      const leadWithEmptyId: LeadForSerialization = {
        id: '',
        temperature: 'hot',
        aiTags: [],
      };

      expect(() => serializeLeadTags(leadWithEmptyId)).toThrow();
    });

    it('should throw error for invalid tag category', () => {
      const invalidCategory = JSON.stringify({
        version: '1.0.0',
        leadId: '123',
        temperature: 'hot',
        tags: [{
          id: '456',
          name: 'test',
          category: 'invalid_category',
          createdAt: new Date().toISOString(),
          createdBy: 'ai',
        }],
        exportedAt: new Date().toISOString(),
      });

      expect(() => parseLeadTags(invalidCategory)).toThrow();
    });

    it('should throw error for invalid confidence score', () => {
      const invalidConfidence = JSON.stringify({
        version: '1.0.0',
        leadId: '123',
        temperature: 'hot',
        tags: [{
          id: '456',
          name: 'test',
          category: 'interest',
          confidence: 1.5, // Invalid: > 1
          createdAt: new Date().toISOString(),
          createdBy: 'ai',
        }],
        exportedAt: new Date().toISOString(),
      });

      expect(() => parseLeadTags(invalidConfidence)).toThrow();
    });
  });
});
