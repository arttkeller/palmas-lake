'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  AnalyticsCacheEntry,
  DashboardMetrics,
  MetricType,
  createPlaceholderMetrics,
  isCacheStale,
} from '@/types/analytics-cache';
import { apiFetch } from '@/lib/api-fetch';

// Schema for Palmas Lake project
const SCHEMA = 'palmaslake-agno';
const TABLE = 'analytics_cache';

// Create a singleton Supabase client to avoid re-creating on every render
let supabaseInstance: ReturnType<typeof createClient> | null = null;
const getSupabaseClient = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClient();
  }
  return supabaseInstance;
};

export interface UseAnalyticsCacheOptions {
  metricType?: MetricType;
  onUpdate?: (data: DashboardMetrics) => void;
  maxStaleMinutes?: number;
  enabled?: boolean;
  period?: string;
}

// Configuration constants
const FETCH_TIMEOUT_MS = 3000;      // Timeout máximo para fetch (Requirements: 1.1)
const POLL_INTERVAL_MS = 3000;      // Polling interval when calculating (Requirements: 4.1, 4.2)
const POLL_TIMEOUT_MS = 15000;      // Max polling duration (Requirements: 1.4)

export interface UseAnalyticsCacheResult {
  data: DashboardMetrics;
  isStale: boolean;
  lastUpdate: Date | null;
  calculationDurationMs: number | null;
  triggerSource: string | null;
  previousData: DashboardMetrics | null;
  isLoading: boolean;
  isRefreshing: boolean;  // Indicates if a refresh is in progress (Requirements: 4.3)
  isCalculating: boolean; // Indicates if backend is calculating metrics (Requirements: 1.2, 3.1)
  error: Error | null;
  refresh: () => Promise<void>;
  isConnected: boolean;
  hasTimedOut: boolean;  // Indicates if fetch timed out (Requirements: 1.1, 3.2)
}

/**
 * Hook for subscribing to analytics cache via Supabase Realtime
 * 
 * This hook provides:
 * - Real-time subscription to analytics_cache table updates
 * - Local state management with cached data
 * - Stale data detection based on calculated_at timestamp
 * - Manual refresh function to trigger immediate recalculation
 * 
 * Requirements: 1.3, 1.4, 4.1, 4.2
 * 
 * @example
 * const { data, isStale, lastUpdate, refresh } = useAnalyticsCache({
 *   metricType: 'dashboard',
 *   onUpdate: (newData) => console.log('Updated:', newData),
 * });
 */
