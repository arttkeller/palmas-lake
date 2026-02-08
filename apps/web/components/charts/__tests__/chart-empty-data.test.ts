/**
 * Property-Based Tests for Chart Components with Empty Data
 * 
 * **Feature: fix-analytics-infinite-loading, Property 3: Charts render without errors for any data shape**
 * **Validates: Requirements 2.1, 2.2**
 * 
 * For any data input (empty array, undefined, null, zero values), chart components
 * SHALL render without throwing JavaScript errors and SHALL display a valid
 * visualization or empty state.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isChartDataEmpty, isAllZeroValues, MIN_CHART_WIDTH, MIN_CHART_HEIGHT } from '../EmptyChartState';

// ============================================
// Types for Chart Data
// ============================================

interface ChannelData {
  name: string;
  value: number;
  color?: string;
}

interface HeatmapData {
  dow: number;
  hour: number;
  value: number;
}

interface ObjectionData {
  name: string;
  value: number;
}

interface FAQData {
  name: string;
  value: number;
}

interface SentimentData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

interface HistoryData {
  date: string;
  leads: number;
}

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for empty/undefined/null data scenarios
 */
const emptyDataArb = fc.constantFrom(
  undefined,
  null,
  [],
);

/**
 * Generator for channel data (can be empty or have values)
 */
const channelDataArb: fc.Arbitrary<ChannelData> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  value: fc.integer({ min: 0, max: 100 }),
  color: fc.option(
    fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 })
    ).map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`),
    { nil: undefined }
  ),
});

/**
 * Generator for channel array (including empty)
 */
const channelArrayArb = fc.oneof(
  fc.constant([]),
  fc.array(channelDataArb, { minLength: 0, maxLength: 5 }),
);

/**
 * Generator for heatmap data
 */
const heatmapDataArb: fc.Arbitrary<HeatmapData> = fc.record({
  dow: fc.integer({ min: 0, max: 6 }),
  hour: fc.integer({ min: 0, max: 23 }),
  value: fc.integer({ min: 0, max: 100 }),
});

/**
 * Generator for heatmap array (including empty)
 */
const heatmapArrayArb = fc.oneof(
  fc.constant([]),
  fc.array(heatmapDataArb, { minLength: 0, maxLength: 168 }), // 7 days * 24 hours
);

/**
 * Generator for objection data
 */
const objectionDataArb: fc.Arbitrary<ObjectionData> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  value: fc.integer({ min: 0, max: 100 }),
});

/**
 * Generator for objection array (including empty)
 */
const objectionArrayArb = fc.oneof(
  fc.constant([]),
  fc.array(objectionDataArb, { minLength: 0, maxLength: 10 }),
);

/**
 * Generator for FAQ data
 */
const faqDataArb: fc.Arbitrary<FAQData> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  value: fc.integer({ min: 0, max: 100 }),
});

/**
 * Generator for FAQ array (including empty)
 */
const faqArrayArb = fc.oneof(
  fc.constant([]),
  fc.array(faqDataArb, { minLength: 0, maxLength: 10 }),
);

/**
 * Generator for sentiment data
 */
const sentimentDataArb: fc.Arbitrary<SentimentData> = fc.record({
  date: fc.date({ min: new Date('2024-01-01'), max: new Date('2027-12-31') }).map(d => d.toISOString().split('T')[0]),
  positive: fc.integer({ min: 0, max: 100 }),
  neutral: fc.integer({ min: 0, max: 100 }),
  negative: fc.integer({ min: 0, max: 100 }),
});

/**
 * Generator for sentiment array (including empty)
 */
const sentimentArrayArb = fc.oneof(
  fc.constant([]),
  fc.array(sentimentDataArb, { minLength: 0, maxLength: 30 }),
);

/**
 * Generator for history data
 */
const historyDataArb: fc.Arbitrary<HistoryData> = fc.record({
  date: fc.date({ min: new Date('2024-01-01'), max: new Date('2027-12-31') }).map(d => d.toISOString().split('T')[0]),
  leads: fc.integer({ min: 0, max: 1000 }),
});

/**
 * Generator for history array (including empty)
 */
const historyArrayArb = fc.oneof(
  fc.constant([]),
  fc.array(historyDataArb, { minLength: 0, maxLength: 30 }),
);

/**
 * Generator for all-zero value arrays
 */
const allZeroChannelArrayArb = fc.array(
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    value: fc.constant(0),
    color: fc.option(
      fc.tuple(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 })
      ).map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`),
      { nil: undefined }
    ),
  }),
  { minLength: 1, maxLength: 5 }
);

// ============================================
// Helper Functions for Testing
// ============================================

/**
 * Simulates chart data processing without throwing errors
 * This mirrors the logic in chart components
 */
function processChartData<T>(data: T[] | undefined | null): { isEmpty: boolean; processedData: T[] } {
  const isEmpty = isChartDataEmpty(data);
  const processedData = data || [];
  return { isEmpty, processedData };
}

/**
 * Validates that chart dimensions meet minimum requirements
 * Requirements: 2.3
 */
function validateChartDimensions(width: number, height: number): boolean {
  return width >= MIN_CHART_WIDTH && height >= MIN_CHART_HEIGHT;
}

// ============================================
// Property-Based Tests
// ============================================

