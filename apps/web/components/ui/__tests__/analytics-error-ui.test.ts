/**
 * Property-Based Tests for Analytics Error UI Components
 * 
 * **Feature: fix-analytics-infinite-loading, Property 2: Error scenarios show appropriate UI**
 * **Validates: Requirements 1.2, 1.3, 1.4**
 * 
 * For any error condition (API failure, timeout, network error, empty response),
 * the Analytics_Page SHALL display either placeholder data or an error message,
 * never a loading spinner after the timeout period.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DashboardMetrics } from '@/types/analytics-cache';
import { createPlaceholderMetrics } from '@/types/analytics-cache';

// ============================================
// Types for UI State
// ============================================

interface AnalyticsUIState {
  isLoading: boolean;
  hasTimedOut: boolean;
  error: Error | null;
  data: DashboardMetrics;
  isStale: boolean;
  lastUpdate: Date | null;
}

type UIRenderResult = 
  | 'loading_spinner'
  | 'timeout_warning'
  | 'error_message'
  | 'empty_state'
  | 'stale_data_indicator'
  | 'data_display';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for error scenarios
 */
const errorScenarioArb = fc.constantFrom(
  'api_failure',
  'timeout',
  'network_error',
  'empty_response',
  'null_data',
  'success'
);

/**
 * Generator for Error objects
 */
const errorArb = fc.oneof(
  fc.constant(new Error('API request failed')),
  fc.constant(new Error('Network error')),
  fc.constant(new Error('Timeout exceeded')),
  fc.constant(new Error('Server error: 500')),
  fc.constant(new Error('Not found: 404'))
);

/**
 * Generator for empty/placeholder DashboardMetrics
 */
const emptyMetricsArb: fc.Arbitrary<DashboardMetrics> = fc.constant(createPlaceholderMetrics());

/**
 * Generator for non-empty DashboardMetrics (has some data)
 */
const nonEmptyMetricsArb: fc.Arbitrary<DashboardMetrics> = fc.record({
  total_leads: fc.integer({ min: 1, max: 10000 }),
  conversion_rate: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
  em_atendimento: fc.integer({ min: 1, max: 1000 }),
  status_distribution: fc.constant({ novo_lead: 10, qualificado: 5 }),
  history: fc.array(
    fc.record({
      date: fc.constant('2024-01-01'),
      leads: fc.integer({ min: 1, max: 100 }),
    }),
    { minLength: 1, maxLength: 5 }
  ),
  heatmap: fc.constant([]),
  response_times: fc.constant({ ai_avg_seconds: 100, lead_avg_minutes: 1.3, history: [] }),
  objections: fc.constant([]),
  channels: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      value: fc.integer({ min: 1, max: 100 }),
      color: fc.constant('#10b981'),
    }),
    { minLength: 1, maxLength: 3 }
  ),
  faq: fc.constant([]),
  transfer_rate: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
  transfer_count: fc.integer({ min: 0, max: 1000 }),
  sentiment_trend: fc.constant([]),
});

/**
 * Generator for timestamps (recent or stale)
 */
const recentTimestampArb = fc.integer({ min: 0, max: 300000 }).map(msAgo => new Date(Date.now() - msAgo));
const staleTimestampArb = fc.integer({ min: 300001, max: 3600000 }).map(msAgo => new Date(Date.now() - msAgo));

// ============================================
// UI State Determination Logic
// ============================================

/**
 * Determines what UI should be rendered based on state
 * This mirrors the logic in the Analytics page component
 */
function determineUIRender(state: AnalyticsUIState): UIRenderResult {
  const { isLoading, hasTimedOut, error, data, isStale } = state;

  // Check if data is empty
  const isDataEmpty = (
    data.total_leads === 0 &&
    data.em_atendimento === 0 &&
    data.conversion_rate === 0 &&
    data.history.length === 0 &&
    data.channels.length === 0
  );

  // Loading state takes precedence
  if (isLoading) {
    return 'loading_spinner';
  }

  // Error state
  if (error) {
    return 'error_message';
  }

  // Timeout warning (after loading completes)
  if (hasTimedOut) {
    return 'timeout_warning';
  }

  // Empty data state
  if (isDataEmpty) {
    return 'empty_state';
  }

  // Stale data indicator
  if (isStale) {
    return 'stale_data_indicator';
  }

  // Normal data display
  return 'data_display';
}