export function useAnalyticsCache(options: UseAnalyticsCacheOptions = {}): UseAnalyticsCacheResult {
  const {
    metricType = 'dashboard',
    onUpdate,
    maxStaleMinutes = 5,
    enabled = true,
    period = 'today',
  } = options;

  // State
  const [data, setData] = useState<DashboardMetrics>(createPlaceholderMetrics());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [calculationDurationMs, setCalculationDurationMs] = useState<number | null>(null);
  const [triggerSource, setTriggerSource] = useState<string | null>(null);
  const [previousData, setPreviousData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);  // Track refresh state separately (Requirements: 4.3)
  const [isCalculating, setIsCalculating] = useState(false); // Track backend calculation state (Requirements: 1.2, 3.1)
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);  // Track timeout state (Requirements: 1.1, 3.2)

  // Ref to prevent multiple simultaneous refresh calls (Requirements: 4.3)
  const isRefreshingRef = useRef(false);

  // Ref to track if auto-refresh on empty cache has been attempted (Requirements: 1.3)
  const hasAutoRefreshedRef = useRef(false);

  // Refs for polling mechanism (Requirements: 1.2, 1.4)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref to track when a refresh was triggered — polling only accepts
  // data with calculated_at newer than this timestamp.
  const refreshTriggeredAtRef = useRef<number | null>(null);

  // Refs
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Ref for realtime callback to avoid re-subscription loops
  const handleRealtimeUpdateRef = useRef<((payload: RealtimePostgresChangesPayload<AnalyticsCacheEntry>) => void) | undefined>(undefined);
  // Ref for onUpdate callback to avoid re-fetch loops
  const onUpdateRef = useRef(onUpdate);
  
  // Keep onUpdate ref updated
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  
  // Use singleton Supabase client to prevent re-subscription loops
  const supabase = useMemo(() => getSupabaseClient(), []);

  // Compute isStale based on lastUpdate
  const isStale = lastUpdate ? isCacheStale(lastUpdate.toISOString(), maxStaleMinutes) : true;

  /**
   * Updates local state from a cache entry
   */
  const updateFromCacheEntry = useCallback((entry: AnalyticsCacheEntry) => {
    if (entry.data) {
      setData(entry.data);
      onUpdateRef.current?.(entry.data);
    }
    if (entry.calculated_at) {
      setLastUpdate(new Date(entry.calculated_at));
    }
    if (entry.calculation_duration_ms !== undefined) {
      setCalculationDurationMs(entry.calculation_duration_ms);
    }
    if (entry.trigger_source) {
      setTriggerSource(entry.trigger_source);
    }
    if (entry.previous_data !== undefined) {
      setPreviousData(entry.previous_data);
    }
  }, []); // No dependencies - uses ref for onUpdate

  /**
   * Fetches initial cached data from the API
   * Requirements: 1.1 - Provide cached metrics within 100ms
   * Requirements: 3.1, 3.2, 3.3, 3.4 - Handle all error scenarios gracefully
   */
  const fetchInitialData = useCallback(async () => {
    if (!enabled) return;

    // Use AbortController for timeout - fail fast if API is not available
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      setIsLoading(true);
      setError(null);
      setHasTimedOut(false);

      const response = await apiFetch(
        `/api/analytics/cached?metric_type=${metricType}&period=${period}`,
        { signal: controller.signal }
      );

      // Clear timeout on successful response
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Requirements: 3.3 - Log error and continue with placeholder data
        console.warn(`[useAnalyticsCache] API error: ${response.status} - ${response.statusText}`);
        return; // Continue with placeholder data
      }

      const result = await response.json();

      // Requirements: 3.1 - Log the full API response for debugging
      console.log('[useAnalyticsCache] API response from /api/analytics/cached:', {
        hasData: result.data !== null && result.data !== undefined,
        totalLeads: result.data?.total_leads ?? null,
        calculatedAt: result.calculated_at ?? null,
        calculationDurationMs: result.calculation_duration_ms ?? null,
        isStale: result.is_stale ?? null,
        triggerSource: result.trigger_source ?? null,
        isCalculating: result.is_calculating ?? null,
      });

      if (result.data) {
        updateFromCacheEntry({
          id: '',
          metric_type: metricType,
          data: result.data,
          calculated_at: result.calculated_at || new Date().toISOString(),
          calculation_duration_ms: result.calculation_duration_ms || 0,
          trigger_source: result.trigger_source || 'initial_load',
          previous_data: null,
          created_at: '',
          updated_at: '',
        });
        setIsCalculating(false);
        stopPolling();
      } else {
        // Requirements: 1.2 - When data is null or is_calculating, track calculating state
        const calculating = result.is_calculating === true || result.data === null;
        setIsCalculating(calculating);
        // Requirements: 1.3 - Polling will start via useEffect when isCalculating becomes true
        console.log('[useAnalyticsCache] API returned null data, isCalculating set to true');
      }
    } catch (err) {
      // Clear timeout to prevent memory leaks
      clearTimeout(timeoutId);

      // Requirements: 3.1, 3.2 - Handle network errors and timeouts gracefully
      if (err instanceof Error && err.name === 'AbortError') {
        // Requirements: 3.2 - Set hasTimedOut when AbortController aborts
        setHasTimedOut(true);
        console.warn('[useAnalyticsCache] Fetch timed out after', FETCH_TIMEOUT_MS, 'ms');
      } else {
        // Requirements: 3.1 - Log network errors for debugging
        console.warn('[useAnalyticsCache] Network error:', err instanceof Error ? err.message : 'Unknown error');
      }
      // Requirements: 3.1, 3.3 - Continue with placeholder data on any error (don't re-throw)
    } finally {
      // Requirements: 3.4 - CRITICAL: Always set isLoading to false
      // This guarantees loading state terminates regardless of outcome
      setIsLoading(false);
    }
  }, [enabled, metricType, period, updateFromCacheEntry]);

  /**
   * Stops the polling mechanism and clears all timers
   * Requirements: 1.4 - Stop polling on timeout or when data arrives
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  /**
   * Starts polling the cached endpoint every 2 seconds
   * Requirements: 1.2 - Poll until data is available
   * Requirements: 1.4 - Stop after 15 seconds timeout
   */
  const startPolling = useCallback(() => {
    // Don't start if already polling
    if (pollingIntervalRef.current) return;

    console.log('[useAnalyticsCache] Starting polling (every 2s, max 15s)');

    // Set up the polling interval
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await apiFetch(
          `/api/analytics/cached?metric_type=${metricType}&period=${period}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) return;

        const result = await response.json();

        if (result.data) {
          // If a refresh was triggered, only accept data calculated AFTER the refresh
          const refreshTime = refreshTriggeredAtRef.current;
          if (refreshTime && result.calculated_at) {
            const dataTime = new Date(result.calculated_at).getTime();
            if (dataTime < refreshTime) {
              // Stale cached data from before the refresh — keep polling
              console.log('[useAnalyticsCache] Polling: data is stale (pre-refresh), continuing...');
              return;
            }
          }

          console.log('[useAnalyticsCache] Polling received fresh data, stopping poll');
          refreshTriggeredAtRef.current = null; // Clear refresh marker
          updateFromCacheEntry({
            id: '',
            metric_type: metricType,
            data: result.data,
            calculated_at: result.calculated_at || new Date().toISOString(),
            calculation_duration_ms: result.calculation_duration_ms || 0,
            trigger_source: result.trigger_source || 'polling',
            previous_data: null,
            created_at: '',
            updated_at: '',
          });
          setIsCalculating(false);
          stopPolling();
        }
      } catch {
        // Silently continue polling on fetch errors
      }
    }, POLL_INTERVAL_MS);

    // Requirements: 1.4 - Set a max timeout to stop polling
    pollingTimeoutRef.current = setTimeout(() => {
      console.log('[useAnalyticsCache] Polling timeout reached (15s), stopping');
      setIsCalculating(false);
      stopPolling();
    }, POLL_TIMEOUT_MS);
  }, [metricType, period, updateFromCacheEntry, stopPolling]);

  // Requirements: 1.2, 1.3 - Auto-start polling when backend is calculating
  // This ensures we pick up the computed data once the background task finishes,
  // even if the Realtime subscription hasn't fired.
  useEffect(() => {
    if (isCalculating && !pollingIntervalRef.current) {
      startPolling();
    }
    // Cleanup on unmount or when isCalculating turns false
    return () => {
      if (!isCalculating) {
        stopPolling();
      }
    };
  }, [isCalculating, startPolling, stopPolling]);

  /**
   * Triggers manual refresh, bypassing debounce
   * Requirements: 4.3 - Manual refresh triggers immediate calculation
   * - Shows loading indicator only on refresh button (non-blocking)
   * - Keeps page content visible during refresh
   * - Prevents multiple simultaneous refresh calls
   */
  const refresh = useCallback(async () => {
    // Prevent multiple simultaneous refresh calls (Requirements: 4.3)
    if (isRefreshingRef.current) {
      console.log('[useAnalyticsCache] Refresh already in progress, skipping');
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    // Mark as calculating so the polling useEffect kicks in
    setIsCalculating(true);
    
    try {
      setError(null);

      const response = await apiFetch(
        `/api/analytics/refresh?metric_type=${metricType}&period=${period}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error(`Failed to trigger refresh: ${response.statusText}`);
      }

      console.log('[useAnalyticsCache] Refresh triggered, polling will pick up fresh data');

      // Record when the refresh was triggered so polling can distinguish
      // stale cached data from fresh post-refresh data.
      refreshTriggeredAtRef.current = Date.now();

      // isCalculating is already true (set above), so the polling useEffect
      // will start automatically and keep checking every 3s until the backend
      // finishes the recalculation and updates the cache with newer data.
    } catch (err) {
      console.error('[useAnalyticsCache] Error triggering refresh:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    } finally {
      // Always reset refresh state (Requirements: 4.3)
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [metricType, period, fetchInitialData]);

  /**
   * Handles realtime updates from Supabase
   * Requirements: 1.3 - Frontend receives new data via Realtime without user action
   */
  const handleRealtimeUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<AnalyticsCacheEntry>) => {
      console.log('[useAnalyticsCache] Realtime update received:', payload.eventType);

      const newRecord = payload.new as AnalyticsCacheEntry;

      // Only process updates for our metric type
      if (newRecord && newRecord.metric_type === metricType) {
        // Requirements: 1.4 - Continue displaying previous cached data during processing
        // The previous data is preserved in state until new data arrives
        updateFromCacheEntry(newRecord);
      }
    },
    [metricType, updateFromCacheEntry]
  );

  // Keep the ref updated with the latest callback
  useEffect(() => {
    handleRealtimeUpdateRef.current = handleRealtimeUpdate;
  }, [handleRealtimeUpdate]);

  // Set up Realtime subscription
  useEffect(() => {
    if (!enabled) return;

    const channelName = `analytics-cache:${metricType}:${Date.now()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: SCHEMA,
          table: TABLE,
          filter: `metric_type=eq.${metricType}`,
        },
        (payload) => {
          // Use ref to always call the latest callback version
          handleRealtimeUpdateRef.current?.(payload as RealtimePostgresChangesPayload<AnalyticsCacheEntry>);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          console.log(`[useAnalyticsCache] ✅ Subscribed to ${SCHEMA}.${TABLE}`);
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          // Log as warning instead of error - this is expected when table doesn't exist or realtime is not enabled
          console.warn('[useAnalyticsCache] Channel error - realtime may not be enabled for this table');
        } else if (status === 'CLOSED') {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      console.log(`[useAnalyticsCache] Cleaning up channel "${channelName}"`);
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, metricType, supabase]);

  // Fetch initial data on mount
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Requirements: 1.3 - Auto-refresh when cache returns empty data
  // Triggers refresh() once if initial fetch returned null data
  useEffect(() => {
    if (!enabled || isLoading || hasAutoRefreshedRef.current) return;

    // If data is still placeholder (no lastUpdate means no real data was received)
    if (lastUpdate === null && !isRefreshing) {
      hasAutoRefreshedRef.current = true;
      console.log('[useAnalyticsCache] Cache empty after initial fetch, triggering auto-refresh');
      refresh().catch((err) => {
        console.warn('[useAnalyticsCache] Auto-refresh failed:', err instanceof Error ? err.message : 'Unknown error');
      });
    }
  }, [enabled, isLoading, lastUpdate, isRefreshing, refresh]);

  // Requirements: 1.2 - Start polling when isCalculating is true
  useEffect(() => {
    if (isCalculating) {
      startPolling();
    }
    return () => {
      stopPolling();
    };
  }, [isCalculating, startPolling, stopPolling]);

  return {
    data,
    isStale,
    lastUpdate,
    calculationDurationMs,
    triggerSource,
    previousData,
    isLoading,
    isRefreshing,
    isCalculating,
    error,
    refresh,
    isConnected,
    hasTimedOut,
  };
}

export default useAnalyticsCache;