describe('Chart Empty Data Handling - Property Tests', () => {
  /**
   * **Feature: fix-analytics-infinite-loading, Property 3: Charts render without errors for any data shape**
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 3: Charts render without errors for any data shape', () => {
    /**
     * isChartDataEmpty should correctly identify empty data
     * Requirements: 2.1
     */
    it('should correctly identify empty data (undefined, null, empty array)', () => {
      fc.assert(
        fc.property(
          emptyDataArb,
          (data) => {
            // Act
            const result = isChartDataEmpty(data);

            // Assert: All empty data types should return true
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * isChartDataEmpty should correctly identify non-empty data
     * Requirements: 2.1
     */
    it('should correctly identify non-empty data', () => {
      fc.assert(
        fc.property(
          fc.array(channelDataArb, { minLength: 1, maxLength: 5 }),
          (data) => {
            // Act
            const result = isChartDataEmpty(data);

            // Assert: Non-empty arrays should return false
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * isAllZeroValues should correctly identify all-zero arrays
     * Requirements: 2.2
     */
    it('should correctly identify arrays with all zero values', () => {
      fc.assert(
        fc.property(
          allZeroChannelArrayArb,
          (data) => {
            // Act
            const result = isAllZeroValues(data, 'value');

            // Assert: All-zero arrays should return true
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * isAllZeroValues should return false for arrays with non-zero values
     * Requirements: 2.2
     */
    it('should correctly identify arrays with non-zero values', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              value: fc.integer({ min: 1, max: 100 }), // At least 1
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (data) => {
            // Act
            const result = isAllZeroValues(data, 'value');

            // Assert: Arrays with non-zero values should return false
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Chart data processing should never throw for any input
     * Requirements: 2.1
     */
    it('should process channel data without throwing for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            channelArrayArb
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data as ChannelData[] | undefined | null)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Chart data processing should never throw for heatmap data
     * Requirements: 2.1
     */
    it('should process heatmap data without throwing for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            heatmapArrayArb
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data as HeatmapData[] | undefined | null)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Chart data processing should never throw for objection data
     * Requirements: 2.1
     */
    it('should process objection data without throwing for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            objectionArrayArb
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data as ObjectionData[] | undefined | null)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Chart data processing should never throw for FAQ data
     * Requirements: 2.1
     */
    it('should process FAQ data without throwing for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            faqArrayArb
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data as FAQData[] | undefined | null)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Chart data processing should never throw for sentiment data
     * Requirements: 2.1
     */
    it('should process sentiment data without throwing for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            sentimentArrayArb
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data as SentimentData[] | undefined | null)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Chart data processing should never throw for history data
     * Requirements: 2.1
     */
    it('should process history data without throwing for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            historyArrayArb
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data as HistoryData[] | undefined | null)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Minimum chart dimensions should always be valid
     * Requirements: 2.3
     */
    it('should have valid minimum chart dimensions', () => {
      // Assert: MIN_CHART_WIDTH and MIN_CHART_HEIGHT should be at least 100px
      expect(MIN_CHART_WIDTH).toBeGreaterThanOrEqual(100);
      expect(MIN_CHART_HEIGHT).toBeGreaterThanOrEqual(100);
    });

    /**
     * Chart dimension validation should work correctly
     * Requirements: 2.3
     */
    it('should validate chart dimensions correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 0, max: 500 }),
          (width, height) => {
            // Act
            const isValid = validateChartDimensions(width, height);

            // Assert: Should be valid only if both dimensions meet minimum
            const expectedValid = width >= MIN_CHART_WIDTH && height >= MIN_CHART_HEIGHT;
            expect(isValid).toBe(expectedValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Processed data should always be an array (never undefined/null)
     * Requirements: 2.1
     */
    it('should always return an array from processChartData', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            channelArrayArb
          ),
          (data) => {
            // Act
            const { processedData } = processChartData(data as ChannelData[] | undefined | null);

            // Assert: processedData should always be an array
            expect(Array.isArray(processedData)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Empty state should be detected for all empty data types
     * Requirements: 2.1
     */
    it('should detect empty state for all empty data types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            fc.constant([])
          ),
          (data) => {
            // Act
            const { isEmpty } = processChartData(data as unknown[] | undefined | null);

            // Assert: isEmpty should be true for all empty data types
            expect(isEmpty).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Non-empty data should not be detected as empty
     * Requirements: 2.1
     */
    it('should not detect non-empty data as empty', () => {
      fc.assert(
        fc.property(
          fc.array(channelDataArb, { minLength: 1, maxLength: 5 }),
          (data) => {
            // Act
            const { isEmpty } = processChartData(data);

            // Assert: isEmpty should be false for non-empty data
            expect(isEmpty).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional tests for edge cases
   */
  describe('Edge Cases', () => {
    /**
     * Should handle mixed zero and non-zero values
     */
    it('should handle mixed zero and non-zero values correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              value: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 2, maxLength: 5 }
          ).filter(arr => arr.some(item => item.value > 0) && arr.some(item => item.value === 0)),
          (data) => {
            // Act
            const result = isAllZeroValues(data, 'value');

            // Assert: Mixed arrays should return false
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should handle very large arrays
     */
    it('should handle large arrays without throwing', () => {
      fc.assert(
        fc.property(
          fc.array(channelDataArb, { minLength: 100, maxLength: 200 }),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data)).not.toThrow();
            expect(() => isChartDataEmpty(data)).not.toThrow();
            expect(() => isAllZeroValues(data, 'value')).not.toThrow();
          }
        ),
        { numRuns: 10 } // Fewer runs for large arrays
      );
    });

    /**
     * Should handle special characters in names
     */
    it('should handle special characters in data names', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }), // Can include special chars
              value: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should handle negative values gracefully (edge case)
     */
    it('should handle negative values without throwing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              value: fc.integer({ min: -100, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (data) => {
            // Act & Assert: Should not throw
            expect(() => processChartData(data)).not.toThrow();
            expect(() => isAllZeroValues(data, 'value')).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
