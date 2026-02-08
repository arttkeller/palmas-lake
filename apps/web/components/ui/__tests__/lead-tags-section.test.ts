/**
 * Property-Based Tests for LeadTagsSection Component
 * 
 * Tests that the modal displays all AI-generated tags correctly.
 * 
 * **Feature: lead-filters-tags-system, Property 7: Modal Displays All Tags**
 * **Validates: Requirements 3.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { LeadTag, LeadTagCategory, TagCreator } from '@/lib/temperature-config';
import { groupTagsByCategory, extractLeadTags } from '../lead-tags-section';

// ============================================
// Arbitraries (Generators)
// ============================================

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
 * Generator for tag creator type
 */
const tagCreatorArb: fc.Arbitrary<TagCreator> = fc.constantFrom('ai', 'user');

/**
 * Generator for confidence score (0-1)
 */
const confidenceArb: fc.Arbitrary<number> = fc.float({ min: 0, max: 1, noNaN: true });

/**
 * Generator for a valid LeadTag
 */
const leadTagArb: fc.Arbitrary<LeadTag> = fc.record({
  id: fc.uuid(),
  leadId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  category: tagCategoryArb,
  value: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  confidence: fc.option(confidenceArb, { nil: undefined }),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
  createdBy: tagCreatorArb,
});

/**
 * Generator for an array of LeadTags (0-20 tags)
 */
const leadTagsArrayArb: fc.Arbitrary<LeadTag[]> = fc.array(leadTagArb, { minLength: 0, maxLength: 20 });

/**
 * Generator for a lead with AI tags
 */
const leadWithTagsArb = fc.record({
  aiTags: fc.option(leadTagsArrayArb, { nil: undefined }),
});

// ============================================
// Property-Based Tests
// ============================================

describe('LeadTagsSection - Property Tests', () => {
  /**
   * **Feature: lead-filters-tags-system, Property 7: Modal Displays All Tags**
   * **Validates: Requirements 3.2**
   * 
   * For any lead with AI-generated tags, when the modal opens, all tags 
   * associated with that lead must be visible in the tags section.
   */
  describe('Property 7: Modal Displays All Tags', () => {
    it('should group all tags by category without losing any', () => {
      fc.assert(
        fc.property(
          leadTagsArrayArb,
          (tags) => {
            // Act: Group tags by category
            const grouped = groupTagsByCategory(tags);

            // Assert: Total count of grouped tags equals original count
            const totalGrouped = Object.values(grouped).reduce(
              (sum, categoryTags) => sum + categoryTags.length,
              0
            );
            expect(totalGrouped).toBe(tags.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all tag properties when grouping', () => {
      fc.assert(
        fc.property(
          leadTagsArrayArb,
          (tags) => {
            // Act: Group tags by category
            const grouped = groupTagsByCategory(tags);

            // Flatten grouped tags back
            const flattenedTags = Object.values(grouped).flat();

            // Assert: Each original tag exists in grouped result with same properties
            for (const originalTag of tags) {
              const foundTag = flattenedTags.find(t => t.id === originalTag.id);
              expect(foundTag).toBeDefined();
              expect(foundTag?.name).toBe(originalTag.name);
              expect(foundTag?.category).toBe(originalTag.category);
              expect(foundTag?.createdBy).toBe(originalTag.createdBy);
              expect(foundTag?.value).toBe(originalTag.value);
              expect(foundTag?.confidence).toBe(originalTag.confidence);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should place each tag in its correct category', () => {
      fc.assert(
        fc.property(
          leadTagsArrayArb,
          (tags) => {
            // Act: Group tags by category
            const grouped = groupTagsByCategory(tags);

            // Assert: Each tag is in its correct category
            for (const [category, categoryTags] of Object.entries(grouped)) {
              for (const tag of categoryTags) {
                expect(tag.category).toBe(category);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract tags from lead correctly', () => {
      fc.assert(
        fc.property(
          leadWithTagsArb,
          (lead) => {
            // Act: Extract tags from lead
            const extractedTags = extractLeadTags(lead);

            // Assert: Extracted tags match lead's aiTags (or empty array if undefined)
            const expectedTags = lead.aiTags || [];
            expect(extractedTags).toEqual(expectedTags);
            expect(extractedTags.length).toBe(expectedTags.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty tags array', () => {
      // Act: Group empty array
      const grouped = groupTagsByCategory([]);

      // Assert: All categories exist but are empty
      expect(grouped.temperature).toEqual([]);
      expect(grouped.interest).toEqual([]);
      expect(grouped.behavior).toEqual([]);
      expect(grouped.custom).toEqual([]);
    });

    it('should handle lead with undefined aiTags', () => {
      // Act: Extract tags from lead with undefined aiTags
      const extractedTags = extractLeadTags({});

      // Assert: Returns empty array
      expect(extractedTags).toEqual([]);
    });

    it('should maintain tag order within each category', () => {
      fc.assert(
        fc.property(
          leadTagsArrayArb,
          (tags) => {
            // Act: Group tags by category
            const grouped = groupTagsByCategory(tags);

            // For each category, verify order is preserved
            for (const category of ['temperature', 'interest', 'behavior', 'custom'] as LeadTagCategory[]) {
              const originalCategoryTags = tags.filter(t => t.category === category);
              const groupedCategoryTags = grouped[category];

              // Assert: Same length
              expect(groupedCategoryTags.length).toBe(originalCategoryTags.length);

              // Assert: Same order (by checking IDs in sequence)
              for (let i = 0; i < originalCategoryTags.length; i++) {
                expect(groupedCategoryTags[i].id).toBe(originalCategoryTags[i].id);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include confidence scores when present', () => {
      fc.assert(
        fc.property(
          leadTagsArrayArb.filter(tags => tags.some(t => t.confidence !== undefined)),
          (tags) => {
            // Act: Group tags
            const grouped = groupTagsByCategory(tags);
            const allGroupedTags = Object.values(grouped).flat();

            // Assert: Tags with confidence scores retain them
            for (const originalTag of tags) {
              if (originalTag.confidence !== undefined) {
                const foundTag = allGroupedTags.find(t => t.id === originalTag.id);
                expect(foundTag?.confidence).toBe(originalTag.confidence);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
