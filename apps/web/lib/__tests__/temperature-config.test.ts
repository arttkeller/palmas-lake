/**
 * Property-Based Tests for Temperature Configuration
 * 
 * Tests the temperature classification system for lead filtering.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  LeadTemperature,
  NonNullLeadTemperature,
  VALID_TEMPERATURES,
  TEMPERATURE_CONFIG,
  isValidTemperature,
  getTemperatureEmoji,
  getTemperatureConfig,
  getAllTemperatureConfigs,
} from '../temperature-config';

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
 * Generator for invalid temperature strings
 */
const invalidTemperatureArb = fc.string().filter(
  s => !VALID_TEMPERATURES.includes(s as NonNullLeadTemperature) && s !== 'null'
);

/**
 * Generator for arbitrary values that are not valid temperatures
 */
const nonTemperatureValueArb = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.object(),
  fc.array(fc.anything()),
  invalidTemperatureArb
);

// ============================================
// Expected Emoji Mappings
// ============================================

const expectedEmojiMapping: Record<NonNullLeadTemperature, string> = {
  hot: '🔥',
  warm: '🌤️',
  cold: '❄️',
};

// ============================================
// Property-Based Tests
// ============================================

describe('Temperature Configuration - Property Tests', () => {
  /**
   * **Feature: lead-filters-tags-system, Property 1: Temperature Classification Validity**
   * **Validates: Requirements 1.1**
   * 
   * For any AI classification result, the temperature value must be one of the 
   * valid values: 'hot', 'warm', 'cold', or null.
   */
  describe('Property 1: Temperature Classification Validity', () => {
    it('should validate all valid temperature values', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (temperature) => {
            // Act: Check if temperature is valid
            const isValid = isValidTemperature(temperature);

            // Assert: All valid temperatures should pass validation
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid temperature values', () => {
      fc.assert(
        fc.property(
          nonTemperatureValueArb,
          (value) => {
            // Act: Check if invalid value passes validation
            const isValid = isValidTemperature(value);

            // Assert: Invalid values should fail validation
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have exactly three valid temperature values', () => {
      expect(VALID_TEMPERATURES).toHaveLength(3);
      expect(VALID_TEMPERATURES).toContain('hot');
      expect(VALID_TEMPERATURES).toContain('warm');
      expect(VALID_TEMPERATURES).toContain('cold');
    });

    it('should have configuration for all valid temperatures', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (temperature) => {
            // Act: Get config for temperature
            const config = TEMPERATURE_CONFIG[temperature];

            // Assert: Config should exist and have correct value
            expect(config).toBeDefined();
            expect(config.value).toBe(temperature);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return undefined config for null temperature', () => {
      const config = getTemperatureConfig(null);
      expect(config).toBeUndefined();
    });
  });

  /**
   * **Feature: lead-filters-tags-system, Property 2: Temperature to Emoji Mapping**
   * **Validates: Requirements 1.2**
   * 
   * For any lead with a temperature classification, the displayed emoji must match 
   * the mapping: 'hot' → '🔥', 'warm' → '🌤️', 'cold' → '❄️'.
   */
  describe('Property 2: Temperature to Emoji Mapping', () => {
    it('should return correct emoji for each temperature', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (temperature) => {
            // Act: Get emoji for temperature
            const emoji = getTemperatureEmoji(temperature);

            // Assert: Emoji should match expected mapping
            expect(emoji).toBe(expectedEmojiMapping[temperature]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty string for null temperature', () => {
      const emoji = getTemperatureEmoji(null);
      expect(emoji).toBe('');
    });

    it('should have unique emoji for each temperature', () => {
      const emojis = VALID_TEMPERATURES.map(temp => TEMPERATURE_CONFIG[temp].emoji);
      const uniqueEmojis = new Set(emojis);
      
      expect(uniqueEmojis.size).toBe(VALID_TEMPERATURES.length);
    });

    it('should have consistent emoji in config and mapping function', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (temperature) => {
            // Act: Get emoji from both sources
            const emojiFromConfig = TEMPERATURE_CONFIG[temperature].emoji;
            const emojiFromFunction = getTemperatureEmoji(temperature);

            // Assert: Both should be identical
            expect(emojiFromFunction).toBe(emojiFromConfig);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have specific emoji mappings as per requirements', () => {
      expect(getTemperatureEmoji('hot')).toBe('🔥');
      expect(getTemperatureEmoji('warm')).toBe('🌤️');
      expect(getTemperatureEmoji('cold')).toBe('❄️');
    });
  });

  describe('Temperature Configuration Completeness', () => {
    it('should have all required properties for each config', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (temperature) => {
            const config = TEMPERATURE_CONFIG[temperature];

            // Assert: All required properties should exist
            expect(config.value).toBeDefined();
            expect(config.emoji).toBeDefined();
            expect(config.label).toBeDefined();
            expect(config.color).toBeDefined();
            expect(config.bgColor).toBeDefined();
            expect(config.ringColor).toBeDefined();

            // Assert: Properties should have correct types
            expect(typeof config.value).toBe('string');
            expect(typeof config.emoji).toBe('string');
            expect(typeof config.label).toBe('string');
            expect(typeof config.color).toBe('string');
            expect(typeof config.bgColor).toBe('string');
            expect(typeof config.ringColor).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have valid Tailwind color classes', () => {
      fc.assert(
        fc.property(
          validTemperatureArb,
          (temperature) => {
            const config = TEMPERATURE_CONFIG[temperature];

            // Assert: Color classes should follow Tailwind patterns
            expect(config.color).toMatch(/^text-[a-z]+-\d{3}$/);
            expect(config.bgColor).toMatch(/^bg-[a-z]+-\d{3}\/\d+$/);
            expect(config.ringColor).toMatch(/^ring-[a-z]+-\d{3}$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have Portuguese labels', () => {
      expect(TEMPERATURE_CONFIG.hot.label).toBe('Quente');
      expect(TEMPERATURE_CONFIG.warm.label).toBe('Morno');
      expect(TEMPERATURE_CONFIG.cold.label).toBe('Frio');
    });
  });

  describe('getAllTemperatureConfigs', () => {
    it('should return all configurations', () => {
      const configs = getAllTemperatureConfigs();
      
      expect(configs).toHaveLength(3);
      expect(configs.map(c => c.value)).toContain('hot');
      expect(configs.map(c => c.value)).toContain('warm');
      expect(configs.map(c => c.value)).toContain('cold');
    });

    it('should return configs in same order as VALID_TEMPERATURES', () => {
      const configs = getAllTemperatureConfigs();
      
      configs.forEach((config, index) => {
        expect(config.value).toBe(VALID_TEMPERATURES[index]);
      });
    });
  });
});
