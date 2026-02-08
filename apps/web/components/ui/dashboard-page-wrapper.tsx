'use client';

/**
 * DashboardPageWrapper Component
 * 
 * Provides consistent lazy loading behavior for dashboard pages.
 * Wraps page content with PageTransition and appropriate skeleton loaders.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { PageTransition, SuspensePageTransition } from './page-transition';
import { 
  DashboardSkeleton, 
  TableSkeleton, 
  ListSkeleton, 
  ChartSkeleton,
  CardSkeleton 
} from './skeleton-loaders';
import { cn } from '@/lib/utils';

export type PageSkeletonType = 'default' | 'analytics' | 'list' | 'table' | 'chat' | 'calendar' | 'settings';

export interface DashboardPageWrapperProps {
  /** The page content */
  children: React.ReactNode;
  /** Type of skeleton to show during loading */
  skeletonType?: PageSkeletonType;
  /** Whether the page is currently loading */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Animation duration in milliseconds */
  animationDuration?: number;
}

/**
 * Get the appropriate skeleton component based on page type
 */
function getSkeletonForType(type: PageSkeletonType): React.ReactNode {
  switch (type) {
    case 'analytics':
      return <DashboardSkeleton layout="analytics" />;
    case 'list':
      return <DashboardSkeleton layout="list" />;
    case 'table':
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          </div>
          <TableSkeleton columns={6} rows={8} />
        </div>
      );
    case 'chat':
      return (
        <div className="flex h-[calc(100vh-200px)] gap-4">
          {/* Sidebar skeleton */}
          <div className="w-80 border rounded-lg p-4 space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <ListSkeleton items={6} showAvatar showAction={false} />
          </div>
          {/* Chat area skeleton */}
          <div className="flex-1 border rounded-lg flex flex-col">
            <div className="h-16 border-b p-4 flex items-center gap-3">
              <div className="h-10 w-10 bg-muted animate-pulse rounded-full" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              </div>
            </div>
            <div className="flex-1 p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                  <div className={cn(
                    "h-12 bg-muted animate-pulse rounded-2xl",
                    i % 2 === 0 ? "w-2/3" : "w-1/2"
                  )} />
                </div>
              ))}
            </div>
            <div className="h-16 border-t p-4">
              <div className="h-10 bg-muted animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      );
    case 'calendar':
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-muted animate-pulse rounded" />
              <div className="h-4 w-64 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          </div>
          {/* Calendar grid skeleton */}
          <div className="border rounded-lg p-4">
            <div className="grid grid-cols-7 gap-2 mb-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded text-center" />
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted/50 animate-pulse rounded border" />
              ))}
            </div>
          </div>
        </div>
      );
    case 'settings':
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-10 w-40 bg-muted animate-pulse rounded" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CardSkeleton contentLines={4} />
            <CardSkeleton contentLines={4} />
          </div>
        </div>
      );
    default:
      return <DashboardSkeleton layout="default" />;
  }
}

/**
 * Infer skeleton type from pathname
 */
function inferSkeletonType(pathname: string): PageSkeletonType {
  if (pathname.includes('/analytics')) return 'analytics';
  if (pathname.includes('/leads')) return 'list';
  if (pathname.includes('/chat')) return 'chat';
  if (pathname.includes('/agendamentos')) return 'calendar';
  if (pathname.includes('/settings')) return 'settings';
  if (pathname.includes('/quadro')) return 'default';
  return 'default';
}

/**
 * DashboardPageWrapper provides consistent lazy loading behavior
 * for all dashboard pages with appropriate skeleton loaders.
 * 
 * @example
 * ```tsx
 * // In a page component
 * export default function LeadsPage() {
 *   const [loading, setLoading] = useState(true);
 *   
 *   return (
 *     <DashboardPageWrapper isLoading={loading} skeletonType="list">
 *       <LeadsContent />
 *     </DashboardPageWrapper>
 *   );
 * }
 * ```
 */
export function DashboardPageWrapper({
  children,
  skeletonType,
  isLoading = false,
  className,
  animationDuration = 300,
}: DashboardPageWrapperProps) {
  const pathname = usePathname();
  const effectiveSkeletonType = skeletonType || inferSkeletonType(pathname);
  const skeleton = getSkeletonForType(effectiveSkeletonType);

  return (
    <PageTransition
      isLoading={isLoading}
      fallback={skeleton}
      className={className}
      animationDuration={animationDuration}
    >
      {children}
    </PageTransition>
  );
}

/**
 * SuspenseDashboardPageWrapper uses React Suspense for automatic
 * loading state management with lazy-loaded components.
 */
export interface SuspenseDashboardPageWrapperProps {
  /** The page content (should be a lazy-loaded component) */
  children: React.ReactNode;
  /** Type of skeleton to show during loading */
  skeletonType?: PageSkeletonType;
  /** Additional CSS classes */
  className?: string;
  /** Animation duration in milliseconds */
  animationDuration?: number;
}

export function SuspenseDashboardPageWrapper({
  children,
  skeletonType,
  className,
  animationDuration = 300,
}: SuspenseDashboardPageWrapperProps) {
  const pathname = usePathname();
  const effectiveSkeletonType = skeletonType || inferSkeletonType(pathname);
  const skeleton = getSkeletonForType(effectiveSkeletonType);

  return (
    <SuspensePageTransition
      fallback={skeleton}
      className={className}
      animationDuration={animationDuration}
    >
      {children}
    </SuspensePageTransition>
  );
}

export default DashboardPageWrapper;
