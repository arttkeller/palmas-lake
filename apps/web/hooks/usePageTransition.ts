'use client';

/**
 * usePageTransition Hook
 * 
 * Detects route changes and manages loading state for page transitions.
 * 
 * Requirements: 4.1, 4.2
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';

export interface UsePageTransitionResult {
  /** Whether a page transition is currently in progress */
  isTransitioning: boolean;
  /** The current path */
  currentPath: string;
  /** The previous path (null if first load) */
  previousPath: string | null;
  /** Manually start a transition */
  startTransition: () => void;
  /** Manually end a transition */
  endTransition: () => void;
  /** Whether this is the initial page load */
  isInitialLoad: boolean;
}

export interface UsePageTransitionOptions {
  /** Minimum duration for the transition in milliseconds */
  minDuration?: number;
  /** Maximum duration for the transition in milliseconds */
  maxDuration?: number;
  /** Callback when transition starts */
  onTransitionStart?: (from: string | null, to: string) => void;
  /** Callback when transition ends */
  onTransitionEnd?: (from: string | null, to: string) => void;
}

/**
 * Hook to detect route changes and manage loading state for page transitions.
 * 
 * @param options - Configuration options for the transition behavior
 * @returns Object containing transition state and control functions
 * 
 * @example
 * ```tsx
 * const { isTransitioning, currentPath, previousPath } = usePageTransition({
 *   minDuration: 200,
 *   onTransitionStart: (from, to) => console.log(`Navigating from ${from} to ${to}`),
 * });
 * 
 * return (
 *   <PageTransition isLoading={isTransitioning} fallback={<Skeleton />}>
 *     <Content />
 *   </PageTransition>
 * );
 * ```
 */
export function usePageTransition(
  options: UsePageTransitionOptions = {}
): UsePageTransitionResult {
  const {
    minDuration = 150,
    maxDuration = 5000,
    onTransitionStart,
    onTransitionEnd,
  } = options;

  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [previousPath, setPreviousPath] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  const currentPathRef = useRef(pathname);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const minDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canEndTransitionRef = useRef(true);

  // Build full path including search params
  const fullPath = searchParams?.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  // Cleanup timeouts
  const clearTimeouts = useCallback(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (minDurationTimeoutRef.current) {
      clearTimeout(minDurationTimeoutRef.current);
      minDurationTimeoutRef.current = null;
    }
  }, []);

  // Start transition manually
  const startTransition = useCallback(() => {
    clearTimeouts();
    setIsTransitioning(true);
    canEndTransitionRef.current = false;

    // Set minimum duration before allowing transition to end
    minDurationTimeoutRef.current = setTimeout(() => {
      canEndTransitionRef.current = true;
    }, minDuration);

    // Set maximum duration timeout
    transitionTimeoutRef.current = setTimeout(() => {
      setIsTransitioning(false);
    }, maxDuration);
  }, [clearTimeouts, minDuration, maxDuration]);

  // End transition manually
  const endTransition = useCallback(() => {
    if (canEndTransitionRef.current) {
      clearTimeouts();
      setIsTransitioning(false);
    } else {
      // Wait for minimum duration to complete
      const checkInterval = setInterval(() => {
        if (canEndTransitionRef.current) {
          clearInterval(checkInterval);
          clearTimeouts();
          setIsTransitioning(false);
        }
      }, 50);
      
      // Safety cleanup
      setTimeout(() => clearInterval(checkInterval), maxDuration);
    }
  }, [clearTimeouts, maxDuration]);

  // Detect route changes
  useEffect(() => {
    const previousPathValue = currentPathRef.current;
    
    // Check if path actually changed
    if (previousPathValue !== pathname) {
      // Update refs and state
      setPreviousPath(previousPathValue);
      currentPathRef.current = pathname;
      
      // Start transition
      startTransition();
      
      // Call callback
      onTransitionStart?.(previousPathValue, pathname);
      
      // Mark initial load as complete
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [pathname, startTransition, onTransitionStart, isInitialLoad]);

  // Auto-end transition after content loads
  useEffect(() => {
    if (isTransitioning) {
      // Use requestIdleCallback or setTimeout to detect when content is ready
      const endTransitionWhenReady = () => {
        if (canEndTransitionRef.current) {
          endTransition();
          onTransitionEnd?.(previousPath, pathname);
        } else {
          // Retry after minimum duration
          setTimeout(endTransitionWhenReady, minDuration);
        }
      };

      // Wait for next frame to ensure content is rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(endTransitionWhenReady);
      });
    }
  }, [isTransitioning, endTransition, onTransitionEnd, previousPath, pathname, minDuration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  return {
    isTransitioning,
    currentPath: fullPath,
    previousPath,
    startTransition,
    endTransition,
    isInitialLoad,
  };
}

/**
 * Simplified hook that just returns the loading state
 */
export function useIsPageTransitioning(): boolean {
  const { isTransitioning } = usePageTransition();
  return isTransitioning;
}

export default usePageTransition;
