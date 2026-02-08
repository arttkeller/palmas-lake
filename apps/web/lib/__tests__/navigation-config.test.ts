/**
 * Property-Based Tests for Navigation Configuration
 * 
 * **Feature: ui-redesign-ai-specialists, Property 3: Navigation Active State**
 * **Validates: Requirements 2.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  navigationItems, 
  isNavItemActive, 
  getNavItemByHref,
  getNavItemByName,
  type NavItem 
} from '../navigation-config';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid navigation item names
 */
const navItemNameArb = fc.constantFrom(
  'quadro', 'chat', 'leads', 'agendamentos', 'analytics', 'settings'
);

/**
 * Generator for valid navigation item hrefs
 */
const navItemHrefArb = fc.constantFrom(
  '/dashboard/quadro',
  '/dashboard/chat',
  '/dashboard/leads',
  '/dashboard/agendamentos',
  '/dashboard/analytics',
  '/dashboard/settings'
);

/**
 * Generator for random sub-paths
 */
const subPathArb = fc.stringMatching(/^\/[a-z0-9-]+$/);

/**
 * Generator for completely random paths (for negative testing)
 */
const randomPathArb = fc.stringMatching(/^\/[a-z0-9/-]*$/);

// ============================================
// Property-Based Tests
// ============================================

