'use client';

/**
 * PageTransition Component
 * 
 * A wrapper component that provides smooth page transitions with React Suspense
 * and fade-in animations during lazy loading.
 * 
 * Requirements: 4.1, 4.2, 4.3
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageTransitionProps {
  /** The content to render */
  children: React.ReactNode;
  /** Whether the content is currently loading */
  isLoading?: boolean;
  /** Fallback content to show while loading */
  fallback?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Duration of the fade-in animation in milliseconds */
  animationDuration?: number;
}

/**
 * PageTransition wraps content with React Suspense and provides
 * smooth fade-in animations when content loads.
 * 
 * @example
 * ```tsx
 * <PageTransition fallback={<CardSkeleton />}>
 *   <DashboardContent />
 * </PageTransition>
 * ```
 */
export function PageTransition({
  children,
  isLoading = false,
  fallback,
  className,
  animationDuration = 300,
}: PageTransitionProps) {
  const [isVisible, setIsVisible] = React.useState(!isLoading);
  const [showContent, setShowContent] = React.useState(!isLoading);

  React.useEffect(() => {
    if (isLoading) {
      setIsVisible(false);
      setShowContent(false);
    } else {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setShowContent(true);
        // Trigger fade-in after content is mounted
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const transitionStyle = {
    '--transition-duration': `${animationDuration}ms`,
  } as React.CSSProperties;

  if (isLoading || !showContent) {
    return (
      <div className={cn('animate-pulse', className)}>
        {fallback}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'transition-opacity ease-in-out',
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{
        ...transitionStyle,
        transitionDuration: `${animationDuration}ms`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * SuspensePageTransition combines React Suspense with PageTransition
 * for automatic loading state management.
 */
export interface SuspensePageTransitionProps {
  /** The content to render (should be a lazy-loaded component) */
  children: React.ReactNode;
  /** Fallback content to show while loading */
  fallback?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Duration of the fade-in animation in milliseconds */
  animationDuration?: number;
}

export function SuspensePageTransition({
  children,
  fallback,
  className,
  animationDuration = 300,
}: SuspensePageTransitionProps) {
  return (
    <React.Suspense
      fallback={
        <div className={cn('animate-pulse', className)}>
          {fallback}
        </div>
      }
    >
      <FadeInWrapper className={className} animationDuration={animationDuration}>
        {children}
      </FadeInWrapper>
    </React.Suspense>
  );
}

/**
 * FadeInWrapper provides fade-in animation for content
 */
interface FadeInWrapperProps {
  children: React.ReactNode;
  className?: string;
  animationDuration?: number;
}

function FadeInWrapper({ children, className, animationDuration = 300 }: FadeInWrapperProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    // Trigger fade-in after mount
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, []);

  return (
    <div
      className={cn(
        'transition-opacity ease-in-out',
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{ transitionDuration: `${animationDuration}ms` }}
    >
      {children}
    </div>
  );
}

export default PageTransition;
