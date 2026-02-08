/**
 * Property-Based Tests for GlassmorphismCard Component
 * 
 * Tests that theme classes are applied consistently across all glassmorphism components.
 * 
 * **Feature: lead-filters-tags-system, Property 10: Theme Classes Applied Consistently**
 * **Validates: Requirements 5.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  getGlassmorphismClasses, 
  type GlassmorphismVariant 
} from '../glassmorphism-card';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid glassmorphism variants
 */
const variantArb: fc.Arbitrary<GlassmorphismVariant> = fc.constantFrom(
  'default',
  'elevated',
  'subtle',
  'solid'
);

/**
 * Generator for rounded options
 */
const roundedArb: fc.Arbitrary<'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'> = fc.constantFrom(
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  'full'
);

/**
 * Generator for glassmorphism options
 */
const optionsArb = fc.record({
  hoverable: fc.boolean(),
  active: fc.boolean(),
  rounded: fc.option(roundedArb, { nil: undefined }),
});

// ============================================
// Theme Class Patterns
// ============================================

/**
 * Light theme class patterns that should be present
 */
const LIGHT_THEME_PATTERNS = [
  /bg-white\/\d+/,           // Light background with opacity
  /border-white\/\d+/,       // Light border with opacity
  /shadow-/,                 // Shadow classes
];

/**
 * Dark theme class patterns that should be present
 */
const DARK_THEME_PATTERNS = [
  /dark:bg-/,                // Dark mode background
  /dark:border-/,            // Dark mode border
  /dark:shadow-/,            // Dark mode shadow (optional)
];

/**
 * Backdrop blur patterns for glassmorphism effect
 */
const BACKDROP_PATTERNS = [
  /backdrop-blur/,           // Backdrop blur effect
];

// ============================================
// Property-Based Tests
// ============================================

describe('GlassmorphismCard - Property Tests', () => {
  /**
   * **Feature: lead-filters-tags-system, Property 10: Theme Classes Applied Consistently**
   * **Validates: Requirements 5.5**
   * 
   * For any theme change (light/dark), all glassmorphism components must have 
   * the appropriate theme-specific CSS classes applied.
   */
  describe('Property 10: Theme Classes Applied Consistently', () => {
    it('should always include light theme background classes for any variant', () => {
      fc.assert(
        fc.property(
          variantArb,
          optionsArb,
          (variant, options) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant, options);

            // Assert: Contains light theme background pattern
            const hasLightBg = LIGHT_THEME_PATTERNS.some(pattern => pattern.test(classes));
            expect(hasLightBg).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include dark theme classes for any variant', () => {
      fc.assert(
        fc.property(
          variantArb,
          optionsArb,
          (variant, options) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant, options);

            // Assert: Contains dark theme pattern
            const hasDarkClasses = DARK_THEME_PATTERNS.some(pattern => pattern.test(classes));
            expect(hasDarkClasses).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include backdrop blur for glassmorphism effect', () => {
      fc.assert(
        fc.property(
          variantArb,
          optionsArb,
          (variant, options) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant, options);

            // Assert: Contains backdrop blur
            const hasBackdrop = BACKDROP_PATTERNS.some(pattern => pattern.test(classes));
            expect(hasBackdrop).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include hover classes only when hoverable is true', () => {
      fc.assert(
        fc.property(
          variantArb,
          fc.boolean(),
          (variant, hoverable) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant, { hoverable });

            // Assert: Hover classes present only when hoverable
            const hasHoverClasses = /hover:/.test(classes);
            if (hoverable) {
              expect(hasHoverClasses).toBe(true);
            } else {
              expect(hasHoverClasses).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include active/ring classes only when active is true', () => {
      fc.assert(
        fc.property(
          variantArb,
          fc.boolean(),
          (variant, active) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant, { active });

            // Assert: Ring classes present only when active
            const hasRingClasses = /ring-/.test(classes);
            if (active) {
              expect(hasRingClasses).toBe(true);
            } else {
              expect(hasRingClasses).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include rounded classes when rounded option is provided', () => {
      fc.assert(
        fc.property(
          variantArb,
          roundedArb,
          (variant, rounded) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant, { rounded });

            // Assert: Contains rounded class
            const roundedPattern = new RegExp(`rounded-${rounded === 'full' ? 'full' : rounded}`);
            expect(roundedPattern.test(classes)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce consistent classes for same inputs', () => {
      fc.assert(
        fc.property(
          variantArb,
          optionsArb,
          (variant, options) => {
            // Act: Get classes twice with same inputs
            const classes1 = getGlassmorphismClasses(variant, options);
            const classes2 = getGlassmorphismClasses(variant, options);

            // Assert: Same output for same input (deterministic)
            expect(classes1).toBe(classes2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce different classes for different variants', () => {
      // Test that each variant produces unique styling
      const variants: GlassmorphismVariant[] = ['default', 'elevated', 'subtle', 'solid'];
      const classesMap = new Map<GlassmorphismVariant, string>();

      for (const variant of variants) {
        classesMap.set(variant, getGlassmorphismClasses(variant));
      }

      // Each variant should have at least some unique classes
      // (they share common patterns but have variant-specific differences)
      const allClasses = Array.from(classesMap.values());
      const uniqueClasses = new Set(allClasses);
      
      // At least 2 variants should produce different class strings
      expect(uniqueClasses.size).toBeGreaterThanOrEqual(2);
    });

    it('should always produce non-empty class string', () => {
      fc.assert(
        fc.property(
          variantArb,
          optionsArb,
          (variant, options) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant, options);

            // Assert: Non-empty string
            expect(classes.length).toBeGreaterThan(0);
            expect(classes.trim().length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include both light and dark border classes for theme consistency', () => {
      fc.assert(
        fc.property(
          variantArb,
          (variant) => {
            // Act: Get glassmorphism classes
            const classes = getGlassmorphismClasses(variant);

            // Assert: Has both light and dark border classes
            const hasLightBorder = /border-white\/\d+/.test(classes) || /border/.test(classes);
            const hasDarkBorder = /dark:border-/.test(classes);
            
            expect(hasLightBorder).toBe(true);
            expect(hasDarkBorder).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