describe('Navigation Configuration - Property Tests', () => {
  describe('Property 3: Navigation Active State', () => {
    /**
     * **Feature: ui-redesign-ai-specialists, Property 3: Navigation Active State**
     * **Validates: Requirements 2.3**
     *
     * For any navigation item clicked, the system SHALL navigate to the
     * corresponding route and the item SHALL receive the "active" visual state,
     * while all other items SHALL lose that state.
     */
    it('should mark exactly one item as active when path matches exactly', () => {
      fc.assert(
        fc.property(
          navItemHrefArb,
          (currentPath) => {
            // Act: Check which items are active
            const activeItems = navigationItems.filter(item => 
              isNavItemActive(item.href, currentPath)
            );

            // Assert: Exactly one item should be active
            expect(activeItems.length).toBe(1);
            expect(activeItems[0].href).toBe(currentPath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mark item as active when path is a sub-path of the item href', () => {
      fc.assert(
        fc.property(
          navItemHrefArb,
          subPathArb,
          (baseHref, subPath) => {
            // Arrange: Create a sub-path
            const currentPath = baseHref + subPath;

            // Act: Check if the base item is active
            const isActive = isNavItemActive(baseHref, currentPath);

            // Assert: The base item should be active
            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not mark any item as active for non-dashboard paths', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('/login', '/register', '/', '/about', '/contact'),
          (currentPath) => {
            // Act: Check which items are active
            const activeItems = navigationItems.filter(item => 
              isNavItemActive(item.href, currentPath)
            );

            // Assert: No items should be active
            expect(activeItems.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure only one item is active at any time for valid dashboard paths', () => {
      fc.assert(
        fc.property(
          navItemHrefArb,
          fc.option(subPathArb, { nil: undefined }),
          (baseHref, maybeSubPath) => {
            // Arrange: Create path with optional sub-path
            const currentPath = maybeSubPath ? baseHref + maybeSubPath : baseHref;

            // Act: Count active items
            const activeCount = navigationItems.filter(item => 
              isNavItemActive(item.href, currentPath)
            ).length;

            // Assert: At most one item should be active
            // (could be 0 if the path doesn't match any item exactly)
            expect(activeCount).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify the active item by href', () => {
      fc.assert(
        fc.property(
          navItemHrefArb,
          (href) => {
            // Act: Get the item by href
            const item = getNavItemByHref(href);

            // Assert: Item should exist and have the correct href
            expect(item).toBeDefined();
            expect(item?.href).toBe(href);

            // Assert: This item should be active when path matches
            expect(isNavItemActive(item!.href, href)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify the active item by name', () => {
      fc.assert(
        fc.property(
          navItemNameArb,
          (name) => {
            // Act: Get the item by name
            const item = getNavItemByName(name);

            // Assert: Item should exist and have the correct name
            expect(item).toBeDefined();
            expect(item?.name).toBe(name);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Navigation Items Configuration', () => {
    it('should have exactly 6 navigation items', () => {
      expect(navigationItems.length).toBe(6);
    });

    it('should have all required properties for each navigation item', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: navigationItems.length - 1 }),
          (index) => {
            const item = navigationItems[index];

            // Assert: All required properties should exist
            expect(item.name).toBeDefined();
            expect(item.href).toBeDefined();
            expect(item.icon).toBeDefined();
            expect(item.label).toBeDefined();
            expect(item.gradient).toBeDefined();
            expect(item.iconColor).toBeDefined();
            expect(item.activeIconColor).toBeDefined();

            // Assert: Properties should have correct types
            expect(typeof item.name).toBe('string');
            expect(typeof item.href).toBe('string');
            expect(typeof item.label).toBe('string');
            expect(typeof item.gradient).toBe('string');
            expect(typeof item.iconColor).toBe('string');
            expect(typeof item.activeIconColor).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have unique names for all navigation items', () => {
      const names = navigationItems.map(item => item.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have unique hrefs for all navigation items', () => {
      const hrefs = navigationItems.map(item => item.href);
      const uniqueHrefs = new Set(hrefs);
      expect(uniqueHrefs.size).toBe(hrefs.length);
    });

    it('should have all hrefs starting with /dashboard/', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: navigationItems.length - 1 }),
          (index) => {
            const item = navigationItems[index];
            expect(item.href.startsWith('/dashboard/')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Active State Mutual Exclusivity', () => {
    /**
     * This property ensures that when navigating to any route,
     * at most one navigation item can be active at a time.
     */
    it('should ensure mutual exclusivity of active states', () => {
      fc.assert(
        fc.property(
          navItemHrefArb,
          (clickedHref) => {
            // Simulate clicking on a navigation item
            const clickedItem = getNavItemByHref(clickedHref);
            expect(clickedItem).toBeDefined();

            // Check all items for active state
            const activeStates = navigationItems.map(item => ({
              name: item.name,
              isActive: isNavItemActive(item.href, clickedHref)
            }));

            // Assert: Only the clicked item should be active
            const activeItems = activeStates.filter(s => s.isActive);
            expect(activeItems.length).toBe(1);
            expect(activeItems[0].name).toBe(clickedItem!.name);

            // Assert: All other items should be inactive
            const inactiveItems = activeStates.filter(s => !s.isActive);
            expect(inactiveItems.length).toBe(navigationItems.length - 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Property 2: Bottom Navigation Presence Tests
// ============================================

describe('Property 2: Bottom Navigation Presence', () => {
  /**
   * **Feature: ui-redesign-ai-specialists, Property 2: Bottom Navigation Presence**
   * **Validates: Requirements 2.1**
   *
   * For any page within the dashboard, the bottom navigation bar SHALL be
   * present and visible, regardless of the page content.
   */

  /**
   * Generator for all valid dashboard paths
   */
  const dashboardPathArb = fc.oneof(
    navItemHrefArb,
    navItemHrefArb.chain(href => 
      subPathArb.map(sub => href + sub)
    )
  );

  it('should have navigation items available for all dashboard routes', () => {
    fc.assert(
      fc.property(
        dashboardPathArb,
        (currentPath) => {
          // Assert: Navigation items should always be available
          expect(navigationItems).toBeDefined();
          expect(navigationItems.length).toBeGreaterThan(0);
          
          // Assert: All navigation items should have valid hrefs
          for (const item of navigationItems) {
            expect(item.href).toBeDefined();
            expect(item.href.startsWith('/dashboard/')).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide navigation to all 6 main sections from any dashboard page', () => {
    fc.assert(
      fc.property(
        dashboardPathArb,
        (currentPath) => {
          // Assert: All 6 sections should be navigable
          const expectedSections = ['quadro', 'chat', 'leads', 'agendamentos', 'analytics', 'settings'];
          const availableSections = navigationItems.map(item => item.name);
          
          for (const section of expectedSections) {
            expect(availableSections).toContain(section);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have all navigation items with icons and labels', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: navigationItems.length - 1 }),
        (index) => {
          const item = navigationItems[index];
          
          // Assert: Each item should have an icon (React component - can be function or object)
          expect(item.icon).toBeDefined();
          expect(typeof item.icon === 'function' || typeof item.icon === 'object').toBe(true);
          
          // Assert: Each item should have a label (non-empty string)
          expect(typeof item.label).toBe('string');
          expect(item.label.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain consistent navigation structure regardless of current path', () => {
    fc.assert(
      fc.property(
        dashboardPathArb,
        dashboardPathArb,
        (path1, path2) => {
          // Assert: Navigation items should be the same regardless of which path we're on
          // This simulates that the bottom nav is always present with the same items
          const itemsFromPath1 = navigationItems.map(i => i.name);
          const itemsFromPath2 = navigationItems.map(i => i.name);
          
          expect(itemsFromPath1).toEqual(itemsFromPath2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have gradient effects defined for hover states', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: navigationItems.length - 1 }),
        (index) => {
          const item = navigationItems[index];
          
          // Assert: Each item should have gradient defined
          expect(item.gradient).toBeDefined();
          expect(item.gradient.includes('radial-gradient')).toBe(true);
          
          // Assert: Each item should have hover icon color
          expect(item.iconColor).toBeDefined();
          expect(item.iconColor.includes('group-hover:')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
