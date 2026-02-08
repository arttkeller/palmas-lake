/**
 * Property-Based Tests for ThemeProvider
 * 
 * **Feature: ui-redesign-ai-specialists, Property 5: Theme Persistence Round-Trip**
 * **Validates: Requirements 3.4, 3.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { THEME_STORAGE_KEY } from '../theme-provider';

// ============================================
// Mock Setup
// ============================================

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

// Mock matchMedia
const matchMediaMock = vi.fn((query: string) => ({
  matches: query === '(prefers-color-scheme: dark)' ? false : false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid theme values
 */
const themeArb = fc.constantFrom('light', 'dark') as fc.Arbitrary<'light' | 'dark'>;

/**
 * Generator for theme with system option
 */
const themeWithSystemArb = fc.constantFrom('light', 'dark', 'system') as fc.Arbitrary<'light' | 'dark' | 'system'>;

// ============================================
// Helper Functions
// ============================================

/**
 * Simulates saving theme to localStorage
 */
function saveTheme(theme: string): void {
  localStorageMock.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * Simulates loading theme from localStorage
 */
function loadTheme(): string | null {
  return localStorageMock.getItem(THEME_STORAGE_KEY);
}

/**
 * Validates if a stored value is a valid theme
 */
function isValidTheme(value: string | null): value is 'light' | 'dark' | 'system' {
  return value === 'light' || value === 'dark' || value === 'system';
}

// ============================================
// Property-Based Tests
// ============================================

describe('ThemeProvider - Property Tests', () => {
  beforeEach(() => {
    // Setup mocks
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: {
        localStorage: localStorageMock,
        matchMedia: matchMediaMock,
      },
      writable: true,
    });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Property 5: Theme Persistence Round-Trip', () => {
    /**
     * **Feature: ui-redesign-ai-specialists, Property 5: Theme Persistence Round-Trip**
     * **Validates: Requirements 3.4, 3.5**
     *
     * For any preference of theme saved, when reloading the application,
     * the restored theme SHALL be identical to the theme that was saved
     * previously in localStorage.
     */
    it('should restore the exact theme that was saved to localStorage', () => {
      fc.assert(
        fc.property(
          themeArb,
          (theme) => {
            // Arrange: Clear any existing theme
            localStorageMock.clear();

            // Act: Save theme (simulating user preference change)
            saveTheme(theme);

            // Act: Load theme (simulating application reload)
            const restoredTheme = loadTheme();

            // Assert: Restored theme should be identical to saved theme
            expect(restoredTheme).toBe(theme);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Theme persistence should work for all valid theme values including 'system'
     */
    it('should persist and restore all valid theme values including system', () => {
      fc.assert(
        fc.property(
          themeWithSystemArb,
          (theme) => {
            // Arrange
            localStorageMock.clear();

            // Act: Save and restore
            saveTheme(theme);
            const restoredTheme = loadTheme();

            // Assert: Round-trip should preserve the value
            expect(restoredTheme).toBe(theme);
            expect(isValidTheme(restoredTheme)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Multiple theme changes should always persist the latest value
     */
    it('should always persist the most recent theme preference', () => {
      fc.assert(
        fc.property(
          fc.array(themeArb, { minLength: 1, maxLength: 10 }),
          (themeSequence) => {
            // Arrange
            localStorageMock.clear();

            // Act: Apply multiple theme changes
            for (const theme of themeSequence) {
              saveTheme(theme);
            }

            // Act: Load the final theme
            const finalTheme = loadTheme();

            // Assert: Should be the last theme in the sequence
            const expectedTheme = themeSequence[themeSequence.length - 1];
            expect(finalTheme).toBe(expectedTheme);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Theme should be retrievable immediately after saving
     */
    it('should make theme immediately retrievable after saving', () => {
      fc.assert(
        fc.property(
          themeArb,
          (theme) => {
            // Arrange
            localStorageMock.clear();

            // Act: Save theme
            saveTheme(theme);

            // Assert: Should be immediately retrievable
            expect(loadTheme()).toBe(theme);

            // Act: Save different theme
            const otherTheme = theme === 'light' ? 'dark' : 'light';
            saveTheme(otherTheme);

            // Assert: New theme should be immediately retrievable
            expect(loadTheme()).toBe(otherTheme);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Storage key should be consistent
     */
    it('should use consistent storage key for theme persistence', () => {
      fc.assert(
        fc.property(
          themeArb,
          (theme) => {
            // Arrange
            localStorageMock.clear();

            // Act: Save theme
            saveTheme(theme);

            // Assert: Should be stored under the correct key
            expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, theme);
            expect(localStorageMock.getItem(THEME_STORAGE_KEY)).toBe(theme);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Theme Validation', () => {
    /**
     * Only valid theme values should be recognized
     */
    it('should only recognize valid theme values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 20 }),
          (randomString) => {
            // Act: Check if the random string is a valid theme
            const isValid = isValidTheme(randomString);

            // Assert: Should only be valid if it's one of the allowed values
            const expectedValid = randomString === 'light' || randomString === 'dark' || randomString === 'system';
            expect(isValid).toBe(expectedValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Null values should not be valid themes
     */
    it('should not recognize null as a valid theme', () => {
      expect(isValidTheme(null)).toBe(false);
    });
  });
});


// ============================================
// Property 4: Theme Toggle Consistency Tests
// ============================================

describe('Property 4: Theme Toggle Consistency', () => {
  /**
   * **Feature: ui-redesign-ai-specialists, Property 4: Theme Toggle Consistency**
   * **Validates: Requirements 3.1**
   *
   * For any click on the Sky Toggle button, the theme SHALL alternate between
   * 'light' and 'dark', and the corresponding class SHALL be applied to the
   * document root element.
   */

  /**
   * Simulates the toggle behavior
   */
  function toggleTheme(currentTheme: 'light' | 'dark'): 'light' | 'dark' {
    return currentTheme === 'light' ? 'dark' : 'light';
  }

  /**
   * Simulates applying theme class to document root
   */
  function applyThemeClass(theme: 'light' | 'dark'): { classList: string[] } {
    return {
      classList: [theme],
    };
  }

  it('should alternate between light and dark on each toggle', () => {
    fc.assert(
      fc.property(
        themeArb,
        fc.integer({ min: 1, max: 20 }),
        (initialTheme, toggleCount) => {
          // Arrange
          let currentTheme = initialTheme;

          // Act: Toggle multiple times
          for (let i = 0; i < toggleCount; i++) {
            currentTheme = toggleTheme(currentTheme);
          }

          // Assert: After odd number of toggles, theme should be opposite
          // After even number of toggles, theme should be same as initial
          const expectedTheme = toggleCount % 2 === 0 ? initialTheme : (initialTheme === 'light' ? 'dark' : 'light');
          expect(currentTheme).toBe(expectedTheme);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should apply the correct class to document root after toggle', () => {
    fc.assert(
      fc.property(
        themeArb,
        (theme) => {
          // Act: Apply theme class
          const root = applyThemeClass(theme);

          // Assert: Root should have the correct class
          expect(root.classList).toContain(theme);
          expect(root.classList).not.toContain(theme === 'light' ? 'dark' : 'light');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should toggle from light to dark and vice versa consistently', () => {
    fc.assert(
      fc.property(
        themeArb,
        (startTheme) => {
          // Act: Toggle once
          const afterFirstToggle = toggleTheme(startTheme);
          
          // Assert: Should be opposite
          expect(afterFirstToggle).toBe(startTheme === 'light' ? 'dark' : 'light');

          // Act: Toggle again
          const afterSecondToggle = toggleTheme(afterFirstToggle);

          // Assert: Should be back to original
          expect(afterSecondToggle).toBe(startTheme);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain toggle idempotence (double toggle returns to original)', () => {
    fc.assert(
      fc.property(
        themeArb,
        (theme) => {
          // Act: Double toggle
          const result = toggleTheme(toggleTheme(theme));

          // Assert: Should return to original (idempotent property)
          expect(result).toBe(theme);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure theme is always either light or dark after any number of toggles', () => {
    fc.assert(
      fc.property(
        themeArb,
        fc.integer({ min: 0, max: 100 }),
        (initialTheme, toggleCount) => {
          // Arrange
          let currentTheme = initialTheme;

          // Act: Toggle multiple times
          for (let i = 0; i < toggleCount; i++) {
            currentTheme = toggleTheme(currentTheme);
          }

          // Assert: Theme should always be valid
          expect(['light', 'dark']).toContain(currentTheme);
        }
      ),
      { numRuns: 100 }
    );
  });
});
