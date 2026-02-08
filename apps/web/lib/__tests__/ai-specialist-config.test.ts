/**
 * Property-Based Tests for AI Specialist Configuration
 * 
 * **Feature: ui-redesign-ai-specialists, Property 6: Message Dock Icon Consistency**
 * **Validates: Requirements 5.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  aiSpecialistConfigs,
  getAISpecialistByPath,
  getAISpecialistByContextType,
  getAllAISpecialists,
  getAISpecialistPaths,
  hasAISpecialist,
  type AIContextType,
  type AISpecialistConfig,
} from '../ai-specialist-config';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid AI specialist paths
 */
const aiSpecialistPathArb = fc.constantFrom(
  '/dashboard/quadro',
  '/dashboard/chat',
  '/dashboard/leads',
  '/dashboard/agendamentos',
  '/dashboard/analytics'
);

/**
 * Generator for valid context types
 */
const contextTypeArb = fc.constantFrom(
  'crm',
  'chat',
  'leads',
  'agendamentos',
  'analytics'
) as fc.Arbitrary<AIContextType>;

/**
 * Generator for sub-paths
 */
const subPathArb = fc.stringMatching(/^\/[a-z0-9-]+$/);

/**
 * Generator for invalid paths (paths without AI specialists)
 */
const invalidPathArb = fc.constantFrom(
  '/dashboard/settings',
  '/login',
  '/register',
  '/',
  '/about',
  '/dashboard'
);

// ============================================
// Expected Configuration Data
// ============================================

const expectedConfigs: Record<string, { emoji: string; section: string; contextType: AIContextType }> = {
  '/dashboard/quadro': { emoji: '📊', section: 'CRM', contextType: 'crm' },
  '/dashboard/chat': { emoji: '💬', section: 'Conversas', contextType: 'chat' },
  '/dashboard/leads': { emoji: '👥', section: 'Leads', contextType: 'leads' },
  '/dashboard/agendamentos': { emoji: '📅', section: 'Agendamentos', contextType: 'agendamentos' },
  '/dashboard/analytics': { emoji: '📈', section: 'Análises', contextType: 'analytics' },
};

// ============================================
// Property-Based Tests
// ============================================

