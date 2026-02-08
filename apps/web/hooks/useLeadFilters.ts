'use client';

import { useState, useCallback, useMemo } from 'react';
import type { LeadTemperature, NonNullLeadTemperature } from '@/lib/temperature-config';
import type { Lead } from '@/types/lead';

/**
 * Return type for the useLeadFilters hook
 */
export interface UseLeadFiltersReturn {
  /** Currently active temperature filter (single-select) */
  activeFilter: NonNullLeadTemperature | null;
  /** @deprecated Use activeFilter instead. Kept for backward compatibility. */
  activeFilters: NonNullLeadTemperature[];
  /** Toggle a temperature filter on/off (single-select: replaces current) */
  toggleFilter: (temp: NonNullLeadTemperature) => void;
  /** Clear the active filter */
  clearFilters: () => void;
  /** Filter leads based on active filter */
  filterLeads: (leads: Lead[]) => Lead[];
  /** Check if a specific temperature filter is active */
  isFilterActive: (temp: NonNullLeadTemperature) => boolean;
}

/**
 * Hook for managing lead temperature filters
 * 
 * Implements single-select logic: only one filter can be active at a time.
 * Clicking a new filter replaces the current one; clicking the active filter clears it.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 * 
 * @example
 * const { activeFilter, toggleFilter, filterLeads } = useLeadFilters();
 * 
 * // Toggle hot filter
 * toggleFilter('hot');
 * 
 * // Filter leads
 * const filteredLeads = filterLeads(allLeads);
 */
export function useLeadFilters(): UseLeadFiltersReturn {
  const [activeFilter, setActiveFilter] = useState<NonNullLeadTemperature | null>(null);

  /**
   * Toggle a temperature filter on/off (single-select)
   * Requirements: 2.1, 2.2
   */
  const toggleFilter = useCallback((temp: NonNullLeadTemperature) => {
    setActiveFilter(current => {
      if (current === temp) {
        // Same filter clicked: deactivate (Requirements 2.2)
        return null;
      }
      // Different filter clicked: replace (Requirements 2.1)
      return temp;
    });
  }, []);

  /**
   * Clear the active filter
   */
  const clearFilters = useCallback(() => {
    setActiveFilter(null);
  }, []);

  /**
   * Check if a specific temperature filter is active
   */
  const isFilterActive = useCallback((temp: NonNullLeadTemperature): boolean => {
    return activeFilter === temp;
  }, [activeFilter]);

  /**
   * Filter leads based on active filter
   * Requirements: 2.3, 2.4
   * 
   * When no filter is active, all leads are returned.
   * When a filter is active, only leads matching the selected temperature are returned.
   */
  const filterLeads = useCallback((leads: Lead[]): Lead[] => {
    return filterLeadsByTemperature(leads, activeFilter);
  }, [activeFilter]);

  // Backward-compatible array form for components not yet migrated
  const activeFilters = useMemo<NonNullLeadTemperature[]>(
    () => activeFilter ? [activeFilter] : [],
    [activeFilter]
  );

  return {
    activeFilter,
    activeFilters,
    toggleFilter,
    clearFilters,
    filterLeads,
    isFilterActive,
  };
}

/**
 * Pure function version of filterLeads for testing
 * This allows testing the filter logic without React hooks
 */
export function filterLeadsByTemperature(
  leads: Lead[],
  activeFilter: NonNullLeadTemperature | null
): Lead[] {
  // No filter active = show all leads
  if (activeFilter === null) {
    return leads;
  }

  // Filter leads matching the single active filter
  return leads.filter(lead => {
    if (!lead.temperature) {
      return false;
    }
    return lead.temperature === activeFilter;
  });
}

/**
 * Pure function to toggle a single-select filter
 * Returns the new filter value: null if same filter clicked, otherwise the new filter
 * Requirements: 2.1, 2.2, 2.4
 */
export function toggleFilterSingleSelect(
  currentFilter: NonNullLeadTemperature | null,
  temp: NonNullLeadTemperature
): NonNullLeadTemperature | null {
  if (currentFilter === temp) {
    return null;
  }
  return temp;
}

/**
 * @deprecated Use toggleFilterSingleSelect instead. Kept for backward compatibility.
 * Pure function to toggle a filter in a list
 * Returns new array with filter toggled
 */
export function toggleFilterInList(
  currentFilters: NonNullLeadTemperature[],
  temp: NonNullLeadTemperature
): NonNullLeadTemperature[] {
  const current = currentFilters.length > 0 ? currentFilters[0] : null;
  const result = toggleFilterSingleSelect(current, temp);
  return result ? [result] : [];
}

/**
 * Calculate lead counts by temperature
 * Used for badge display in filter bar
 * 
 * Requirements: 2.5
 */
export function calculateLeadCountsByTemperature(
  leads: Lead[]
): Record<NonNullLeadTemperature, number> {
  const counts: Record<NonNullLeadTemperature, number> = {
    hot: 0,
    warm: 0,
    cold: 0,
  };

  for (const lead of leads) {
    if (lead.temperature && lead.temperature in counts) {
      counts[lead.temperature as NonNullLeadTemperature]++;
    }
  }

  return counts;
}

/**
 * Calculate filtered lead counts by temperature
 * Returns counts only for leads that pass the current filter
 * 
 * Requirements: 2.5
 */
export function calculateFilteredLeadCounts(
  leads: Lead[],
  activeFilter: NonNullLeadTemperature | null
): Record<NonNullLeadTemperature, number> {
  // First filter the leads
  const filteredLeads = filterLeadsByTemperature(leads, activeFilter);
  
  // Then count by temperature
  return calculateLeadCountsByTemperature(filteredLeads);
}