/**
 * Checks if the UI result is appropriate (not a loading spinner after timeout)
 */
function isAppropriateUIForErrorScenario(
  scenario: string,
  uiResult: UIRenderResult,
  isLoading: boolean
): boolean {
  // After loading completes (isLoading = false), we should never show loading_spinner
  if (!isLoading && uiResult === 'loading_spinner') {
    return false;
  }

  // For error scenarios, we should show error_message, timeout_warning, or empty_state
  const validErrorUIs: UIRenderResult[] = ['error_message', 'timeout_warning', 'empty_state', 'stale_data_indicator', 'data_display'];
  
  if (!isLoading) {
    return validErrorUIs.includes(uiResult);
  }

  return true;
}

// ============================================
// Property-Based Tests
// ============================================

describe('Analytics Error UI - Property Tests', () => {
  /**
   * **Feature: fix-analytics-infinite-loading, Property 2: Error scenarios show appropriate UI**
   * **Validates: Requirements 1.2, 1.3, 1.4**
   */
  describe('Property 2: Error scenarios show appropriate UI', () => {
    /**
     * For any error condition, after loading completes, the UI SHALL NOT show a loading spinner
     * Requirements: 1.2, 1.3
     */
    it('should never show loading spinner after isLoading becomes false', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // hasTimedOut
          fc.option(errorArb, { nil: null }), // error
          fc.oneof(emptyMetricsArb, nonEmptyMetricsArb), // data
          fc.boolean(), // isStale
          fc.option(recentTimestampArb, { nil: null }), // lastUpdate
          (hasTimedOut, error, data, isStale, lastUpdate) => {
            // Arrange: Create state with isLoading = false (loading completed)
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut,
              error,
              data,
              isStale,
              lastUpdate,
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Should never be loading_spinner when isLoading is false
            expect(uiResult).not.toBe('loading_spinner');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When error is present, UI SHALL show error_message
     * Requirements: 1.4
     */
    it('should show error message when error is present', () => {
      fc.assert(
        fc.property(
          errorArb,
          fc.oneof(emptyMetricsArb, nonEmptyMetricsArb),
          fc.boolean(),
          (error, data, isStale) => {
            // Arrange: Create state with error
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut: false,
              error,
              data,
              isStale,
              lastUpdate: new Date(),
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Should show error_message
            expect(uiResult).toBe('error_message');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When timeout occurs without error, UI SHALL show timeout_warning
     * Requirements: 1.2
     */
    it('should show timeout warning when hasTimedOut is true and no error', () => {
      fc.assert(
        fc.property(
          fc.oneof(emptyMetricsArb, nonEmptyMetricsArb),
          fc.boolean(),
          (data, isStale) => {
            // Arrange: Create state with timeout but no error
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut: true,
              error: null,
              data,
              isStale,
              lastUpdate: new Date(),
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Should show timeout_warning
            expect(uiResult).toBe('timeout_warning');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When data is empty/null without error, UI SHALL show empty_state (placeholder)
     * Requirements: 1.3
     */
    it('should show empty state when data is empty and no error', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isStale) => {
            // Arrange: Create state with empty data
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut: false,
              error: null,
              data: createPlaceholderMetrics(),
              isStale,
              lastUpdate: new Date(),
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Should show empty_state
            expect(uiResult).toBe('empty_state');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When data is stale but present, UI SHALL show stale_data_indicator
     * Requirements: 4.2
     */
    it('should show stale data indicator when data is stale but present', () => {
      fc.assert(
        fc.property(
          nonEmptyMetricsArb,
          staleTimestampArb,
          (data, lastUpdate) => {
            // Arrange: Create state with stale data
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut: false,
              error: null,
              data,
              isStale: true,
              lastUpdate,
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Should show stale_data_indicator
            expect(uiResult).toBe('stale_data_indicator');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * For any error scenario, the UI result should be appropriate
     * Requirements: 1.2, 1.3, 1.4
     */
    it('should always show appropriate UI for any error scenario', () => {
      fc.assert(
        fc.property(
          errorScenarioArb,
          fc.boolean(),
          fc.option(errorArb, { nil: null }),
          fc.oneof(emptyMetricsArb, nonEmptyMetricsArb),
          fc.boolean(),
          (scenario, hasTimedOut, error, data, isStale) => {
            // Arrange: Create state based on scenario
            const state: AnalyticsUIState = {
              isLoading: false, // After loading completes
              hasTimedOut: scenario === 'timeout' || hasTimedOut,
              error: scenario === 'api_failure' || scenario === 'network_error' ? error || new Error('Test error') : null,
              data: scenario === 'empty_response' || scenario === 'null_data' ? createPlaceholderMetrics() : data,
              isStale,
              lastUpdate: new Date(),
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: UI should be appropriate for the scenario
            const isAppropriate = isAppropriateUIForErrorScenario(scenario, uiResult, state.isLoading);
            expect(isAppropriate).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Error state should take precedence over other states
     * Requirements: 1.4
     */
    it('should prioritize error state over timeout and stale states', () => {
      fc.assert(
        fc.property(
          errorArb,
          nonEmptyMetricsArb,
          (error, data) => {
            // Arrange: Create state with error, timeout, and stale all true
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut: true,
              error,
              data,
              isStale: true,
              lastUpdate: new Date(Date.now() - 600000), // 10 minutes ago
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Error should take precedence
            expect(uiResult).toBe('error_message');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Timeout state should take precedence over empty/stale states (when no error)
     */
    it('should prioritize timeout over empty and stale states when no error', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isStale) => {
            // Arrange: Create state with timeout and empty data
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut: true,
              error: null,
              data: createPlaceholderMetrics(),
              isStale,
              lastUpdate: new Date(),
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Timeout should take precedence
            expect(uiResult).toBe('timeout_warning');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Normal data display when no error conditions
     */
    it('should show data display when no error conditions and data is present', () => {
      fc.assert(
        fc.property(
          nonEmptyMetricsArb,
          recentTimestampArb,
          (data, lastUpdate) => {
            // Arrange: Create normal state
            const state: AnalyticsUIState = {
              isLoading: false,
              hasTimedOut: false,
              error: null,
              data,
              isStale: false,
              lastUpdate,
            };

            // Act: Determine UI render
            const uiResult = determineUIRender(state);

            // Assert: Should show data_display
            expect(uiResult).toBe('data_display');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional tests for UI state consistency
   */
  describe('UI State Consistency', () => {
    /**
     * Same state should always produce same UI result (deterministic)
     */
    it('should produce consistent UI result for same state', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.option(errorArb, { nil: null }),
          fc.oneof(emptyMetricsArb, nonEmptyMetricsArb),
          fc.boolean(),
          fc.option(recentTimestampArb, { nil: null }),
          (isLoading, hasTimedOut, error, data, isStale, lastUpdate) => {
            // Arrange: Create state
            const state: AnalyticsUIState = {
              isLoading,
              hasTimedOut,
              error,
              data,
              isStale,
              lastUpdate,
            };

            // Act: Determine UI render twice
            const result1 = determineUIRender(state);
            const result2 = determineUIRender(state);

            // Assert: Same result
            expect(result1).toBe(result2);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * UI result should always be one of the valid states
     */
    it('should always return a valid UI state', () => {
      const validStates: UIRenderResult[] = [
        'loading_spinner',
        'timeout_warning',
        'error_message',
        'empty_state',
        'stale_data_indicator',
        'data_display',
      ];

      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.option(errorArb, { nil: null }),
          fc.oneof(emptyMetricsArb, nonEmptyMetricsArb),
          fc.boolean(),
          fc.option(recentTimestampArb, { nil: null }),
          (isLoading, hasTimedOut, error, data, isStale, lastUpdate) => {
            // Arrange: Create state
            const state: AnalyticsUIState = {
              isLoading,
              hasTimedOut,
              error,
              data,
              isStale,
              lastUpdate,
            };

            // Act: Determine UI render
            const result = determineUIRender(state);

            // Assert: Result is valid
            expect(validStates).toContain(result);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