describe('AI Specialist Configuration - Property Tests', () => {
  describe('Property 6: Message Dock Icon Consistency', () => {
    /**
     * **Feature: ui-redesign-ai-specialists, Property 6: Message Dock Icon Consistency**
     * **Validates: Requirements 5.3**
     *
     * For any section of the system, the Message Dock SHALL display the
     * icon/emoji corresponding to that specific section, as defined in the configuration.
     */
    it('should return the correct emoji for each section path', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            // Act: Get the config for this path
            const config = getAISpecialistByPath(path);

            // Assert: Config should exist
            expect(config).toBeDefined();

            // Assert: Emoji should match expected
            const expected = expectedConfigs[path];
            expect(config?.emoji).toBe(expected.emoji);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return the correct section name for each path', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            // Act: Get the config for this path
            const config = getAISpecialistByPath(path);

            // Assert: Section name should match expected
            const expected = expectedConfigs[path];
            expect(config?.section).toBe(expected.section);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return the correct context type for each path', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            // Act: Get the config for this path
            const config = getAISpecialistByPath(path);

            // Assert: Context type should match expected
            const expected = expectedConfigs[path];
            expect(config?.contextType).toBe(expected.contextType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain icon consistency for sub-routes', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          subPathArb,
          (basePath, subPath) => {
            // Arrange: Create a sub-route
            const fullPath = basePath + subPath;

            // Act: Get configs for both paths
            const baseConfig = getAISpecialistByPath(basePath);
            const subRouteConfig = getAISpecialistByPath(fullPath);

            // Assert: Sub-route should have same config as base
            expect(subRouteConfig).toBeDefined();
            expect(subRouteConfig?.emoji).toBe(baseConfig?.emoji);
            expect(subRouteConfig?.section).toBe(baseConfig?.section);
            expect(subRouteConfig?.contextType).toBe(baseConfig?.contextType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have unique emoji for each section', () => {
      // Get all emojis
      const allConfigs = getAllAISpecialists();
      const emojis = allConfigs.map(c => c.emoji);
      const uniqueEmojis = new Set(emojis);

      // Assert: All emojis should be unique
      expect(uniqueEmojis.size).toBe(emojis.length);
    });

    it('should have unique context type for each section', () => {
      // Get all context types
      const allConfigs = getAllAISpecialists();
      const contextTypes = allConfigs.map(c => c.contextType);
      const uniqueContextTypes = new Set(contextTypes);

      // Assert: All context types should be unique
      expect(uniqueContextTypes.size).toBe(contextTypes.length);
    });
  });

  describe('AI Specialist Path Matching', () => {
    it('should return undefined for paths without AI specialists', () => {
      fc.assert(
        fc.property(
          invalidPathArb,
          (path) => {
            // Act: Get the config for invalid path
            const config = getAISpecialistByPath(path);

            // Assert: Should return undefined
            expect(config).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify paths with AI specialists', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            // Act: Check if path has specialist
            const hasSpec = hasAISpecialist(path);

            // Assert: Should return true
            expect(hasSpec).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify paths without AI specialists', () => {
      fc.assert(
        fc.property(
          invalidPathArb,
          (path) => {
            // Act: Check if path has specialist
            const hasSpec = hasAISpecialist(path);

            // Assert: Should return false
            expect(hasSpec).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('AI Specialist Context Type Lookup', () => {
    it('should find config by context type', () => {
      fc.assert(
        fc.property(
          contextTypeArb,
          (contextType) => {
            // Act: Get config by context type
            const config = getAISpecialistByContextType(contextType);

            // Assert: Should find a config
            expect(config).toBeDefined();
            expect(config?.contextType).toBe(contextType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have bidirectional consistency between path and context type', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            // Act: Get config by path, then by context type
            const configByPath = getAISpecialistByPath(path);
            const configByContextType = getAISpecialistByContextType(configByPath!.contextType);

            // Assert: Both should return equivalent configs
            expect(configByContextType?.emoji).toBe(configByPath?.emoji);
            expect(configByContextType?.section).toBe(configByPath?.section);
            expect(configByContextType?.placeholder).toBe(configByPath?.placeholder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('AI Specialist Configuration Completeness', () => {
    it('should have exactly 5 AI specialists configured', () => {
      const allConfigs = getAllAISpecialists();
      expect(allConfigs.length).toBe(5);
    });

    it('should have all required properties for each config', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            const config = getAISpecialistByPath(path);

            // Assert: All required properties should exist
            expect(config?.section).toBeDefined();
            expect(config?.emoji).toBeDefined();
            expect(config?.icon).toBeDefined();
            expect(config?.placeholder).toBeDefined();
            expect(config?.contextType).toBeDefined();
            expect(config?.backgroundColor).toBeDefined();
            expect(config?.gradientColors).toBeDefined();
            expect(config?.online).toBeDefined();

            // Assert: Properties should have correct types
            expect(typeof config?.section).toBe('string');
            expect(typeof config?.emoji).toBe('string');
            expect(typeof config?.placeholder).toBe('string');
            expect(typeof config?.contextType).toBe('string');
            expect(typeof config?.backgroundColor).toBe('string');
            expect(typeof config?.gradientColors).toBe('string');
            expect(typeof config?.online).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have placeholder text in Portuguese Brazilian', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            const config = getAISpecialistByPath(path);

            // Assert: Placeholder should contain Portuguese text pattern
            expect(config?.placeholder).toContain('Pergunte algo sobre');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have all specialists online by default', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            const config = getAISpecialistByPath(path);

            // Assert: All specialists should be online
            expect(config?.online).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have valid gradient colors format', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            const config = getAISpecialistByPath(path);

            // Assert: Gradient colors should be comma-separated hex colors
            expect(config?.gradientColors).toMatch(/^#[0-9a-f]{6}, #[0-9a-f]{6}$/i);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have valid Tailwind background color class', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            const config = getAISpecialistByPath(path);

            // Assert: Background color should be a valid Tailwind class
            expect(config?.backgroundColor).toMatch(/^bg-[a-z]+-\d{3}$/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getAISpecialistPaths', () => {
    it('should return all configured paths', () => {
      const paths = getAISpecialistPaths();

      // Assert: Should have 5 paths
      expect(paths.length).toBe(5);

      // Assert: All expected paths should be present
      expect(paths).toContain('/dashboard/quadro');
      expect(paths).toContain('/dashboard/chat');
      expect(paths).toContain('/dashboard/leads');
      expect(paths).toContain('/dashboard/agendamentos');
      expect(paths).toContain('/dashboard/analytics');
    });

    it('should return paths that all have valid configs', () => {
      const paths = getAISpecialistPaths();

      for (const path of paths) {
        const config = getAISpecialistByPath(path);
        expect(config).toBeDefined();
      }
    });
  });
});
